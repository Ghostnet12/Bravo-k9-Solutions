import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { CONTENT_KEYS } from '../shared/site-content-keys.js';
import { renderSiteContent } from '../server/content-html.js';
test('website edits persist, reject untrusted inputs, preserve live data and support undo', {timeout:180000},async()=>{
  const replica=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'7.0.14'}});
  process.env.NODE_ENV='test';process.env.MONGODB_URI=replica.getUri();process.env.MONGODB_DB='site_content_test';process.env.APP_ORIGIN='http://localhost:5173';
  try{
    const {default:app}=await import('../server/site-image-app.js');const {connectDb}=await import('../server/db.js');const {User,Session,AuditEvent}=await import('../server/models.js');await connectDb();
    const cookies={};for(const name of ['owner','administrator','staff','member']){const user=await User.create({name,role:name==='administrator'?'owner':name,passwordHash:'fixture'});const token=randomBytes(32).toString('hex');await Session.create({tokenHash:createHash('sha256').update(token).digest('hex'),userId:user._id,expiresAt:new Date(Date.now()+3600000)});cookies[name]=`bravo_session=${token}`;}
    const key=Object.keys(CONTENT_KEYS).find(key=>CONTENT_KEYS[key].text),linkKey=Object.keys(CONTENT_KEYS).find(key=>CONTENT_KEYS[key].link);
    const put=(who,k,data,origin=process.env.APP_ORIGIN)=>{const r=request(app).put(`/api/site-content/${k}`).set('Origin',origin);if(who)r.set('Cookie',cookies[who]);return r.send(data);};
    const data={expectedRevision:0,value:{text:'New copy <script>not executable</script>',font:'georgia',background:'gradient',backgroundColor:'#101010',gradientEnd:'#ba9a64',angle:140}};
    for(const who of [null,'staff','member'])await put(who,key,data).expect(who?403:401);
    await put('owner',key,data,'https://wrong.example').expect(403);
    await put('owner','unknown-field',data).expect(400);
    await put('owner','site-theme',data).expect(400);
    for(const value of [{color:'url(https://bad.example)'},{font:'evil-font'},{fontSize:999},{text:'x'.repeat(8001)},{html:'<img onerror=alert(1)>'}])await put('owner',key,{expectedRevision:0,value}).expect(400);
    for(const link of ['javascript:alert(1)','//evil.example','/\\evil.example','data:text/html,bad'])await put('owner',linkKey,{expectedRevision:0,value:{link}}).expect(400);
    await put('owner',key,data).expect(200);await put('administrator',key,data).expect(409);
    const entries=(await request(app).get('/api/site-content').expect(200)).body.entries;assert.equal(entries[key].value.text,data.value.text);
    const rendered=renderSiteContent(`<html><head></head><body><p data-site-content-key="${key}">Original</p></body></html>`,entries);
    assert.ok(rendered.includes('New copy &lt;script&gt;not executable&lt;/script&gt;'));assert.ok(!rendered.includes('<script>not executable'));assert.ok(rendered.includes('linear-gradient(140deg'));
    await put('administrator',key,{expectedRevision:1,value:{text:'Second edit'}}).expect(200);
    await put('owner',key,{expectedRevision:2,undo:true}).expect(200);
    assert.equal((await request(app).get('/api/site-content')).body.entries[key].value.text,data.value.text);
    await put('owner',key,{expectedRevision:3,value:{}}).expect(200);
    assert.deepEqual((await request(app).get('/api/site-content')).body.entries[key].value,{});
    assert.equal(await AuditEvent.countDocuments({action:'site-content.published'}),4);
    const blocked=await User.findOne({name:'owner'});blocked.blocked=true;await blocked.save();await put('owner',key,{expectedRevision:4,value:{text:'blocked'}}).expect(401);
    await request(app).get('/api/public-page?path=../../server/models.js').expect(404);
  }finally{await mongoose.disconnect();await replica.stop();}
});
