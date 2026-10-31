import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { DEFAULT_MUSIC } from '../shared/music-playlist.js';
// PCM fixture avoids depending on AAC support in the open-source Linux browser.
const audioFixture = Buffer.alloc(44 + 8000 * 2 * 30);
audioFixture.write('RIFF'); audioFixture.writeUInt32LE(audioFixture.length - 8, 4); audioFixture.write('WAVEfmt ', 8);
audioFixture.writeUInt32LE(16, 16); audioFixture.writeUInt16LE(1, 20); audioFixture.writeUInt16LE(1, 22);
audioFixture.writeUInt32LE(8000, 24); audioFixture.writeUInt32LE(16000, 28); audioFixture.writeUInt16LE(2, 32); audioFixture.writeUInt16LE(16, 34);
audioFixture.write('data', 36); audioFixture.writeUInt32LE(audioFixture.length - 44, 40);
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req,res) => res.type('html').send(html));
const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
try {
 for (const [name, engine] of Object.entries({chromium,webkit})) {
  if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
  const browser = await engine.launch();
  try {
   for (const width of [320,375,390,430,768,1440]) {
    if(process.env.BRAVO_TEST_WIDTHS && !process.env.BRAVO_TEST_WIDTHS.split(',').map(Number).includes(width)) continue;
    const height = width === 320 ? 568 : width >= 768 ? 768 : 844;
    const context = await browser.newContext({viewport:{width,height},hasTouch:width<=430}), page = await context.newPage();
    if (width === 375) await page.addInitScript(() => {
     Object.defineProperty(navigator, 'userAgent', {get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1'});
    });
    if (width === 390) await page.addInitScript(() => {
     const play = HTMLMediaElement.prototype.play;
     HTMLMediaElement.prototype.play = function (...args) {
      if (this.hasAttribute('data-site-soundtrack') && !this.dataset.policyTested) {
       this.dataset.policyTested = 'true';
       return Promise.reject(new DOMException('Gesture required by test policy', 'NotAllowedError'));
      }
      return play.apply(this, args);
     };
    });
    page.on('pageerror', e => console.log('PAGE ERROR', e.message));
    let playlist = structuredClone(DEFAULT_MUSIC), uploads=0, chunks=0;
    await page.route('**/audio/built-for-the-real-world.m4a', route => route.fulfill({ contentType: 'audio/wav', body: audioFixture }));
    await page.route('**/api/**',async route => {
     const path = new URL(route.request().url()).pathname; let json={};
     if(path==='/api/config') json={connected:true,services:SERVICES,schedule:{enabled:true,weekdays:[1,2,3,4,5],hours:['10:00']}};
     if(path==='/api/auth/me') json={user:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',role:'owner',name:'Fixture Owner'},services:[],membership:{active:false}};
     if(path==='/api/site-music') {
      if(route.request().method()==='PUT'){ const body=route.request().postDataJSON(); playlist={...body,revision:body.expectedRevision+1,tracks:body.tracks.map(t=>({...t,src:DEFAULT_MUSIC.tracks[0].src}))}; } json=playlist;
     }
     if(path==='/api/site-music/uploads'){uploads++;json={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',chunkSize:409600};}
     if(path.includes('/site-music/uploads/')&&path.includes('/chunks/')) chunks++;
     if(path==='/api/site-ads') json={ads:[{id:'fixture-ad',title:'Bravo training',alt:'Bravo training banner',src:'/images/saturday-workshop-october-3.webp',link:'/dog-training',enabled:true}],settings:{autoplaySeconds:7},revision:0};
     if(path==='/api/live') json={sessions:[],announcements:[],availability:'available',serverTime:new Date().toISOString()};
     if(path==='/api/site-banner') json={alerts:[],revision:0};
     if(path==='/api/reviews') json={reviews:[],recommendations:[],count:0,average:0};
     if(path==='/api/team') json={team:[]};
     if(path==='/api/proof-videos') json={clips:[],nextCursor:null};
     if(path==='/api/site-content') json={content:{}};
     await route.fulfill({json});
    });
    await page.goto(origin); const book=page.locator('.polish-hero-actions a').first(); await book.waitFor(); await page.screenshot({path:'test-results/polish-debug.png'});
    // The shared portrait hero scrolls naturally on every screen.
    await book.scrollIntoViewIfNeeded();
    const box=await book.boundingBox(); assert.ok(box.y>=0&&box.y+box.height<=height,`booking ${width}: ${JSON.stringify(box)}`);
    assert.equal(await page.locator('.home-ad-dock').count(),0,'public ads removed');
    const contact=page.locator('.mobile-home-nav a[href="/contact"]');
    assert.equal(await contact.locator('svg').getAttribute('fill'),'none');
    assert.equal(await contact.locator('svg').getAttribute('stroke'),'currentColor');
    assert.doesNotMatch(await contact.innerText(),/☎|📞/);
    const barrier = await page.locator('.mobile-home-nav').boundingBox();
    if(barrier) assert.ok(box.y+box.height<=barrier.y, 'booking clears navigation');
    if(width<=700){
     const art=await page.locator('.cinema-hero-still').boundingBox();
     const intro=await page.locator('.cinema-hero-intro').boundingBox();
     const secondary=await page.locator('.polish-hero-actions .cinema-link').boundingBox();
     assert.ok(box.y>=intro.y+intro.height && box.y<intro.y+intro.height+24,'booking directly below hero copy');
     assert.ok(art.y >= secondary.y + secondary.height, 'the image panel follows the message and booking actions');
     assert.ok(box.width > width * .85 && Math.abs(box.width-secondary.width) < 2, 'approved full-width buttons have matching widths');
     assert.ok(Math.abs(box.x-intro.x)<2 && Math.abs(secondary.x-box.x)<2,'both hero buttons align with intro');
     assert.ok(secondary.y>=box.y+box.height && secondary.height>=44,'secondary button stacked with touch target');
     const more=page.locator('.mobile-home-nav button[aria-controls="bravo-navigation"]');
     await more.click();assert.equal(await more.getAttribute('aria-expanded'),'true');
     await more.click();assert.equal(await more.getAttribute('aria-expanded'),'false');
     await more.focus();await page.keyboard.press('Enter');assert.equal(await more.getAttribute('aria-expanded'),'true');
     await more.press('Escape');assert.equal(await more.getAttribute('aria-expanded'),'false');
    }
    assert.match(await book.getAttribute('href'),/portal/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
    await page.screenshot({path:`test-results/polish-${name}-${width}.png`});
    await page.locator('.polish-hero-actions').getByRole('link',{name:/^Explore Training$/i}).click();
    await page.waitForURL('**/training');await page.locator('.conversion-price').waitFor();
    assert.equal(await page.locator('#training').count(),1,'one training anchor across screen sizes');
    assert.ok(await page.locator('.conversion-price').isVisible(),'primary training price is the destination');
    assert.match(await page.locator('#training h2:visible').first().evaluate(el=>getComputedStyle(el).fontFamily),/Montserrat/);
    await page.goto(origin+'/our-approach');await page.waitForLoadState('networkidle');
    const methodArt=await page.locator('#method').evaluate(el=>{const s=getComputedStyle(el,'::before');return {background:s.backgroundImage,height:parseFloat(s.height)};});
    assert.match(methodArt.background,/bravo-logo-small/);assert.doesNotMatch(methodArt.background,/connection-rings/);assert.ok(methodArt.height<=100);
    await page.goto(origin);await page.waitForLoadState('networkidle');
    // A real scroll gesture ends the route's brief layout stabilization.
    await page.mouse.wheel(0,-10000);
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    if(width===390){
     const image=page.locator('.cinema-hero-still');
     await page.waitForFunction(()=>document.querySelector('.cinema-hero-still')?.hasAttribute('data-site-image-editable'));
     const bounds=await image.boundingBox();
     await page.mouse.move(bounds.x+bounds.width*.85,bounds.y+bounds.height*.35);await page.mouse.down();
     await page.getByRole('dialog',{name:'Edit this photo',exact:true}).waitFor();await page.mouse.up();
     await page.getByRole('button',{name:'Close media editor'}).click();
     await image.focus();await page.keyboard.press('F2');
     await page.getByRole('dialog',{name:'Edit this photo',exact:true}).waitFor();
     await page.getByRole('button',{name:'Close media editor'}).click();
     await page.waitForFunction(()=>document.querySelector('[data-site-soundtrack]')?.dataset.policyTested === 'true');
     await page.locator('.cinema-hero .cinema-eyebrow').click();
     await page.waitForFunction(()=>!document.querySelector('[data-site-soundtrack]').paused);
     await page.locator('[data-site-soundtrack]').evaluate(el=>el.dispatchEvent(new Event('error')));
     assert.equal(await page.locator('[data-site-soundtrack]').evaluate(el=>el.paused),true);
     await page.evaluate(()=>window.dispatchEvent(new Event('online')));
     await page.waitForFunction(()=>!document.querySelector('[data-site-soundtrack]').paused);
     assert.equal(playlist.revision, 0, 'same-revision playlist recovers after connectivity returns');
     await page.getByRole('button',{name:'Accessibility',exact:true}).click();
     const volume=page.getByRole('slider',{name:'Music volume'}), soundtrack=page.locator('[data-site-soundtrack]');
     await volume.press('Home');await page.waitForFunction(()=>document.querySelector('[data-site-soundtrack]').muted);
     assert.equal(await soundtrack.evaluate(el=>el.volume),0);
     await page.getByRole('button',{name:'Unmute music',exact:true}).click();
     // WebKit exposes native media volume at float32 precision.
     assert.ok(Math.abs(await soundtrack.evaluate(el=>el.volume)-.72)<1e-6);
     await volume.press('End');await volume.press('ArrowLeft');
     assert.ok(Math.abs(await soundtrack.evaluate(el=>el.volume)-.95)<1e-6);
     const range=await volume.boundingBox();await page.touchscreen.tap(range.x+range.width*.3,range.y+range.height/2);
     const savedVolume=await soundtrack.evaluate(el=>el.volume);assert.ok(savedVolume>0&&savedVolume<.6);
     assert.equal(await soundtrack.evaluate(el=>el.paused),false,'volume does not interrupt playback');
     assert.equal(await soundtrack.count(),1);
     await page.screenshot({path:`test-results/music-volume-${name}.png`});
     await page.getByRole('button',{name:'Manage Music',exact:true}).click();
     const dialog=page.getByRole('dialog',{name:'Manage Music'});await dialog.waitFor();
     await dialog.getByLabel('Add a song',{exact:false}).setInputFiles({name:'holiday.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('ID3holiday-fixture-for-upload')});
     await dialog.getByRole('button',{name:'Add song to lineup'}).click();
     await dialog.getByRole('button',{name:'Move holiday up'}).click();
     await dialog.getByLabel('Starting song').selectOption('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
     await page.screenshot({path:`test-results/music-editor-${name}.png`});
     await dialog.getByRole('button',{name:'Publish playlist'}).click();await dialog.waitFor({state:'hidden'});
     assert.equal(uploads,1);assert.equal(chunks,1);assert.equal(playlist.tracks[0].title,'holiday');
     await page.getByRole('button',{name:'Manage Music',exact:true}).click();
     await dialog.getByRole('button',{name:'Remove holiday',exact:true}).click();
     await dialog.getByRole('button',{name:'Publish playlist'}).click();await dialog.waitFor({state:'hidden'});assert.equal(playlist.tracks.length,1);assert.equal(await soundtrack.evaluate(el=>el.volume),savedVolume,'track changes preserve volume');
     await page.getByRole('button',{name:'Mute music',exact:true}).click();assert.equal(await page.locator('[data-site-soundtrack]').evaluate(el=>el.muted),true);
     if (await page.locator('[data-site-soundtrack]').evaluate(el=>el.paused)) await page.getByRole('button',{name:'Enable Music',exact:true}).click();
     await page.waitForFunction(()=>!document.querySelector('[data-site-soundtrack]').paused);
     await page.getByRole('button',{name:'Pause music',exact:true}).click();
     assert.equal(await page.locator('[data-site-soundtrack]').evaluate(el=>el.paused),true);
     await page.getByRole('button',{name:'Close accessibility options'}).click();
     await page.locator('.cinema-hero .cinema-eyebrow').click();
     await page.keyboard.press('Shift');
     assert.equal(await page.locator('[data-site-soundtrack]').evaluate(el=>el.paused),true,'ordinary gestures must preserve an explicit pause');
     await page.locator('[data-site-soundtrack]').evaluate(el=>el.dataset.testIdentity='same');
     await book.click();await page.waitForURL('**/portal?program=training');
     assert.equal(await page.locator('[data-site-soundtrack]').getAttribute('data-test-identity'),'same');
     assert.equal(await page.locator('[data-site-soundtrack]').evaluate(el=>el.muted),true);
     assert.equal(await soundtrack.evaluate(el=>el.volume),savedVolume,'navigation preserves volume');
     const savedPreferences=await page.evaluate(()=>localStorage.getItem('bravo-music-preferences'));
     await page.waitForLoadState('networkidle');await page.reload();
     await page.waitForFunction(value=>Math.abs((document.querySelector('[data-site-soundtrack]')?.volume ?? -1)-value)<1e-6,savedVolume).catch(async error=>{
      console.error('Reload volume state',await page.evaluate(()=>({volume:document.querySelector('[data-site-soundtrack]')?.volume,muted:document.querySelector('[data-site-soundtrack]')?.muted,preferences:localStorage.getItem('bravo-music-preferences')})));throw error;
     });
     assert.ok(Math.abs(await soundtrack.evaluate(el=>el.volume)-savedVolume)<1e-6,'reload preserves native volume');
     assert.equal(await page.evaluate(()=>localStorage.getItem('bravo-music-preferences')),savedPreferences,'reload preserves exact saved preferences');
     assert.equal(await soundtrack.evaluate(el=>el.muted),true);
     assert.equal(await soundtrack.evaluate(el=>el.paused),true);
    }
    if(width===375){
     await page.getByRole('button',{name:'Accessibility',exact:true}).click();
     await page.getByText('Use your device’s volume buttons or system volume control to adjust the music. You can still mute or pause it here.',{exact:true}).waitFor();
     assert.equal(await page.getByRole('slider',{name:'Music volume'}).count(),0);
     await page.getByRole('button',{name:'Mute music',exact:true}).click();assert.equal(await page.locator('[data-site-soundtrack]').evaluate(el=>el.muted),true);
     await page.getByRole('button',{name:'Unmute music',exact:true}).click();assert.equal(await page.locator('[data-site-soundtrack]').evaluate(el=>el.muted),false);
     await page.screenshot({path:`test-results/music-device-volume-${name}.png`});
     await page.getByRole('button',{name:'Close accessibility options'}).click();
     await page.goto(origin+'/our-approach');await page.waitForLoadState('networkidle');
     await page.locator('#method').scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/plain-shield-${name}.png`});
    }
    await context.close();console.log(`${name} ${width}: passed`);
   }
  }finally{await browser.close();}
 }
}finally{server.close();}
