// Actual TURN/TCP relay with direct ICE candidates disabled. Everything is
// local: synthetic camera, test users, temporary database, loopback TURN server.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium } from 'playwright';

await mkdir('test-results',{recursive:true});
const secret=randomBytes(32).toString('hex'), port=53480;
const turn=spawn(process.env.TURN_TEST_BINARY || 'turnserver',['-n','--listening-ip=127.0.0.1','--relay-ip=127.0.0.1',`--listening-port=${port}`,'--min-port=55000','--max-port=55100','--realm=bravo-local-test','--use-auth-secret',`--static-auth-secret=${secret}`,'--no-cli',`--cli-password=${randomBytes(16).toString('hex')}`,'--allow-loopback-peers','--no-multicast-peers','--no-udp','--no-tls','--no-dtls','--simple-log','--log-file=stdout','--pidfile=/tmp/bravo-turn-test.pid'],{stdio:['ignore','pipe','pipe']});
let turnLog='',turnError;turn.on('error',error=>{turnError=error;});
turn.stdout.on('data',b=>{turnLog=(turnLog+b).slice(-32000);});turn.stderr.on('data',b=>{turnLog=(turnLog+b).slice(-32000);});
let replica,server,browser;
const evidence=[];
try {
  for(let attempt=0;;attempt++){
    if(turnError)throw turnError;
    const open=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});
    if(open)break;if(attempt>50)throw new Error('Local TURN did not start.');await new Promise(r=>setTimeout(r,100));
  }
  replica=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'7.0.14'}});
  Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:replica.getUri(),MONGODB_DB:'relay_browser_test',BRAVO_TURN_PROVIDER:'coturn',BRAVO_TURN_URLS:`turn:127.0.0.1:${port}?transport=tcp`,BRAVO_TURN_SHARED_SECRET:secret,BRAVO_LIVE_ICE_POLICY:'relay'});
  delete process.env.STRIPE_SECRET_KEY;
  const {default:app}=await import('../server/client-services-app.js');
  const {connectDb}=await import('../server/db.js');
  const {User,Session,LiveSession,LivePeer,Subscription}=await import('../server/models.js');
  await connectDb();
  const owner=await User.create({name:'Relay Test Trainer',role:'owner',passwordHash:'fixture-only'});process.env.OWNER_USER_ID=String(owner._id);
  const token=randomBytes(32).toString('hex');await Session.create({userId:owner._id,tokenHash:createHash('sha256').update(token).digest('hex'),issuedAt:new Date(),lastSeenAt:new Date(),expiresAt:new Date(Date.now()+3600000)});
  server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGIN=origin;
  browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const trainerContext=await browser.newContext({viewport:{width:390,height:900}});
  await trainerContext.addCookies([{name:'bravo_session',value:token,url:origin}]);
  await trainerContext.addInitScript(()=>{window.relayTestPCs=[];const PC=RTCPeerConnection;window.RTCPeerConnection=class extends PC{constructor(...args){super(...args);window.relayTestPCs.push(this);}};});
  const phone=await trainerContext.newPage();phone.setDefaultTimeout(20000);const errors=[];phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(origin+'/live/studio');await phone.getByLabel('Dog’s name').fill('Relay Test Dog');
  await phone.getByRole('radio',{name:/PUBLIC LIVE/}).check();await phone.getByRole('checkbox',{name:/I have permission/}).check();
  await phone.getByRole('button',{name:'Enable camera preview',exact:true}).click();await phone.getByRole('button',{name:'● Start live',exact:true}).click();
  await phone.getByRole('button',{name:'■ End live session',exact:true}).waitFor();
  const record=await LiveSession.findOne({open:true});assert.ok(record && record.status==='live');
  const viewers=[];
  for(const width of [390,1440]){
    const c=await browser.newContext({viewport:{width,height:900}});
    await c.addInitScript(()=>{window.relayTestPCs=[];window.viewerCameraRequests=0;const PC=RTCPeerConnection;window.RTCPeerConnection=class extends PC{constructor(...args){super(...args);window.relayTestPCs.push(this);}};navigator.mediaDevices.getUserMedia=async()=>{window.viewerCameraRequests++;throw new Error('A guest viewer must never request camera access.');};});
    const p=await c.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
    await p.goto(origin+'/live?session='+record._id);await p.getByRole('button',{name:/Watch live/}).click();
    await p.waitForFunction(()=>{const v=document.querySelector('.live-video-stage video');return v && v.videoWidth>0 && v.currentTime>.5;},null,{timeout:50000});
    const candidate=await p.evaluate(async()=>{
      const pc=window.relayTestPCs.find(pc=>pc.connectionState==='connected');if(!pc)throw new Error('No connected viewer');
      if(pc.getConfiguration().iceTransportPolicy!=='relay')throw new Error('Direct candidates were not disabled');
      const stats=await pc.getStats();let pair;
      stats.forEach(s=>{if(s.type==='transport'&&s.selectedCandidatePairId)pair=stats.get(s.selectedCandidatePairId);});
      if(!pair)throw new Error('No selected ICE candidate pair');
      const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
      return {localType:local.candidateType,remoteType:remote.candidateType,relayProtocol:local.relayProtocol,url:local.url,bytesReceived:pair.bytesReceived};
    });
    assert.equal(candidate.localType,'relay');assert.equal(candidate.remoteType,'relay');assert.equal(candidate.relayProtocol,'tcp');assert.ok(candidate.bytesReceived>0);
    assert.equal(await p.evaluate(()=>window.viewerCameraRequests),0);assert.equal(await Subscription.countDocuments({}),0);
    assert.equal((await c.cookies()).filter(cookie=>cookie.name==='bravo_session').length,0);
    assert.match(await p.locator('.live-player-caption').innerText(),/guests welcome/);
    const before=await p.locator('.live-video-stage video').evaluate(v=>v.currentTime);await p.waitForFunction(time=>document.querySelector('.live-video-stage video').currentTime>time+.6,before);
    evidence.push({width,guest:true,subscriptionRequired:false,...candidate});viewers.push(p);
    console.log('PASS',width,'guest receives advancing video using selected relay/TCP candidates on both peers, without camera permission or subscription.');
  }
  await phone.getByText('2 viewers',{exact:false}).waitFor();assert.equal(await LivePeer.countDocuments({sessionId:record._id}),2);
  await phone.getByRole('button',{name:'Microphone off',exact:true}).click();
  for(const p of viewers){await p.getByRole('button',{name:'Enable audio',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.live-video-stage video').srcObject.getAudioTracks().length>0);}
  await phone.getByRole('button',{name:'■ End live session',exact:true}).click();
  for(const p of viewers)await p.getByText('This session has ended or requires client access.',{exact:true}).waitFor();
  assert.equal(await LivePeer.countDocuments({sessionId:record._id}),0);assert.deepEqual(errors,[]);
  console.log('PASS microphone over relayed media, two independent anonymous viewers, and ended-session cleanup.');
}finally{
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mongoose.disconnect();await replica?.stop();turn.kill('SIGTERM');
  await writeFile('test-results/live-relay-browser.json',JSON.stringify({evidence,network:'isolated loopback TURN/TCP, not a physical carrier'},null,2));
  await writeFile('test-results/live-relay-turn.log',turnLog.replaceAll(secret,'[redacted test secret]'));
}
