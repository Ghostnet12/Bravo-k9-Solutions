import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import app from '../server/app.js';
import { SERVICES } from '../shared/catalog.js';
import { resolveWorkshop } from '../shared/workshop-schedule.js';
import { DEFAULT_WORKSHOP } from '../shared/workshops.js';
import { DEFAULT_PROOF_VIDEOS } from '../shared/proof-videos.js';
import { DEFAULT_HERO_CAROUSEL } from '../shared/hero-carousel.js';
const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName,engine] of Object.entries({chromium,webkit})) {
    if(process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser=await engine.launch();
    try { for (const width of [768,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:width === 360 ? 'reduce' : 'no-preference'}), page=await context.newPage(), errors=[], browserDiagnostics=[];
      let discard=true, confirmations=0, failure=null;
      const navigation=[];
      page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigation.push({at:Date.now(),url:frame.url()});});
      await context.tracing.start({screenshots:true,snapshots:true});
      // Finish mocked responses before navigation; preserve cancellation diagnostics.
      const pendingApi=new Set();let lastApi=0;
      // Track the lifetime of the mocked responses themselves. Aborted old
      // documents do not reliably emit requestfinished in every browser.
      // Rendered-state assertions and runtime error listeners remain independent.
      async function settleApi(){const deadline=Date.now()+5000;while(pendingApi.size || Date.now()-lastApi<150){if(Date.now()>deadline)throw new Error('Mocked API requests did not settle: '+JSON.stringify([...pendingApi].map(request=>({url:request.url(),type:request.resourceType()}))));await new Promise(resolve=>setTimeout(resolve,25));}}
      async function visit(url,options){await settleApi();return page.goto(url,{waitUntil:'domcontentloaded',...options});}
      async function reload(){await settleApi();return page.reload({waitUntil:'domcontentloaded'});}
      // Wait for the requested reactive state, not merely the prior button in
      // the same location. Keep URL and rendered-page assertions independent
      // of unrelated media finishing a document's load event.
      async function follow(link, destination) {
        await settleApi();
        assert.equal(await link.getAttribute('href'),destination);
        await link.click();
        await page.waitForURL(origin+destination,{waitUntil:'domcontentloaded'});
        await page.locator('main h1').waitFor();
      }
      let owner=false, event={...DEFAULT_WORKSHOP}, entries={}, signup=null, failSave=false, failWorkshop=false;
      page.on('pageerror',error=>browserDiagnostics.push({message:error.message,stack:error.stack,url:page.url()}));
      await page.exposeFunction('reportDiscoveryError',message=>errors.push(message));
      await page.addInitScript(()=>{
        window.addEventListener('error',event=>{if(event instanceof ErrorEvent)void window.reportDiscoveryError(event.error?.stack||event.message).catch(()=>{});});
        window.addEventListener('unhandledrejection',event=>{void window.reportDiscoveryError(event.reason?.stack||event.reason?.message||String(event.reason)).catch(()=>{});});
      });
      page.on('dialog',dialog=>{confirmations++;return discard ? dialog.accept() : dialog.dismiss();});
      await context.route('**/api/**', async route => {
        const request=route.request();pendingApi.add(request);lastApi=Date.now();
        try {
        const url=new URL(route.request().url()), path=url.pathname, method=route.request().method();
        let json={};
        if(path==='/api/config')json={connected:true,paymentsReady:false,services:SERVICES,lessonLibrary:{open:false},schedule:{enabled:true,weekdays:[1,2,3,4,5],hours:['09:00']}};
        if(path==='/api/auth/me')json={user:owner?{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'David Northrop',role:'owner'}:null,services:[],membership:{active:false}};
        if(path==='/api/team')json={team:[{id:'bbbbbbbbbbbbbbbbbbbbbbbb',name:'David Northrop',role:'owner',title:'Founder / Lead Trainer'},{id:'cccccccccccccccccccccccc',name:'Ashley Leverock',role:'staff',title:'Trainer / Pitbull Specialist'}]};
        if(path==='/api/team/schedules')json={schedules:[]};
        if(path==='/api/lessons')json={lessons:[],sections:[]};
        if(path==='/api/reviews')json={reviews:[],average:0,count:0};
        if(path==='/api/hero-carousel')json={carousel:DEFAULT_HERO_CAROUSEL};
        if(path==='/api/hero-film')json={clips:[],nextCursor:null};
        if(path==='/api/hero-videos')json={clips:[],nextCursor:null};
        if(path==='/api/proof-videos')json={clips:DEFAULT_PROOF_VIDEOS,nextCursor:null};
        if(path==='/api/site-banner')json={alerts:[],revision:0,settings:{motion:'never'}};
        if(path==='/api/site-ads')json={ads:[],settings:{intervalSeconds:9},revision:0};
        if(path==='/api/site-images')json={images:{}};
        if(path==='/api/site-content')json={entries};
        if(path.startsWith('/api/site-content/')){ if(failSave){await route.fulfill({status:503,json:{error:'Fixture connection interrupted'}});return;} const key=path.split('/').at(-1),body=route.request().postDataJSON(); if(key==='batch'){for(const item of body.changes){assert.equal(item.expectedRevision,entries[item.key]?.revision||0);entries[item.key]={value:item.value,revision:item.expectedRevision+1};}json={entries};}else{entries[key]={value:body.value,revision:(entries[key]?.revision||0)+1};json={entry:entries[key]};} }
        if(path==='/api/workshops/schedule-preview')json={event:resolveWorkshop({scheduleMode:'weekly'})};
        if(path==='/api/workshops'){if(failWorkshop && method==='GET'){await route.fulfill({status:503,json:{error:'Fixture workshop refresh interrupted'}});return;}if(method==='PUT'){const {expectedRevision,...details}=route.request().postDataJSON();assert.equal(expectedRevision,event.revision);event={...details,revision:event.revision+1};}json={event:resolveWorkshop(event),configuration:event};}
        if(path==='/api/course-interest'){signup=route.request().postDataJSON();json={ok:true};}
        if(path==='/api/availability')json={days:[]};
        await route.fulfill({json});
        } finally {pendingApi.delete(request);lastApi=Date.now();}
      });
      try {
        for(const path of ['/','/dog-training','/behavior-assessment','/workshops','/learn','/contact']){
          const configured=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/config' && response.ok());
          await visit(origin+path,{waitUntil:'domcontentloaded'});await configured;
          await page.locator('.accessibility-trigger').waitFor();
          if(path==='/')await page.locator('.conversion-goal').first().waitFor();
          if(path==='/workshops')await page.getByRole('heading',{name:'Saturday dog-training workshop',exact:true}).waitFor();
          if(path==='/contact')await page.getByText('Ashley Leverock',{exact:true}).waitFor();
          await settleApi();await page.evaluate(()=>document.fonts.ready);
          await page.screenshot({path:`test-results/discovery-${engineName}-${width}-${path.slice(1)||'home'}.png`,fullPage:true});
          const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1 && getComputedStyle(el).position!=='absolute').map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})).slice(0,15)}));
          assert.ok(layout.scroll<=layout.width+1,`${path} ${width} no overflow: ${JSON.stringify(layout)}`);
        }
        await visit(origin);
        await page.locator('.conversion-goal').first().waitFor();await settleApi();
        await page.locator('.conversion-goals').screenshot({path:`test-results/program-cards-${engineName}-${width}.png`});
        for(const [label,price,program,focus,details] of [
          ['Pulling','$200','training','basic-obedience','/dog-training'],
          ['Aggression','$400','aggression',null,'/behavior-assessment'],
        ]){
          const expected=`/portal?program=${program}${focus ? `&focus=${focus}` : ''}`;
          const card=page.locator('.conversion-goal').filter({hasText:label});
          assert.equal(await card.getAttribute('href'),expected,'shared goal cards keep the correct booking focus');
          assert.doesNotMatch(await card.innerText(),/\$\d+/,'goals do not repeat the membership offer');
          await visit(origin+details);
          await visit(origin);await page.locator('.conversion-goal').first().waitFor();await settleApi();
          await follow(page.locator('.conversion-goal').filter({hasText:label}),expected);
          if(program==='aggression'){
            // The first main heading can still be the authentication loading state.
            // Wait for either a displayed service choice or the saved-draft decision.
            await page.waitForFunction(() => document.querySelector('.program-choice[aria-pressed="true"]') || document.querySelector('main h1')?.textContent?.trim()==='You have an unsent request.');
            const pending=page.getByRole('heading',{name:'You have an unsent request.',exact:true});
            if(await pending.isVisible()){
              assert.equal(await page.getByRole('link',{name:'Resume my request',exact:true}).getAttribute('href'),'/portal?resume=1');
              await page.getByRole('button',{name:'Discard draft and start again',exact:true}).click();
              await page.locator('.program-choice[aria-pressed="true"]').waitFor();
            }
          }
          if(program==='training'){
            const field=page.getByRole('combobox',{name:'What would you like help with?',exact:true});
            await field.waitFor();assert.equal(await field.inputValue(),focus);
            assert.match(await page.locator('.price-total').innerText(),/\$200/);
            if(focus==='basic-obedience'){
              await page.getByLabel('Number of dogs',{exact:true}).fill('2');assert.match(await page.locator('.price-total').innerText(),/\$300/);
            }
          }else{
            const selected=page.locator('.program-choice[aria-pressed="true"]');await selected.waitFor();
            assert.equal(await selected.count(),1);assert.ok((await selected.innerText()).includes(price));
            assert.match(await selected.innerText(),/Aggressive-dog intake/);
            assert.equal(await page.getByRole('combobox',{name:'Schedule visits for',exact:true}).inputValue(),program);
          }
          await visit(origin);await page.locator('.conversion-goal').first().waitFor();await settleApi();
        }
        const specialistCard=page.locator('.conversion-goal').filter({hasText:'Advanced'});
        assert.doesNotMatch(await specialistCard.innerText(),/\$200/,'specialist inquiry does not promise the standard monthly rate');
        assert.equal(await specialistCard.getAttribute('href'),'/contact?interest=advanced-training');
        assert.match(await page.locator('#specialist-training').innerText(),/scoped individually/);
        await follow(specialistCard,'/contact?interest=advanced-training');await page.getByRole('heading',{name:'Talk to Bravo.',exact:true}).waitFor();
        assert.equal(await page.getByRole('link',{name:'Call Bravo · (605) 824-2767',exact:true}).getAttribute('href'),'tel:+16058242767');
        await page.getByRole('link',{name:'Message Ashley',exact:true}).click();await page.getByRole('link',{name:'Sign in to Bravo',exact:true}).waitFor();
        const returnLink=await page.getByRole('link',{name:'Sign in to Bravo',exact:true}).getAttribute('href');
        assert.equal(new URL(returnLink,origin).searchParams.get('next'),'/community?tab=direct&to=cccccccccccccccccccccccc');
        await visit(origin+'/contact');
        await visit(origin);await page.locator('.conversion-goal').first().waitFor();await settleApi();
        const proof=page.locator('.home-work-proof');await proof.getByRole('button',{name:'Working dogs',exact:true}).click();assert.equal(await proof.locator('article[data-proof-video]').count(),1);await proof.getByRole('button',{name:'All training',exact:true}).click();assert.equal(await proof.locator('article[data-proof-video]').count(),3);
        await visit(origin+'/learn');await page.getByLabel('Email address',{exact:true}).fill('visitor@example.test');await page.getByLabel('Email me once when Bravo online courses launch.').check();await page.getByRole('button',{name:'Request a launch update'}).click();await page.getByText('Your launch-update request is saved.',{exact:false}).waitFor();assert.equal(signup.consent,true);assert.equal(signup.email,'visitor@example.test');
        owner=true;await visit(origin+'/workshops');await page.getByRole('button',{name:'Edit workshop details'}).click();await page.getByLabel('Time (Central)',{exact:true}).fill('10:00 a.m.');await page.getByLabel('Location',{exact:true}).fill('Fixture venue');await page.getByRole('button',{name:'Save workshop'}).click();await page.getByText('Workshop details saved.',{exact:true}).waitFor();await reload();await page.getByText('10:00 a.m. · Central',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Edit workshop date',exact:true}).click();
        const workshopEditor=page.getByRole('dialog',{name:'Edit workshop',exact:true});
        await workshopEditor.getByRole('radio',{name:'Every Saturday — Automatic',exact:true}).check();
        await workshopEditor.getByLabel('Start time (Central)',{exact:true}).fill('12:00');
        await workshopEditor.getByLabel('End time (Central)',{exact:true}).fill('14:00');
        await workshopEditor.getByText(/Current occurrence:/).waitFor();
        assert.match(await workshopEditor.innerText(),/Next occurrence:/);
        await page.screenshot({path:`test-results/workshop-schedule-${engineName}-${width}.png`,fullPage:true});
        assert.ok(await workshopEditor.evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1),'workshop editor fits viewport');
        await workshopEditor.getByRole('button',{name:'Save workshop',exact:true}).click();
        await page.getByText('12:00 PM–2:00 PM · Central',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Edit workshop date',exact:true}).click();
        await workshopEditor.getByRole('radio',{name:'No date',exact:true}).check();
        await workshopEditor.getByRole('button',{name:'Save workshop',exact:true}).click();
        await workshopEditor.waitFor({state:'hidden'});
        assert.equal(await page.locator('.workshop-details dt').filter({hasText:/^Date$|^Time$/}).count(),0);
        await reload();await page.getByRole('button',{name:'Edit workshop date',exact:true}).click();
        assert.equal(await workshopEditor.getByLabel('Start time (Central)',{exact:true}).inputValue(),'12:00');
        await workshopEditor.getByRole('radio',{name:'Every Saturday — Automatic',exact:true}).check();
        await workshopEditor.getByRole('button',{name:'Save workshop',exact:true}).click();
        await page.getByText('12:00 PM–2:00 PM · Central',{exact:true}).waitFor();
        failWorkshop=true;await page.evaluate(()=>window.dispatchEvent(new Event('bravo-workshop-changed')));
        await page.getByText(/Showing the last verified workshop schedule/).waitFor();
        assert.match(await page.locator('.workshop-details').innerText(),/12:00 PM–2:00 PM/);
        failWorkshop=false;await page.evaluate(()=>window.dispatchEvent(new Event('bravo-workshop-changed')));await settleApi();
        await visit(origin);await page.getByRole('button',{name:'Edit page text & design'}).click();const dialog=page.getByRole('dialog',{name:'Edit website section'});await dialog.getByLabel('Edit this part',{exact:true}).selectOption('mobile-discovery-title');await dialog.getByLabel('Text',{exact:true}).fill('Find your next step.');failSave=true;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.getByText('Fixture connection interrupted').waitFor();assert.equal(await dialog.getByLabel('Text',{exact:true}).inputValue(),'Find your next step.');failSave=false;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.waitFor({state:'hidden'});await page.getByText('Saved. Your website changes are published.',{exact:true}).waitFor();await reload();await page.getByRole('heading',{name:'Find your next step.',exact:true}).waitFor();
        // Cancelling preserves drafts; publishing saves changed sections atomically.
        await page.getByRole('button',{name:'Edit page text & design'}).click();
        await dialog.getByLabel('Edit this part',{exact:true}).selectOption('mobile-discovery-title');
        await dialog.getByLabel('Text',{exact:true}).fill('A preserved draft.');
        await dialog.getByLabel('Edit this part',{exact:true}).selectOption('site-theme');
        const priorConfirmations=confirmations;discard=false;
        await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
        assert.equal(confirmations,priorConfirmations+1);assert.equal(await dialog.isVisible(),true);
        await dialog.getByLabel('Text color',{exact:true}).fill('#ba9a65');
        await dialog.getByRole('button',{name:'Publish website changes'}).click();
        await dialog.waitFor({state:'hidden'});
        assert.equal(entries['mobile-discovery-title'].value.text,'A preserved draft.');
        assert.equal(entries['site-theme'].value.color,'#ba9a65');
        discard=true;await reload();await page.getByRole('heading',{name:'A preserved draft.',exact:true}).waitFor();
        await visit(origin+'/learn?preview=launch');await page.getByRole('heading',{name:'Bravo. Anywhere.',exact:true}).waitFor();await page.getByRole('button',{name:'Edit page text & design'}).click();await page.getByRole('dialog',{name:'Edit website section'}).getByLabel('Edit this part',{exact:true}).selectOption('discovery-course-copy');assert.match(await page.getByRole('dialog',{name:'Edit website section'}).getByLabel('Text',{exact:true}).inputValue(),/David and Ashley/);
        assert.deepEqual(errors,[]);console.log(`${engineName} ${width}: discovery, pricing, routing, filters, signup and editor recovery passed`);
      }catch(error){
        failure={message:error.message,url:page.url(),state:await page.evaluate(()=>({readyState:document.readyState,heading:document.querySelector('main h1')?.textContent,goal:document.querySelector('.goal-result')?.innerText,actions:[...document.querySelectorAll('.goal-result .goal-actions a')].map(el=>({text:el.textContent,href:el.getAttribute('href')}))})).catch(()=>null)};
        await page.screenshot({path:`test-results/discovery-failure-${engineName}-${width}.png`,fullPage:true}).catch(()=>{});
        throw error;
      }finally{
        await writeFile(`test-results/discovery-diagnostics-${engineName}-${width}.json`,JSON.stringify({errors,browserDiagnostics,navigation,failure},null,2));
        await context.tracing.stop(failure?{path:`test-results/discovery-failure-${engineName}-${width}.zip`}:{});
        await context.close();
      }
    }}finally{await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}

