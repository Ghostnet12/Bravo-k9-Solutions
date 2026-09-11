"""Exercise the exact production build with isolated synthetic API responses.
Never signs into or mutates the production application or customer database.
"""
import asyncio, json, os, threading
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'client/dist'
OUT = ROOT / 'browser-test-output'; OUT.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(DIST), **kw)
    def do_GET(self):
        if not (DIST / self.path.split('?')[0].lstrip('/')).is_file(): self.path = '/index.html'
        super().do_GET()
    def log_message(self, *a): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
ORIGIN = f'http://127.0.0.1:{server.server_port}'
TODAY = datetime.now(ZoneInfo('America/Chicago')).date()
UID = '111111111111111111111111'; CLIENT = '222222222222222222222222'
BOOKING = '333333333333333333333333'; GROUP = '444444444444444444444444'
async def run():
  async with async_playwright() as p:
    name = os.getenv('BRAVO_BROWSER', 'webkit'); report = []; errors = []
    browser = await getattr(p, name).launch(headless=True)
    context = await browser.new_context(viewport={'width':393,'height':852}, is_mobile=True, has_touch=True, timezone_id='America/Chicago')
    state = {'role':'member', 'cleared':set(), 'writes':[]}
    def user(): return {'id':UID,'name':'Test Trainer','email':'trainer@example.test','role':state['role'],'isPrimaryOwner':state['role']=='owner','phone':'5555550100','dogName':'Fixture Dog','address':'Fixture address','title':'Trainer','bio':'Saved profile'}
    def message(): return {'_id':'555555555555555555555555','authorName':'Fixture Client','senderName':'Fixture Client','role':'member','body':'Old test message','createdAt':'2026-09-11T12:00:00Z'}
    def booking(): return {'_id':BOOKING,'userId':{'name':'Fixture Client','email':'client@example.test'},'dogName':'Fixture Dog','phone':'5555550100','address':'Fixture address','serviceIds':['training'],'visits':[{'date':TODAY.isoformat(),'time':'09:00','service':'training'}],'status':'confirmed','paymentStatus':'paid','dogCount':1,'staffId':UID,'quote':{'monthlyCents':20000,'oneTimeCents':0,'dueNowCents':20000}}
    settings = {'enabled':True,'weekdays':[1,2,3,4,5],'hours':['09:00','10:00','11:00']}
    async def route(r):
      req = r.request; parsed = urlparse(req.url); path = parsed.path.removeprefix('/api'); q = parse_qs(parsed.query); data = {}
      if req.method != 'GET':
        body = req.post_data_json or {}; state['writes'].append((path,body))
        if path == '/chat/clear': state['cleared'].add(body['channel'])
        data = {'ok':True,'visibility':'your-view-only'}
      elif path == '/config': data = {'connected':True,'paymentsReady':False,'schedule':settings,'timezone':'America/Chicago'}
      elif path == '/auth/me': data = {'user':user(),'services':[],'subscriptions':[],'membership':{'active':True,'manual':True,'onlineAccess':True}}
      elif path == '/site-images': data = {'images':{}}
      elif path == '/trainers': data = {'trainers':[{'id':UID,'name':'Test Trainer','limit':5,'spotsRemaining':5,'full':False}]}
      elif path == '/availability':
        start = datetime.fromisoformat(q['from'][0]).date(); end = datetime.fromisoformat(q['to'][0]).date()
        data = {'days':[{'date':(start+timedelta(days=i)).isoformat(),'slots':['09:00','10:00','11:00','15:00','18:00']} for i in range((end-start).days+1)]}
      elif path == '/bookings': data = {'bookings':[booking()]}
      elif path == '/reviews/mine': data = {'review':None}
      elif path == '/team': data = {'team':[{'id':UID,'name':'Test Trainer','role':'staff'}]}
      elif path == '/admin': data = {'role':state['role'],'settings':settings,'bookings':[booking()],'blocks':[],'team':[{'_id':UID,'name':'Test Trainer','role':state['role']}],'inbox':[] if 'inbox' in state['cleared'] else [{'_id':CLIENT,'memberName':'Fixture Client','lastMessage':'Old test message'}]}
      elif path == '/admin/reviews': data = {'reviews':[]}
      elif path == '/admin/services': data = {'services':[]}
      elif path == '/admin/users': data = {'users':[{**user(),'_id':UID}]}
      elif path == '/admin/memberships': data = {'memberships':{}}
      elif path == '/admin/clients': data = {'clients':[{'_id':CLIENT,'name':'Fixture Client','email':'client@example.test','dogName':'Fixture Dog','phone':'5555550100','address':'Fixture address'}]}
      elif path == '/admin/lessons': data = {'lessons':[]}
      elif path == '/groups': data = {'groups':[{'_id':GROUP,'name':'Fixture group','ownerId':UID,'members':[UID,CLIENT]}],'people':[{'id':UID,'name':'Test Trainer'},{'id':CLIENT,'name':'Fixture Client'}]}
      elif path in ['/community','/direct'] or path.endswith('/messages'):
        channel = 'group' if path.endswith('/messages') else path[1:]
        data = {'messages':[] if channel in state['cleared'] or (channel=='direct' and 'inbox' in state['cleared']) else [message()]}
      await r.fulfill(status=200,content_type='application/json',body=json.dumps(data),headers={'Cache-Control':'private, no-store'})
    await context.route('**/api/**',route)
    page = await context.new_page(); page.on('pageerror',lambda e:errors.append(str(e))); page.on('dialog',lambda dialog:dialog.accept())
    try:
      await page.goto(ORIGIN+'/portal'); await expect(page.get_by_role('button',name='Find available days & times')).to_be_enabled()
      for width in [320,375,393,416,768,1440]:
        await page.set_viewport_size({'width':width,'height':900})
        dimensions = await page.locator('#choose-dates input[type=date]').evaluate_all('els=>els.map(el=>{const a=el.getBoundingClientRect(),b=el.closest("label").getBoundingClientRect(),c=el.closest(".panel").getBoundingClientRect(); return {right:a.right,labelRight:b.right,cardRight:c.right,width:a.width,labelWidth:b.width}})')
        assert len(dimensions)==2 and all(d['right']<=d['labelRight']+1 and d['right']<d['cardRight'] for d in dimensions), (width,dimensions)
        report.append({'test':'date fields fit label and card','width':width,'pass':True,'dimensions':dimensions})
      await page.set_viewport_size({'width':393,'height':852})
      await page.get_by_role('button',name='Find available days & times').click()
      await expect(page.locator('.date-grid button.available')).to_have_count(14); await expect(page.locator('.date-grid button.selected')).to_have_count(0)
      first = page.locator('.date-grid button').first
      await first.click(); await expect(first).to_have_attribute('aria-pressed','true')
      await first.click(); await expect(first).to_have_attribute('aria-pressed','false')
      for i in range(6): await page.locator('.date-grid button').nth(i).click()
      await expect(page.locator('.visit-row')).to_have_count(6)
      await page.get_by_role('button',name='Reset selections',exact=True).click()
      await expect(page.locator('.visit-row')).to_have_count(0); await expect(page.locator('.date-grid button.available')).to_have_count(14)
      await page.get_by_role('button',name='Make my schedule',exact=True).click(); await expect(page.locator('.date-grid button.selected')).to_have_count(4)
      await page.locator('.date-grid button.selected').first.click(); await expect(page.locator('.date-grid button.selected')).to_have_count(3)
      await page.get_by_role('button',name='Reset selections',exact=True).click(); await expect(page.locator('.date-grid button.selected')).to_have_count(0)
      await page.locator('#choose-dates').screenshot(path=str(OUT/f'{name}-scheduler-mobile.png'))
      await page.get_by_role('link',name='Your account',exact=True).click(); await page.wait_for_url('**/account')
      await page.evaluate("history.pushState({},'', '/portal?resume=1'); window.dispatchEvent(new PopStateEvent('popstate'))")
      await expect(page.locator('#choose-dates')).to_be_visible(); await expect(page.locator('.visit-row')).to_have_count(0)
      report.append({'test':'highlight only, tap-toggle, six manual days, random schedule, reset and resume','pass':True})
      for role in ['staff','owner']:
        state['role'] = role
        await page.goto(ORIGIN+'/admin'); await expect(page.get_by_role('button',name='Reset desk',exact=True)).to_be_visible()
        await page.get_by_label('Find a client or dog').fill('stale search'); await page.get_by_label('Visit date',exact=True).fill(TODAY.isoformat()); await page.get_by_label('View schedule').select_option(UID)
        await page.get_by_text('Add a visit for a client',exact=True).click(); await page.get_by_label('Client name or email').fill('Fixture')
        await page.get_by_role('button',name='Find client',exact=True).click(); await page.get_by_label('Choose client').select_option(CLIENT); await page.get_by_label('Private booking notes').fill('Unsaved notes')
        await page.get_by_role('button',name='Reset desk',exact=True).click()
        await expect(page.get_by_label('Find a client or dog')).to_have_value(''); await expect(page.get_by_label('Visit date',exact=True)).to_have_value(''); await expect(page.get_by_label('View schedule')).to_have_value('all')
        await expect(page.locator('.admin-bookings article')).to_have_count(1)
        await page.get_by_text('Add a visit for a client',exact=True).click(); await expect(page.get_by_label('Client name or email')).to_have_value(''); await expect(page.get_by_label('Choose client')).to_have_count(0)
        if role == 'owner':
          await page.get_by_role('button',name='People & access',exact=True).click(); await page.get_by_label('Find a person').fill('old selection')
          await page.get_by_role('button',name='Reset people view',exact=True).click(); await expect(page.get_by_label('Find a person')).to_have_value('')
        report.append({'test':'desk clears filters and child drafts, preserves saved booking','role':role,'pass':True})
      await page.goto(ORIGIN+'/community'); await expect(page.get_by_text('Old test message',exact=True)).to_be_visible(); await page.get_by_label('Your message').fill('unsent message')
      await page.get_by_role('button',name='Refresh & clear my chat',exact=True).click(); await expect(page.locator('.conversation-message')).to_have_count(0); await expect(page.get_by_label('Your message')).to_have_value('')
      await page.reload(); await expect(page.get_by_text('No uncleared messages. Say hello or ask a question.',exact=True)).to_be_visible()
      await page.wait_for_timeout(10500); await expect(page.locator('.conversation-message')).to_have_count(0)
      report.append({'test':'chat clears draft and stays cleared after reload and polling','pass':True})
      await page.goto(ORIGIN+'/admin'); await page.get_by_role('button',name='Messages',exact=True).click()
      await expect(page.get_by_label('Conversation',exact=True)).to_have_value(''); await page.get_by_label('Conversation',exact=True).select_option(CLIENT)
      await expect(page.locator('.direct-history .conversation-message')).to_have_count(1); await page.get_by_label('Reply',exact=True).fill('old reply')
      await page.get_by_role('button',name='Refresh & clear my inbox',exact=True).click(); await expect(page.get_by_text('No uncleared client messages. New messages will appear here.',exact=True)).to_be_visible()
      report.append({'test':'inbox explicit selection and persistent own-view clear','pass':True})
      assert not errors, errors
      assert all(path=='/chat/clear' for path,_ in state['writes']), state['writes']
      report.append({'test':'no page errors or booking/account/payment/global-delete writes','pass':True})
      print(json.dumps({'browser':name,'checks':len(report),'all_passed':True}))
    except Exception:
      await page.screenshot(path=str(OUT/f'{name}-failure.png'),full_page=True)
      raise
    finally:
      (OUT/f'{name}-report.json').write_text(json.dumps({'browser':name,'mock_api':True,'checks':report,'errors':errors},indent=2))
      await browser.close()
try: asyncio.run(run())
finally: server.shutdown()
