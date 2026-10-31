// Isolated public fixtures: no customer accounts, database or production writes.
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { CONTENT_KEYS } from '../shared/site-content-keys.js';
import { HOME_HERO_SOURCE, HOME_HERO_ALT } from '../shared/home-hero.js';

const dist = path.resolve('client/dist'), app = express();
app.get('/api/live', (_req,res) => res.json({ sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() }));
app.get('/', (_req,res) => res.sendFile(path.join(dist,'bravo-shell.html')));
app.use(express.static(dist,{extensions:['html']}));
app.get('/{*rest}', (_req,res) => res.sendFile(path.join(dist,'bravo-shell.html')));
const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
const engines = (process.env.BRAVO_BROWSER_ENGINES || 'chromium,webkit').split(',');
try {
  for (const name of engines) {
    const browser = await ({chromium,webkit}[name]).launch();
    try {
      for (const width of [320,390,768,1440]) {
        let owner = false, entries = {}, images = {};
        const context = await browser.newContext({viewport:{width,height:950},reducedMotion:'no-preference',hasTouch:width<700});
        await context.route('**/*', async route => {
          const request=route.request(), url=new URL(request.url());
          if(url.origin!==origin || request.resourceType()==='media') return route.abort();
          if(!url.pathname.startsWith('/api/') || url.pathname==='/api/live') return route.continue();
          let json={entries:{},images:{},team:[],reviews:[],recommendations:[],clips:[],alerts:[],ads:[],items:[],schedules:[]};
          if(url.pathname==='/api/config')json={connected:true,paymentsReady:false,services:SERVICES};
          if(url.pathname==='/api/auth/me')json={user:owner?{id:'experience-owner',name:'Fixture owner',role:'owner'}:null,services:[],membership:{active:false}};
          if(url.pathname==='/api/site-content')json={entries};
          if(url.pathname==='/api/site-images')json={images};
          if(url.pathname==='/api/site-images/home-method/undo') {
            assert.ok(owner);assert.equal(request.method(),'POST');
            assert.equal(request.postDataJSON().expectedRevision,3);
            images['home-method']={src:null,framed:false,revision:4,canUndo:true};
            return route.fulfill({json:{image:images['home-method']}});
          }
          if(url.pathname.startsWith('/api/site-content/')) {
            assert.ok(owner,'only the owner fixture publishes');
            const key=url.pathname.split('/').at(-1),body=request.postDataJSON();
            assert.equal(CONTENT_KEYS[key]?.text,true,'the real publishing registry accepts this field');
            assert.equal(body.expectedRevision,entries[key]?.revision||0);
            entries[key]={value:body.value,revision:body.expectedRevision+1};json={entry:entries[key]};
          } else if(!['GET','HEAD'].includes(request.method())) assert.match(url.pathname,/telemetry/,'no account or booking writes');
          return route.fulfill({json});
        });
        const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
        try {
          await page.goto(origin);await page.locator('.bravo-hub').waitFor();
          await page.evaluate(()=>document.fonts.ready);
          const hero=await page.locator('.polish-hero-actions').getByRole('link',{name:/Start My Training Plan/i}).boundingBox();
          assert.ok(hero && hero.y>0 && hero.y+hero.height<=950,'booking remains immediately visible');
          assert.match(await page.locator('#home-title').innerText(),/Dog training.\s*For real life./);
          assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto','native anchor navigation keeps controls stationary');
          assert.match(await page.locator('#home-title').evaluate(node=>getComputedStyle(node).fontFamily),/Montserrat/);
          const imageTop=await page.locator('.cinema-hero-media').evaluate(node=>node.getBoundingClientRect().top);
          assert.ok(imageTop>hero.y+hero.height,'the new opening puts the booking message before the image');
          assert.equal(await page.locator('.training-journey').count(),0,'the complete approach has its own page');
          if(width===1440) {
            assert.equal(await page.locator('.home-desktop-nav').getByRole('link',{name:'Training',exact:true}).getAttribute('href'),'/training');
            for(const breakpointWidth of [1100,1120,1121,1200,1440]) {
              await page.setViewportSize({width:breakpointWidth,height:950});
              const header=await page.locator('.app-header').boundingBox();
              assert.ok(header.height<100,`${breakpointWidth}: chapter navigation never expands the fixed header`);
              const chapters=page.locator('.home-desktop-nav');
              assert.equal(await chapters.isVisible(),breakpointWidth>1120,`${breakpointWidth}: chapters respect the shared navigation breakpoint`);
              if(breakpointWidth>1120) {
                const tops=await chapters.locator('a').evaluateAll(links=>links.map(link=>link.getBoundingClientRect().top));
                assert.ok(Math.max(...tops)-Math.min(...tops)<1,'desktop chapter links stay in one row');
                await chapters.getByRole('link',{name:'Our approach',exact:true}).click();
                await page.waitForURL('**/our-approach');await page.getByRole('tab',{name:'Trust.',exact:true}).waitFor();
                await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
              }
            }
          }
          await page.goto(origin+'/our-approach');await page.getByRole('tab',{name:'Trust.',exact:true}).waitFor();
          const method=page.locator('#method');await method.scrollIntoViewIfNeeded();
          await page.waitForFunction(()=>getComputedStyle(document.getElementById('method')).opacity==='1');
          for(const [index,id] of ['trust','train','deploy'].entries()) {
            const tab=page.locator('.journey-tab').nth(index);await tab.click();
            assert.equal(await tab.getAttribute('aria-selected'),'true');
            assert.equal(await page.getByRole('tabpanel').count(),1,'only the selected panel is exposed');
            assert.equal(await page.getByRole('tabpanel').getAttribute('id'),`journey-panel-${id}`);
          }
          await page.locator('.journey-tab').last().focus();await page.keyboard.press('ArrowRight');
          assert.equal(await page.locator('.journey-tab').first().getAttribute('aria-selected'),'true');
          assert.ok(await page.locator('.journey-tab').first().evaluate(node=>node===document.activeElement));
          await page.keyboard.press('End');assert.equal(await page.locator('.journey-tab').last().getAttribute('aria-selected'),'true');
          await page.keyboard.press('Home');await page.keyboard.press('Tab');
          assert.equal(await page.locator('#journey-panel-trust').evaluate(node=>node===document.activeElement),true);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
          await page.locator('.journey-photo img').evaluate(image=>image.decode());
          await method.screenshot({path:`test-results/experience-${name}-${width}.png`,style:'.app-header,.skip-link,.mobile-home-nav,.accessibility-trigger{visibility:hidden!important}'});
          await page.emulateMedia({reducedMotion:'reduce'});
          await page.waitForFunction(()=>document.querySelector('.cinema-home').dataset.motion==='off');
          assert.equal(await page.locator('#method').evaluate(node=>getComputedStyle(node).animationName),'none','reduced motion stops the page animation');
          await page.locator('.journey-tab').nth(1).click();
          assert.equal(await page.getByRole('tabpanel').evaluate(node=>getComputedStyle(node).animationName),'none');
          await page.emulateMedia({reducedMotion:'no-preference'});
          await page.evaluate(()=>document.documentElement.classList.add('access-reduced-motion'));
          await page.locator('.journey-tab').last().click();
          assert.equal(await page.getByRole('tabpanel').evaluate(node=>getComputedStyle(node).animationName),'none');
          await page.goto(origin+'/dog-training');
          await page.waitForFunction(()=>document.querySelector('main[data-public-page="dog-training"]')?.dataset.motion==='on');
          await page.locator('.service-questions').first().scrollIntoViewIfNeeded();
          await page.waitForFunction(()=>getComputedStyle(document.querySelector('.service-questions')).opacity==='1');
          await page.locator('.service-questions summary').first().click();
          assert.ok(await page.locator('.service-questions details').first().evaluate(node=>node.open));
          if(width===390) {
            owner=true;await page.goto(origin+'/our-approach');await page.locator('.content-edit-launcher').waitFor();
            const heading=page.locator('[data-site-content-key="journey-trust-title"]');await heading.scrollIntoViewIfNeeded();
            const box=await heading.boundingBox();await page.mouse.move(box.x+20,box.y+12);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
            const dialog=page.getByRole('dialog',{name:'Edit website section',exact:true});await dialog.waitFor();
            await dialog.getByLabel('Text',{exact:true}).fill('Start with your dog’s story.');
            await dialog.getByRole('button',{name:'Publish website changes',exact:true}).click();await dialog.waitFor({state:'hidden'});
            assert.equal(entries['journey-trust-title'].value.text,'Start with your dog’s story.');
            await page.reload();await page.getByRole('heading',{name:'Start with your dog’s story.',exact:true}).waitFor();
            // Remount Home with a saved photo snapshot, then restore the default.
            images['home-method']={src:'/images/ashley-northrop.webp',alt:'Replacement fixture',framed:true,fit:'contain',x:25,y:70,zoom:1.5,revision:3,canUndo:true};
            await page.goto(origin+'/dog-training');await page.waitForLoadState('networkidle');
            await page.locator('.menu-toggle').click();await page.locator('.nav-about > summary').click();await page.locator('.nav-about a[href="/our-approach"]').click();
            const photo=page.locator('.journey-photo img');await photo.waitFor();
            assert.equal(await photo.getAttribute('src'),'/images/ashley-northrop.webp');
            assert.equal(await photo.evaluate(node=>node.style.transform),'scale(1.5)');
            await photo.scrollIntoViewIfNeeded();await photo.press('F2');
            const photoDialog=page.getByRole('dialog',{name:'Edit this photo',exact:true});await photoDialog.waitFor();
            page.once('dialog',dialog=>dialog.accept());
            await photoDialog.getByRole('button',{name:'Restore previous edit',exact:true}).click();
            await photoDialog.waitFor({state:'hidden'});
            assert.equal(await photo.getAttribute('src'),HOME_HERO_SOURCE,'restore uses the real default after navigation');
            assert.equal(await photo.getAttribute('alt'),HOME_HERO_ALT);
            assert.equal(await photo.evaluate(node=>node.style.transform),'','restore clears replacement zoom');
            assert.equal(await photo.evaluate(node=>getComputedStyle(node).objectFit),'cover');
            assert.equal(await photo.evaluate(node=>getComputedStyle(node).objectPosition),'50% 65%');
          }
          assert.deepEqual(errors,[]);
          console.log(`PASS ${name}/${width}: journey taps, keyboard, focus, reduced motion, public reveals${width===390?', owner publishing persists and photo restore survives navigation':''}`);
        } finally {await context.close();}
      }
      const staticContext=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:950}});
      const staticPage=await staticContext.newPage();await staticPage.goto(origin+'/our-approach');
      assert.equal(await staticPage.locator('.journey-panel:visible').count(),3,'all three steps work as readable content without scripts');
      assert.equal(await staticPage.locator('.journey-tab[role=tab]').count(),0,'no inert interactive tabs in the no-JavaScript page');
      await staticContext.close();console.log(`PASS ${name}: no-JavaScript fallback`);
    } finally {await browser.close();}
  }
} finally {await new Promise(resolve=>server.close(resolve));}
