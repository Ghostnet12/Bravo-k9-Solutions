import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { schedulePdf } from '../server/schedule-pdf.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const fixtureSchedule = month => ({client:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'Fixture client'},month,firstTrainingDay:'2026-09-21',terms:[{stripeId:'term_fixture',serviceIds:['training'],dogCount:1,status:'active',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-11-01T00:00:00Z'}],visits:['2026-09-21','2026-09-28','2026-10-05'].filter(d=>d.startsWith(month)).map(date=>({bookingId:'bbbbbbbbbbbbbbbbbbbbbbbb',date,time:'10:00',dogName:'Fixture Dog',service:'training',status:'confirmed',paymentStatus:'paid',trainer:'Fixture Trainer'}))});
const app = express();
// Browser downloads may bypass Playwright page routing; serve a real PDF response.
app.get('/api/client-schedule', async (req, res) => {
  if (req.query.format === 'pdf') return res.type('application/pdf').set('Content-Disposition', 'attachment; filename="bravo-schedule.pdf"').send(await schedulePdf(fixtureSchedule(req.query.month)));
  res.json(fixtureSchedule(req.query.month));
});
app.use(express.static(dist)); app.get('/{*path}', (_req,res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [320, 390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700 });
        const page = await context.newPage(), errors = []; let printed = false, read = false, role = 'member', changeBody = null, saved = false;
        let singleVisitBody=null;
        let trainerAssigned='aaaaaaaaaaaaaaaaaaaaaaaa',trainerPending=false,trainerAccepted=null;
        let savedVisits=['2026-09-21','2026-09-28','2026-10-05'].map(date=>({date,time:'10:00',service:'training'}));
        page.on('pageerror', error => errors.push(error.message));
        await page.exposeFunction('recordPrint', () => { printed = true; });
        await page.addInitScript(() => { window.print = () => window.recordPrint(); });
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url()); let json = {};
          if (url.pathname === '/api/config') json = { connected: true, paymentsReady: true };
          else if (url.pathname === '/api/auth/me') json = { user: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Fixture client', role }, services: [] };
          else if (url.pathname === '/api/admin') json={role,bookings:[],team:[{_id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'Fixture Trainer'}],inbox:[],blocks:[],settings:{enabled:true,weekdays:[1,2,3,4,5],hours:['10:00']}};
          else if (url.pathname === '/api/admin/reviews') json={reviews:[]};
          else if (url.pathname === '/api/admin/services') json={services:[]};
          else if (url.pathname === '/api/admin/users') json={users:[{_id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'Fixture Trainer',role:'staff',email:'trainer@example.test'}]};
          else if (url.pathname === '/api/admin/memberships') json={memberships:{}};
          else if (url.pathname.endsWith('/clients')&&url.pathname.includes('/admin/trainers/')) json={bookings:[{_id:'bbbbbbbbbbbbbbbbbbbbbbbb',clientName:'Fixture client',clientId:'cccccccccccccccccccccccc',dogName:'Fixture Dog',dogCount:1,status:'confirmed',trainerAcceptanceRequired:trainerPending,trainerAcceptedAt:trainerAccepted,updatedAt:'2026-09-01T00:00:00.000Z'}]};
          else if (url.pathname.endsWith('/assignment')) {trainerAssigned=route.request().postDataJSON().staffId;trainerPending=true;trainerAccepted=null;json={ok:true};}
          else if (url.pathname.endsWith('/accept-client')) {assert.equal(route.request().postDataJSON().staffId,trainerAssigned);trainerPending=false;trainerAccepted='2026-09-13T12:00:00.000Z';json={ok:true,message:'Client accepted. Their saved schedule now shows the trainer’s name.'};}
          else if (url.pathname === '/api/team') json = {team:[{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'Fixture Trainer'}]};
          else if (url.pathname === '/api/client-schedule/visit') {singleVisitBody=route.request().postDataJSON();json={ok:true};}
          else if (url.pathname === '/api/client-schedule/changes') { changeBody=route.request().postDataJSON(); saved=true; savedVisits=savedVisits.filter(v=>!changeBody.removals.some(r=>r.date===v.date&&r.time===v.time)).concat(changeBody.additions.map(v=>({...v,service:'training'})));json={ok:true,message:'Schedule saved and note sent.'}; }
          else if (url.pathname === '/api/availability') {const start=new Date(url.searchParams.get('from')+'T12:00:00Z'),end=new Date(url.searchParams.get('to')+'T12:00:00Z'),days=[];for(let d=start;d<=end;d=new Date(d.getTime()+86400000))days.push({date:d.toISOString().slice(0,10),slots:[0,6].includes(d.getUTCDay())?[]:['10:00','13:00']});json={days,enabled:true};}

          else if (url.pathname === '/api/site-images') json = { images: {} };
          else if (url.pathname === '/api/notifications') json = { items: read ? [] : [{ id: 'term:fixture', body: 'Your membership expires tomorrow. Renew manually.', href: '/account', unread: !read }] };
          else if (url.pathname === '/api/notifications/read') { read = true; json = { ok: true }; }
          else if (url.pathname === '/api/client-schedule') {json=fixtureSchedule(url.searchParams.get('month'));json.visits=savedVisits.filter(v=>v.date.startsWith(json.month)).map(v=>({...fixtureSchedule(v.date.slice(0,7)).visits[0],...v,bookingId:'bbbbbbbbbbbbbbbbbbbbbbbb',dogName:'Fixture Dog',status:'confirmed',paymentStatus:'paid',trainer:trainerAssigned?(trainerPending?'Awaiting acceptance from Fixture Trainer':'Fixture Trainer'):'Awaiting assignment'}));json.trainingBookings=[{_id:'bbbbbbbbbbbbbbbbbbbbbbbb',dogName:'Fixture Dog',dogCount:1,staffId:trainerAssigned,trainerAcceptanceRequired:trainerPending,trainerAcceptedAt:trainerAccepted,updatedAt:'2026-09-01T00:00:00.000Z',visits:savedVisits}];}
          if (url.pathname === '/api/client-schedule' && url.searchParams.get('format') === 'pdf') return route.fulfill({ body: await schedulePdf(json), contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment; filename="bravo-schedule.pdf"' } });
          await route.fulfill({ json });
        });
        await page.goto(`${origin}/schedule?month=2026-09`);
        await page.getByRole('heading', { name: 'September 2026' }).waitFor();
        assert.equal(await page.locator('.schedule-visit').count(), 2);
        assert.equal(await page.locator('.saved-calendar button').count(), 30);
        await page.getByRole('button', {name:'Note to staff',exact:true}).click();
        await page.getByLabel('Note to all staff, administrators and owners').fill('Please call me about this visit.');
        await page.getByRole('button', {name:'Keep current visit',exact:true}).click();
        await page.getByRole('button',{name:'Cancel this visit',exact:true}).click();
        const optionalNote=page.getByLabel('Note to all staff, administrators and owners',{exact:true});
        await optionalNote.fill('');assert.equal(await optionalNote.getAttribute('required'),null);
        await page.getByRole('button',{name:'Confirm cancellation & notify team',exact:true}).click();
        await page.getByText('Saved. The Bravo team has been notified.',{exact:true}).waitFor();
        assert.equal(singleVisitBody.action,'cancel');assert.equal(singleVisitBody.note,'');
        assert.equal(await page.getByRole('button', { name: 'Print schedule', exact: true }).count(), 0);
        assert.equal(await page.locator('.saved-calendar button.has-visits').count(), 2);
        const monthBox = await page.getByLabel('Schedule month').boundingBox();
        const pdfBox = await page.getByRole('link', {name:'Download PDF',exact:true}).boundingBox();
        assert.ok(pdfBox.y >= monthBox.y + monthBox.height);
        const downloadEvent = page.waitForEvent('download');
        await page.getByRole('link', { name: 'Download PDF', exact: true }).click();
        const download = await downloadEvent; const file = await readFile(await download.path());
        assert.equal(file.subarray(0, 5).toString(), '%PDF-'); assert.ok(file.length > 2000);
        await download.saveAs(`test-results/schedule-${name}-${width}.pdf`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `test-results/schedule-${name}-${width}.png`, fullPage: true });
        await page.emulateMedia({ media: 'print' }); assert.equal(await page.locator('.app-header').isVisible(), false); assert.equal(await page.locator('.schedule-visit').first().isVisible(), true); await page.screenshot({ path: `test-results/schedule-print-${name}-${width}.png`, fullPage: true }); await page.emulateMedia({ media: 'screen' });
        await page.getByLabel('Schedule month').fill('2026-10'); await page.getByRole('button',{name:'Mon, Oct 5, 1 visit',exact:true}).waitFor(); assert.equal(await page.locator('.saved-calendar button.has-visits').count(),1);
        await page.getByLabel('Schedule month').fill('2026-11'); await page.getByText('No saved visits on this day.', { exact: false }).waitFor();
        if (width < 700) await page.getByRole('button', { name: /Menu/ }).click();
        await page.getByRole('button', { name: /Notifications/ }).filter({ hasText: 'Notifications' }).click();
        await page.locator('#notification-inbox').getByText('Read',{exact:true}).waitFor();
        assert.ok(read);assert.equal(await page.locator('.notification-count').count(),0);
        await page.getByRole('button',{name:'Close notifications',exact:true}).click();
        await page.getByRole('button',{name:'Notifications',exact:true}).click();
        await page.getByText('No unread notifications.',{exact:true}).waitFor();
        // Client toggles stay in a draft, work across months, and save together.
        await page.goto(`${origin}/schedule?month=2026-09`);
        await page.getByRole('button',{name:'Add Days and Times',exact:true}).click();
        const editor=page.getByRole('region',{name:'Add Days and Times',exact:true});
        await editor.getByRole('button',{name:/Tue, Sep 22,/}).click();
        await editor.getByRole('button',{name:/Tue, Sep 22,/}).click();
        assert.equal(await editor.getByRole('button',{name:/Tue, Sep 22,/}).getAttribute('aria-pressed'),'false');
        assert.equal(saved,false);
        await editor.getByRole('button',{name:/Tue, Sep 22,/}).click();

        await editor.getByRole('button',{name:'Next month',exact:true}).click();
        await editor.getByRole('button',{name:/Tue, Oct 6,/}).click();
        await editor.getByRole('button',{name:'10:00 AM',exact:true}).click();
        await editor.getByRole('button',{name:'Clear date selection',exact:true}).click();
        await editor.getByRole('button',{name:'Previous month',exact:true}).click();
        await editor.getByRole('button',{name:/Mon, Sep 21,/}).click();
        await editor.getByRole('button',{name:'Cancel visits on selected dates',exact:true}).click();
        await editor.getByLabel('Note to Bravo',{exact:true}).fill('Tuesday works better for us.');
        await editor.getByRole('button',{name:'Save changes',exact:true}).click();
        await page.getByText('Schedule saved and note sent.',{exact:true}).waitFor();
        assert.deepEqual(changeBody.additions.map(v=>v.date).sort(),['2026-09-22','2026-10-06']);
        assert.deepEqual(changeBody.removals,[{date:'2026-09-21',time:'10:00'}]);
        assert.equal(changeBody.openWeekends,false);
        await page.getByRole('button',{name:'Tue, Sep 22, 1 visit',exact:true}).waitFor();
        role = width === 320 ? 'staff' : 'owner'; saved=false;
        await page.goto(`${origin}/schedule?month=2026-09&client=cccccccccccccccccccccccc`);
        await page.getByRole('button',{name:'Add Days and Times',exact:true}).click();
        await editor.getByRole('button',{name:/Sat, Sep 19,/}).click();
        await editor.getByRole('button',{name:/Sun, Sep 20,/}).click();
        await editor.getByRole('button',{name:'10:00 AM',exact:true}).click();
        await editor.getByText('Change one date',{exact:true}).click();
        await editor.getByLabel('Date to change',{exact:true}).selectOption('2026-09-20');
        await editor.getByRole('checkbox',{name:'1:00 PM',exact:true}).check();
        await editor.getByRole('checkbox',{name:'10:00 AM',exact:true}).uncheck();
        await editor.getByRole('button',{name:'Clear date selection',exact:true}).click();
        await editor.getByRole('button',{name:/Tue, Sep 22,/}).click();
        await editor.getByRole('button',{name:'Cancel visits on selected dates',exact:true}).click();
        await editor.getByLabel('Note to the client',{exact:true}).fill('Sorry, we are sick Tuesday. Weekend sessions added.');
        assert.equal(saved,false);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({path:`test-results/calendar-edit-${name}-${width}.png`,fullPage:true});
        await editor.getByRole('button',{name:'Save changes',exact:true}).click();
        await page.getByText('Schedule saved and note sent.',{exact:true}).waitFor();
        assert.equal(changeBody.openWeekends,true);
        assert.deepEqual(changeBody.additions,[{date:'2026-09-19',time:'10:00'},{date:'2026-09-20',time:'13:00'}]);
        assert.deepEqual(changeBody.removals,[{date:'2026-09-22',time:'10:00'}]);
        await page.getByRole('button',{name:'Sun, Sep 20, 1 visit',exact:true}).waitFor();
        // Assign on the client's schedule, then accept in the trainer's profile/desk.
        trainerAssigned='';
        await page.goto(`${origin}/schedule?month=2026-09&client=cccccccccccccccccccccccc`);
        await page.getByText('Assign trainer & accept client',{exact:true}).click();
        await page.getByRole('button',{name:'Assign trainer',exact:true}).click();
        await page.getByText('Trainer: Awaiting acceptance from Fixture Trainer',{exact:true}).first().waitFor();
        await page.goto(`${origin}/admin?tab=${role==='owner'?'people':'schedule'}`);
        if(role==='owner')await page.locator('.owner-person>summary').filter({hasText:'Fixture Trainer'}).click();
        await page.getByText('Training clients · accept assignments',{exact:true}).click();
        await page.getByRole('button',{name:'Accept client',exact:true}).click();
        await page.getByText('Client accepted',{exact:true}).waitFor();
        assert.ok(trainerAccepted);assert.equal(trainerPending,false);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await page.screenshot({path:`test-results/trainer-acceptance-${name}-${width}.png`,fullPage:true});
        role='member';
        await page.goto(`${origin}/schedule?month=2026-09`);
        await page.getByText('Trainer: Fixture Trainer',{exact:true}).first().waitFor();
        assert.equal(await page.getByText('Assign trainer & accept client',{exact:true}).count(),0);
        assert.deepEqual(errors, []);
        await context.close(); console.log(`${name} ${width}: PDF, client/staff batch calendars, notes, trainer acceptance, notifications and layout passed`);
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
