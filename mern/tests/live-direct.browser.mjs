import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium, webkit } from 'playwright';

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: replica.getUri(), MONGODB_DB: 'live_direct_browser' });
delete process.env.BRAVO_LIVE_ENABLED; delete process.env.STRIPE_SECRET_KEY;
let server, chrome, safari;
await mkdir('test-results', { recursive: true });
try {
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, LiveSession, LivePeer } = await import('../server/models.js');
  await connectDb();
  const trainer = await User.create({ name: 'David', role: 'owner', passwordHash: 'fixture-only' });
  process.env.OWNER_USER_ID = String(trainer._id);
  const token = randomBytes(32).toString('hex');
  await Session.create({ userId: trainer._id, tokenHash: createHash('sha256').update(token).digest('hex'), issuedAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.APP_ORIGIN = origin;
  chrome = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  safari = await webkit.launch();
  const trainerContext = await chrome.newContext({ viewport: { width: 390, height: 1000 } });
  await trainerContext.addCookies([{ name: 'bravo_session', value: token, domain: '127.0.0.1', path: '/' }]);
  const phone = await trainerContext.newPage(), errors = [];
  phone.on('pageerror', e => errors.push(e.message));
  let lostAnswerResponse = false;
  await phone.route('**/api/live/*/peers/*/answer', async route => {
    if (!lostAnswerResponse) {
      lostAnswerResponse = true;
      const delivered = await route.fetch(); assert.equal(delivered.status(), 200);
      await route.abort('failed'); // Answer persisted, but the phone sees a network failure.
    } else await route.continue();
  });
  await phone.goto(`${origin}/live/studio`);
  await phone.getByLabel('Dog’s name').fill('Gunner');
  await phone.getByRole('radio', { name: /PUBLIC LIVE/ }).check();
  await phone.getByRole('checkbox', { name: /I have permission/ }).check();
  await phone.getByLabel('Training focus').fill('Field obedience');
  await phone.getByRole('button', { name: 'Enable camera preview' }).click();
  await phone.waitForFunction(() => document.querySelector('.live-camera-preview video')?.srcObject?.getVideoTracks().some(t => t.readyState === 'live' && !t.muted));
  assert.deepEqual((await (await fetch(`${origin}/api/live`)).json()).announcements, [], 'preview never advertises LIVE');
  await phone.getByRole('button', { name: '● Start live' }).click();
  await phone.getByRole('button', { name: '■ End live session' }).waitFor();
  const record = await LiveSession.findOne({ open: true }); assert.equal(record.transport, 'direct'); assert.equal(record.status, 'live'); assert.ok(record.publication.framesEncoded > 0 && record.publication.framesDecoded > 0); assert.equal(record.trainingFocus, 'Field obedience');
  const homeContext = await chrome.newContext({ viewport: { width: 1440, height: 1000 } });
  const home = await homeContext.newPage(); await home.goto(origin);
  await home.locator('.hero-live li').waitFor();
  assert.match(await home.locator('.hero-live').innerText(), /David/);
  const viewers = [];
  for (const [name, engine] of [['chromium', chrome], ['webkit', safari], ['chromium-third', chrome], ['chromium-fourth', chrome]]) {
    const context = await engine.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.__cameraRequests = 0; navigator.mediaDevices.getUserMedia = async () => { window.__cameraRequests++; throw new Error('Viewers must not request camera access'); }; });
    await page.goto(`${origin}/live?session=${record._id}`);
    await page.getByRole('button', { name: /Watch live/ }).click();
    await page.waitForFunction(() => { const video = document.querySelector('.live-video-stage video'); return video?.videoWidth > 0 && video.currentTime > 0.5; }, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.__cameraRequests), 0);
    await page.evaluate(() => { window.__remoteStream = document.querySelector('.live-video-stage video').srcObject; });
    await page.screenshot({ path: `test-results/direct-live-${name}.png`, fullPage: true });
    viewers.push(page);
    console.log(`PASS real direct video frames: Chromium phone to ${name}, no viewer camera permission`);
  }
  await phone.getByText('4 viewers', { exact: false }).waitFor();
  assert.equal(await LivePeer.countDocuments({ sessionId: record._id }), 4);
  for (const page of viewers) {
    const before = await page.locator('.live-video-stage video').evaluate(video => video.currentTime);
    await page.waitForFunction(time => document.querySelector('.live-video-stage video').currentTime > time + 0.5, before);
  }
  console.log('PASS four simultaneous viewers receive advancing video beyond the former cap');
  // A second eligible staff account publishes its own real synthetic camera.
  const secondTrainer = await User.create({ name: 'Ashley TEST', publicName: 'Second trainer TEST', role: 'staff', passwordHash: 'fixture-only' });
  const secondToken = randomBytes(32).toString('hex');
  await Session.create({ userId: secondTrainer._id, tokenHash: createHash('sha256').update(secondToken).digest('hex'), issuedAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now()+3600000) });
  const secondContext = await chrome.newContext({ viewport: { width:390, height:1000 } });
  await secondContext.addCookies([{ name:'bravo_session', value:secondToken, domain:'127.0.0.1', path:'/' }]);
  const secondPhone = await secondContext.newPage(); await secondPhone.goto(`${origin}/live/studio`);
  await secondPhone.getByLabel('Dog’s name').fill('Second test dog');
  await secondPhone.getByRole('radio',{name:/PUBLIC LIVE/}).check();
  await secondPhone.getByRole('checkbox',{name:/I have permission/}).check();
  await secondPhone.getByRole('button',{name:'Enable camera preview'}).click();
  await secondPhone.getByRole('button',{name:'● Start live'}).click();
  await secondPhone.getByRole('button',{name:'■ End live session'}).waitFor();
  await home.waitForFunction(()=>document.querySelectorAll('.hero-live li').length===2,null,{timeout:5000});
  await viewers[0].getByRole('button',{name:/Second trainer TEST/}).click();
  await viewers[0].getByRole('button',{name:/Watch live/}).click();
  await viewers[0].waitForFunction(()=>{const video=document.querySelector('.live-video-stage video');return video?.videoWidth>0&&video.currentTime>0.5;},null,{timeout:60000});
  assert.match(await viewers[0].locator('.live-player-caption').innerText(),/Second test dog/i);
  await secondPhone.getByRole('button',{name:'■ End live session'}).click();
  await home.waitForFunction(()=>document.querySelectorAll('.hero-live li').length===1,null,{timeout:5000});
  await viewers[0].waitForFunction(()=>document.querySelector('.live-player-caption')?.textContent.includes('Gunner'));
  await viewers[0].getByRole('button',{name:/Watch live/}).click();
  await viewers[0].waitForFunction(()=>document.querySelector('.live-video-stage video')?.currentTime>0.5,null,{timeout:60000});
  await viewers[0].evaluate(()=>{window.__remoteStream=document.querySelector('.live-video-stage video').srcObject;});
  await secondPhone.getByRole('button',{name:'Enable camera preview'}).click();
  await secondPhone.getByRole('button',{name:'● Start live'}).click();
  await secondPhone.getByRole('button',{name:'■ End live session'}).waitFor();
  const abandoned = await LiveSession.findOne({ trainerId:secondTrainer._id, open:true });
  await home.waitForFunction(()=>document.querySelectorAll('.hero-live li').length===2,null,{timeout:5000});
  await secondPhone.route('**/api/live/*/end',route=>route.abort('failed'));
  const tabClosedAt = Date.now();
  await secondPhone.close();
  await home.waitForFunction(()=>document.querySelectorAll('.hero-live li').length===1,null,{timeout:11000});
  let expired, lastSnapshot;
  do {
    lastSnapshot = await fetch(`${origin}/api/live`).then(r=>r.json());
    expired = await LiveSession.findById(abandoned._id);
    if (!expired.open) break;
    await new Promise(resolve=>setTimeout(resolve,500));
  } while(Date.now()-tabClosedAt<23000);
  assert.equal(expired.open,false,JSON.stringify({lastSnapshot,session:expired.toObject(),elapsed:Date.now()-tabClosedAt}));
  assert.ok(!lastSnapshot.announcements.some(item=>item.trainerId===String(secondTrainer._id)));
  await secondContext.close();
  console.log('PASS closed publisher tab with failed end request loses LIVE badge in eight seconds and expires at twenty seconds');
  console.log('PASS two real synthetic publishers, automatic staff name, working stream selection, independent stop within five seconds');
  await phone.getByRole('button', { name: 'Microphone off' }).click();
  for (const page of viewers) {
    await page.waitForFunction(() => window.__remoteStream.getAudioTracks().some(t => t.readyState === 'live' && !t.muted), null, { timeout: 20000 });
    await page.getByRole('button', { name: 'Enable audio' }).click();
    await page.getByRole('button', { name: 'Mute audio' }).waitFor();
  }
  await viewers[0].getByRole('button', { name: 'Full screen' }).click();
  await viewers[0].waitForFunction(() => !!document.fullscreenElement);
  await viewers[0].evaluate(() => document.exitFullscreen());
  await phone.getByRole('button', { name: 'Flip camera' }).click();
  await phone.locator('.live-camera-preview video.is-mirrored').waitFor();
  await phone.getByRole('button', { name: 'Microphone on' }).click();
  await phone.waitForFunction(() => document.querySelector('.live-camera-preview video').srcObject.getAudioTracks().length === 0);
  await phone.screenshot({ path: 'test-results/direct-live-phone.png', fullPage: true });
  await phone.evaluate(() => { window.__phoneStream = document.querySelector('.live-camera-preview video').srcObject; });
  await phone.getByRole('button', { name: '■ End live session' }).click();
  await phone.waitForFunction(() => window.__phoneStream.getTracks().every(t => t.readyState === 'ended'));
  for (const page of viewers) await page.waitForFunction(() => window.__remoteStream.getTracks().every(t => t.readyState === 'ended'), null, { timeout: 30000 });
  assert.equal(await LivePeer.countDocuments({ sessionId: record._id }), 0);
  assert.equal((await LiveSession.findById(record._id)).status, 'ended');
  await home.waitForFunction(()=>!document.querySelector('.hero-live'),null,{timeout:5000});
  assert.equal(lostAnswerResponse, true);
  assert.deepEqual(errors, []);
  console.log('PASS lost-answer response recovery, microphone enable/disable, live camera switch, viewer count, local track cleanup, peer cleanup and remote shutdown');
} finally {
  await chrome?.close(); await safari?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); await replica.stop();
}
