import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { errorInput, monitorRequests } from '../server/monitoring.js';
import { api } from '../client/src/api.js';
import { enableMonitoring } from '../client/src/telemetry.js';
const diagnosticId='11111111-1111-4111-8111-111111111111';
test('live timeout reports bounded timing and correlation without URL, identity or field values',async()=>{
 const fetch=globalThis.fetch, calls=[];enableMonitoring(true);
 globalThis.fetch=(url,options)=>{calls.push({url,options});if(url==='/api/telemetry/error')return Promise.resolve({ok:true});return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError'))));};
 try{await assert.rejects(api('/live',{timeoutMs:5}),{code:'request_timeout'});const reported=JSON.parse(calls[1].options.body);assert.ok(errorInput.safeParse(reported).success);assert.equal(reported.timing.diagnosticId,calls[0].options.headers['X-Bravo-Diagnostic-Id']);assert.equal(reported.timing.timeoutMs,5);assert.ok(reported.timing.elapsedMs>=4);
 assert.equal(errorInput.safeParse({...reported,timing:{...reported.timing,url:'/live?private=secret'}}).success,false);assert.equal(errorInput.safeParse({...reported,area:'account'}).success,false);
 }finally{globalThis.fetch=fetch;enableMonitoring(false);}
});
test('status timing logs aborted polling once but never private streaming traffic',()=>{
 const warn=console.warn,logs=[];console.warn=value=>logs.push(JSON.parse(value));
 try{for(const url of ['/api/live','/api/live/private-session/stream']){const res=new EventEmitter();res.statusCode=200;res.setHeader=()=>{};monitorRequests({method:'GET',originalUrl:url,get:()=>diagnosticId},res,()=>{});res.emit('close');}
 assert.equal(logs.length,1);assert.equal(logs[0].diagnosticId,diagnosticId);assert.equal(logs[0].outcome,'aborted');assert.equal(logs[0].event,'bravo.live_status_timing');
 }finally{console.warn=warn;}
});
