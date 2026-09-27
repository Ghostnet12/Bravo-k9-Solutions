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
      let owner=false, event={...DEFAULT_WORKSHOP}, entries={}, signup=null, failSave=false;
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
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
          await page.goto(origin+path);await page.waitForLoadState('networkidle');
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} ${width} no overflow`);
          await page.screenshot({path:`test-results/discovery-${engineName}-${width}-${path.slice(1)||'home'}.png`,fullPage:true});
        }
        await page.goto(origin);await page.getByRole('button',{name:'Walking & distractions',exact:true}).click();
        assert.match(await page.locator('.goal-result').innerText(),/Skills that travel/);
        await page.locator('.goal-result').getByRole('link',{name:'Plan my first visit'}).click();
        await page.getByRole('combobox',{name:'What would you like help with?',exact:true}).waitFor();
        assert.equal(await page.getByRole('combobox',{name:'What would you like help with?',exact:true}).inputValue(),'advanced-obedience');
        await page.getByLabel('Number of dogs',{exact:true}).fill('2');assert.match(await page.locator('.price-total').innerText(),/\$300/);
        await page.goto(origin);await page.getByRole('button',{name:'Aggression & handling',exact:true}).click();assert.match(await page.locator('.goal-result').innerText(),/\$400/);assert.match(await page.locator('.goal-result').getByRole('link',{name:'Request an assessment'}).getAttribute('href'),/program=aggression/);
        const proof=page.locator('.home-work-proof');await proof.getByRole('button',{name:'Working dogs',exact:true}).click();assert.equal(await proof.locator('article[data-proof-video]').count(),1);await proof.getByRole('button',{name:'All training',exact:true}).click();assert.equal(await proof.locator('article[data-proof-video]').count(),3);
        await page.goto(origin+'/learn');await page.getByLabel('Email address',{exact:true}).fill('visitor@example.test');await page.getByLabel('Email me once when Bravo online courses launch.').check();await page.getByRole('button',{name:'Request a launch update'}).click();await page.getByText('Your launch-update request is saved.',{exact:false}).waitFor();assert.equal(signup.consent,true);assert.equal(signup.email,'visitor@example.test');
        owner=true;await page.goto(origin+'/workshops');await page.getByRole('button',{name:'Edit workshop details'}).click();await page.getByLabel('Time (Central)',{exact:true}).fill('10:00 a.m.');await page.getByLabel('Location',{exact:true}).fill('Fixture venue');await page.getByRole('button',{name:'Publish workshop'}).click();await page.getByText('Workshop details saved.',{exact:true}).waitFor();await page.reload();await page.getByText('10:00 a.m. · Central',{exact:true}).waitFor();
        await page.goto(origin);await page.getByRole('button',{name:'Edit page text & design'}).click();const dialog=page.getByRole('dialog',{name:'Edit website section'});await dialog.getByLabel('Edit this part',{exact:true}).selectOption('discovery-goal-title');await dialog.getByLabel('Text',{exact:true}).fill('Find your next step.');failSave=true;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.getByText('Fixture connection interrupted').waitFor();assert.equal(await dialog.getByLabel('Text',{exact:true}).inputValue(),'Find your next step.');failSave=false;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.waitFor({state:'hidden'});await page.getByText('Saved. Your website changes are published.',{exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'Find your next step.',exact:true}).waitFor();
        await page.goto(origin+'/learn?preview=launch');await page.getByRole('heading',{name:'Bravo. Anywhere.',exact:true}).waitFor();await page.getByRole('button',{name:'Edit page text & design'}).click();await page.getByRole('dialog',{name:'Edit website section'}).getByLabel('Edit this part',{exact:true}).selectOption('discovery-course-copy');assert.match(await page.getByRole('dialog',{name:'Edit website section'}).getByLabel('Text',{exact:true}).inputValue(),/David and Ashley/);
        assert.deepEqual(errors,[]);console.log(`${engineName} ${width}: discovery, pricing, routing, filters, signup and editor recovery passed`);
      }finally{await context.close();}
    }}finally{await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
