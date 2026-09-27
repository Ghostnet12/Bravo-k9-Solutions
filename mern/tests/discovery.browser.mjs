import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import app from '../server/app.js';
import { SERVICES } from '../shared/catalog.js';
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
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:width === 360 ? 'reduce' : 'no-preference'}), page=await context.newPage(), errors=[];
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
      page.on('pageerror',error=>errors.push(error.message));
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
        if(path.startsWith('/api/site-content/')){ if(failSave){await route.fulfill({status:503,json:{error:'Fixture connection interrupted'}});return;} const key=path.split('/').at(-1),body=route.request().postDataJSON(); entries[key]={value:body.value,revision:(entries[key]?.revision||0)+1};json={entry:entries[key]}; }
        if(path==='/api/workshops'){if(method==='PUT'){const {expectedRevision,...details}=route.request().postDataJSON();assert.equal(expectedRevision,event.revision);event={...details,revision:event.revision+1};}json={event};}
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
        for(const [label,price] of [['Everyday manners','$200'],['Walking & distractions','$200'],['Aggression & handling','$400'],['Specialized training','$200']]){
          const tab=page.getByRole('button',{name:label,exact:true});
          assert.ok((await tab.innerText()).includes(price),`${label} has its own service price`);
          await tab.click();assert.ok((await page.locator('.goal-price').innerText()).includes(price));
        }
        await page.getByRole('button',{name:'Walking & distractions',exact:true}).click();
        assert.match(await page.locator('.goal-result').innerText(),/Skills that travel/);
        await page.locator('.goal-result').getByRole('link',{name:'Plan my first visit'}).click();
        await page.getByRole('combobox',{name:'What would you like help with?',exact:true}).waitFor();
        assert.equal(await page.getByRole('combobox',{name:'What would you like help with?',exact:true}).inputValue(),'advanced-obedience');
        await page.getByLabel('Number of dogs',{exact:true}).fill('2');assert.match(await page.locator('.price-total').innerText(),/\$300/);
        await visit(origin);await page.getByRole('button',{name:'Aggression & handling',exact:true}).click();assert.match(await page.locator('.goal-result').innerText(),/\$400/);assert.match(await page.locator('.goal-result').getByRole('link',{name:'Request an assessment'}).getAttribute('href'),/program=aggression/);
        const proof=page.locator('.home-work-proof');await proof.getByRole('button',{name:'Working dogs',exact:true}).click();assert.equal(await proof.locator('article[data-proof-video]').count(),1);await proof.getByRole('button',{name:'All training',exact:true}).click();assert.equal(await proof.locator('article[data-proof-video]').count(),3);
        await visit(origin+'/learn');await page.getByLabel('Email address',{exact:true}).fill('visitor@example.test');await page.getByLabel('Email me once when Bravo online courses launch.').check();await page.getByRole('button',{name:'Request a launch update'}).click();await page.getByText('Your launch-update request is saved.',{exact:false}).waitFor();assert.equal(signup.consent,true);assert.equal(signup.email,'visitor@example.test');
        owner=true;await visit(origin+'/workshops');await page.getByRole('button',{name:'Edit workshop details'}).click();await page.getByLabel('Time (Central)',{exact:true}).fill('10:00 a.m.');await page.getByLabel('Location',{exact:true}).fill('Fixture venue');await page.getByRole('button',{name:'Publish workshop'}).click();await page.getByText('Workshop details saved.',{exact:true}).waitFor();await reload();await page.getByText('10:00 a.m. · Central',{exact:true}).waitFor();
        await visit(origin);await page.getByRole('button',{name:'Edit page text & design'}).click();const dialog=page.getByRole('dialog',{name:'Edit website section'});await dialog.getByLabel('Edit this part',{exact:true}).selectOption('discovery-goal-title');await dialog.getByLabel('Text',{exact:true}).fill('Find your next step.');failSave=true;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.getByText('Fixture connection interrupted').waitFor();assert.equal(await dialog.getByLabel('Text',{exact:true}).inputValue(),'Find your next step.');failSave=false;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.waitFor({state:'hidden'});await page.getByText('Saved. Your website changes are published.',{exact:true}).waitFor();await reload();await page.getByRole('heading',{name:'Find your next step.',exact:true}).waitFor();
        // A draft on another section must survive cancel and publishing the current section.
        await page.getByRole('button',{name:'Edit page text & design'}).click();
        await dialog.getByLabel('Edit this part',{exact:true}).selectOption('discovery-goal-title');
        await dialog.getByLabel('Text',{exact:true}).fill('A preserved draft.');
        await dialog.getByLabel('Edit this part',{exact:true}).selectOption('site-theme');
        const priorConfirmations=confirmations;discard=false;
        await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
        assert.equal(confirmations,priorConfirmations+1);assert.equal(await dialog.isVisible(),true);
        await dialog.getByLabel('Text color',{exact:true}).fill('#ba9a65');
        await dialog.getByRole('button',{name:'Publish website changes'}).click();
        await page.waitForFunction(()=>document.querySelector('dialog[open] button[type="submit"]')?.disabled);
        assert.equal(await dialog.isVisible(),true);
        await dialog.getByLabel('Edit this part',{exact:true}).selectOption('discovery-goal-title');
        assert.equal(await dialog.getByLabel('Text',{exact:true}).inputValue(),'A preserved draft.');
        await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.waitFor({state:'hidden'});
        discard=true;await reload();await page.getByRole('heading',{name:'A preserved draft.',exact:true}).waitFor();
        await visit(origin+'/learn?preview=launch');await page.getByRole('heading',{name:'Bravo. Anywhere.',exact:true}).waitFor();await page.getByRole('button',{name:'Edit page text & design'}).click();await page.getByRole('dialog',{name:'Edit website section'}).getByLabel('Edit this part',{exact:true}).selectOption('discovery-course-copy');assert.match(await page.getByRole('dialog',{name:'Edit website section'}).getByLabel('Text',{exact:true}).inputValue(),/David and Ashley/);
        assert.deepEqual(errors,[]);console.log(`${engineName} ${width}: discovery, pricing, routing, filters, signup and editor recovery passed`);
      }finally{await context.close();}
    }}finally{await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
