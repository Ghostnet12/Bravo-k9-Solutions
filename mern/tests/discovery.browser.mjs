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
    try { for (const width of [360,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:width === 360 ? 'reduce' : 'no-preference'}), page=await context.newPage(), errors=[], browserDiagnostics=[];
      let discard=true, confirmations=0;
      // Finish mocked API responses before tearing down the document. WebKit
      // reports intercepted requests cancelled by navigation as access errors.
      const pendingApi=new Set();let lastApi=0;
      page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/')){pendingApi.add(request);lastApi=Date.now();}});
      for(const name of ['requestfinished','requestfailed'])page.on(name,request=>{if(pendingApi.delete(request))lastApi=Date.now();});
      async function settleApi(){const deadline=Date.now()+5000;while(pendingApi.size || Date.now()-lastApi<150){if(Date.now()>deadline)throw new Error('Mocked API requests did not settle');await new Promise(resolve=>setTimeout(resolve,25));}}
      async function visit(url,options){await settleApi();return page.goto(url,{waitUntil:'domcontentloaded',...options});}
      async function reload(){await settleApi();return page.reload({waitUntil:'domcontentloaded'});}

      let owner=false, event={...DEFAULT_WORKSHOP}, entries={}, signup=null, failSave=false;
      // WebKit also emits pageerror for handled fetch cancellations during
      // navigation. Keep those diagnostics and assert the browser's actual
      // uncaught exceptions and promise rejections, as the toolkit suite does.
      page.on('pageerror',error=>browserDiagnostics.push({message:error.message,stack:error.stack,url:page.url()}));
      await page.exposeFunction('reportDiscoveryError',message=>errors.push(message));
      await page.addInitScript(()=>{
        window.addEventListener('error',event=>{if(event instanceof ErrorEvent)void window.reportDiscoveryError(event.error?.stack||event.message).catch(()=>{});});
        window.addEventListener('unhandledrejection',event=>{void window.reportDiscoveryError(event.reason?.stack||event.reason?.message||String(event.reason)).catch(()=>{});});
      });
      page.on('dialog',dialog=>{confirmations++;return discard ? dialog.accept() : dialog.dismiss();});
      await context.route('**/api/**', async route => {
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
        if(path==='/api/workshops'){if(method==='PUT'){const {expectedRevision,...details}=route.request().postDataJSON();assert.equal(expectedRevision,event.revision);event={...details,revision:event.revision+1};}json={event:resolveWorkshop(event),configuration:event};}
        if(path==='/api/course-interest'){signup=route.request().postDataJSON();json={ok:true};}
        if(path==='/api/availability')json={days:[]};
        await route.fulfill({json});
      });
      try {
        for(const path of ['/','/dog-training','/behavior-assessment','/dog-walking','/workshops','/learn','/contact']){
          // Video range requests can stay active in WebKit; wait for the usable page instead.
          const configured=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/config' && response.ok());
          await visit(origin+path,{waitUntil:'domcontentloaded'});await configured;
          await page.locator('.accessibility-trigger').waitFor();
          if(path==='/')await page.locator('.goal-proof figcaption').waitFor();
          if(path==='/workshops')await page.getByRole('heading',{name:'Saturday dog-training workshop',exact:true}).waitFor();
          if(path==='/contact')await page.getByText('Ashley Leverock',{exact:true}).waitFor();
          await settleApi();await page.evaluate(()=>document.fonts.ready);
          await page.screenshot({path:`test-results/discovery-${engineName}-${width}-${path.slice(1)||'home'}.png`,fullPage:true});
          const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1 && getComputedStyle(el).position!=='absolute').map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})).slice(0,15)}));
          assert.ok(layout.scroll<=layout.width+1,`${path} ${width} no overflow: ${JSON.stringify(layout)}`);
        }
        await visit(origin);
        await page.locator('.goal-proof figcaption').waitFor();await settleApi();
        await page.locator('.goal-choices').screenshot({path:`test-results/program-cards-${engineName}-${width}.png`});
        for(const [label,price,program,focus,details] of [
          ['Everyday manners','$200','training','basic-obedience','/dog-training'],
          ['Dog walking','$25','walking',null,'/dog-walking'],
          ['Aggression & handling','$400','aggression',null,'/behavior-assessment'],
        ]){
          const card=page.getByRole('link',{name:label,exact:true});
          assert.ok((await card.innerText()).includes(price),`${label} has its own service price`);
          await page.getByRole('button',{name:`Preview ${label}`,exact:true}).click();
          assert.ok((await page.locator('.goal-price').innerText()).includes(price));
          assert.equal(await page.locator('.goal-result').getByRole('link',{name:'What’s included'}).getAttribute('href'),details);
          const expected=`/portal?program=${program}${focus ? `&focus=${focus}` : ''}`;
          assert.equal(await card.getAttribute('href'),expected);
          assert.equal(await page.locator('.goal-result .goal-actions .button').getAttribute('href'),expected);
          // The price card itself must navigate, without another CTA tap.
          await card.click();await page.waitForURL(origin+expected);
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
            assert.match(await selected.innerText(),program==='walking' ? /Dog Walking/ : /Aggressive-dog intake/);
            assert.equal(await page.getByRole('combobox',{name:'Schedule visits for',exact:true}).inputValue(),program);
          }
          await visit(origin);await page.locator('.goal-proof figcaption').waitFor();await settleApi();
        }
        const specialistCard=page.getByRole('link',{name:'Specialized training',exact:true});
        const specialistText=await specialistCard.innerText();
        assert.equal(specialistText.includes('$200'),false,'specialist card does not promise the standard monthly rate');
        assert.match(specialistText,/Talk with Bravo/);assert.match(specialistText,/Scope & pricing are goal-specific/);
        assert.equal(await specialistCard.getAttribute('href'),'/contact');
        await page.getByRole('button',{name:'Preview Specialized training',exact:true}).click();
        assert.equal(await page.locator('.goal-result .goal-price').count(),0,'specialist preview has no standard membership price');
        assert.match(await page.locator('.goal-result').innerText(),/scoped individually/i);
        assert.equal(await page.locator('.goal-result .goal-actions .button').getAttribute('href'),'/contact');
        assert.equal(await page.locator('.goal-result').getByRole('link',{name:'See the training approach'}).getAttribute('href'),'/dog-training');
        await specialistCard.click();await page.waitForURL(origin+'/contact');await page.getByRole('heading',{name:'Talk to Bravo.',exact:true}).waitFor();
        await visit(origin);await page.locator('.goal-proof figcaption').waitFor();await settleApi();
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
        assert.equal(await page.locator('.workshop-details dt').filter({hasText:/^Date$|^Time$/}).count(),0);
        await reload();await page.getByRole('button',{name:'Edit workshop date',exact:true}).click();
        assert.equal(await workshopEditor.getByLabel('Start time (Central)',{exact:true}).inputValue(),'12:00');
        await workshopEditor.getByRole('radio',{name:'Every Saturday — Automatic',exact:true}).check();
        await workshopEditor.getByRole('button',{name:'Save workshop',exact:true}).click();
        await page.getByText('12:00 PM–2:00 PM · Central',{exact:true}).waitFor();

        await visit(origin);await page.getByRole('button',{name:'Edit page text & design'}).click();const dialog=page.getByRole('dialog',{name:'Edit website section'});await dialog.getByLabel('Edit this part',{exact:true}).selectOption('discovery-goal-title');await dialog.getByLabel('Text',{exact:true}).fill('Find your next step.');failSave=true;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.getByText('Fixture connection interrupted').waitFor();assert.equal(await dialog.getByLabel('Text',{exact:true}).inputValue(),'Find your next step.');failSave=false;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.waitFor({state:'hidden'});await page.getByText('Saved. Your website changes are published.',{exact:true}).waitFor();await reload();await page.getByRole('heading',{name:'Find your next step.',exact:true}).waitFor();
        // Cancelling preserves drafts; publishing saves every changed section atomically.
        await page.getByRole('button',{name:'Edit page text & design'}).click();
        await dialog.getByLabel('Edit this part',{exact:true}).selectOption('discovery-goal-title');
        await dialog.getByLabel('Text',{exact:true}).fill('A preserved draft.');
        await dialog.getByLabel('Edit this part',{exact:true}).selectOption('site-theme');
        const priorConfirmations=confirmations;discard=false;
        await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
        assert.equal(confirmations,priorConfirmations+1);assert.equal(await dialog.isVisible(),true);
        await dialog.getByLabel('Text color',{exact:true}).fill('#ba9a65');
        await dialog.getByRole('button',{name:'Publish website changes'}).click();
        await dialog.waitFor({state:'hidden'});
        assert.equal(entries['discovery-goal-title'].value.text,'A preserved draft.');
        assert.equal(entries['site-theme'].value.color,'#ba9a65');
        discard=true;await reload();await page.getByRole('heading',{name:'A preserved draft.',exact:true}).waitFor();
        await visit(origin+'/learn?preview=launch');await page.getByRole('heading',{name:'Bravo. Anywhere.',exact:true}).waitFor();await page.getByRole('button',{name:'Edit page text & design'}).click();await page.getByRole('dialog',{name:'Edit website section'}).getByLabel('Edit this part',{exact:true}).selectOption('discovery-course-copy');assert.match(await page.getByRole('dialog',{name:'Edit website section'}).getByLabel('Text',{exact:true}).inputValue(),/David and Ashley/);
        assert.deepEqual(errors,[]);console.log(`${engineName} ${width}: discovery, pricing, routing, filters, signup and editor recovery passed`);
      }finally{await writeFile(`test-results/discovery-diagnostics-${engineName}-${width}.json`,JSON.stringify({errors,browserDiagnostics},null,2));await context.close();}
    }}finally{await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
