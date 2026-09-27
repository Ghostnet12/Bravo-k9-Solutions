import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICES, quote, rescheduledQuote, publicCatalogSnapshot } from '../shared/catalog.js';
import { validatedCheckoutPricing } from '../server/payments.js';
import { renderSiteContent } from '../server/content-html.js';
import { publicTrainerProfile } from '../shared/trainer-profile.js';
import { trainerOptions, scheduledTrainerLabel } from '../shared/trainers.js';
import { contentStyle } from '../shared/site-content.js';
import { contentInput } from '../server/site-content.js';

test('published rates flow through multi-dog quotes, bundles, checkout and historical rescheduling',()=>{
 const catalog=SERVICES.map(row=>({...row,...({training:{cents:22500,additionalDogCents:12500},walking:{cents:3500},online:{cents:9000,bundleCents:30000}}[row.id]||{})}));
 for(const [ids,dogCount,total]of [[['training'],3,47500],[['training','online'],2,42500],[['online'],1,9000]]){
  const booking={serviceIds:ids,dogCount,visits:[],quote:quote(ids,[],{dogCount},catalog)};
  assert.equal(booking.quote.dueNowCents,total);assert.equal(validatedCheckoutPricing(booking).dueNowCents,total);
  for(const mutate of [b=>b.quote.lines[0].unitCents=1,b=>b.quote.dueNowCents=1,b=>b.quote.rateSnapshot.pop(),b=>b.quote.rateSnapshot[0].cents=-1,b=>b.dogCount++]){
   if(ids[0]==='online' && mutate.toString().includes('dogCount'))continue;
   const tampered=structuredClone(booking);mutate(tampered);assert.throws(()=>validatedCheckoutPricing(tampered));
  }
 }
 const visits=[{date:'2026-10-05',time:'09:00',service:'walking'}];
 const booking={serviceIds:['walking'],dogCount:2,visits,quote:quote(['walking'],visits,{dogCount:2},catalog)};
 assert.equal(validatedCheckoutPricing(booking).dueNowCents,7000);
 const next=[...visits,{date:'2026-10-06',time:'09:00',service:'walking'}];
 const rescheduled={...booking,visits:next,quote:rescheduledQuote(booking,next)};
 assert.equal(validatedCheckoutPricing(rescheduled).dueNowCents,14000);
 const free=catalog.map(row=>row.id==='training'?{...row,cents:0,additionalDogCents:0}:row);
 assert.equal(validatedCheckoutPricing({serviceIds:['training'],dogCount:2,quote:quote(['training'],[],{dogCount:2},free)}).dueNowCents,0);
});
test('published public prices render before JavaScript, with a minimal safe catalog snapshot',()=>{
 const catalog=SERVICES.map(row=>({...row,cents:12345,updatedBy:'private-actor',privateField:'do-not-publish'}));
 const html=renderSiteContent('<html><head></head><body><span data-site-price="training" data-site-price-field="cents">$200</span></body></html>',{},undefined,catalog);
 assert.match(html,/\$123.45/);assert.doesNotMatch(html,/\$200<\/span>|private-actor|do-not-publish/);assert.match(html,/name="bravo-catalog"/);
 const snapshot=publicCatalogSnapshot(catalog);assert.equal(snapshot[0].cents,12345);assert.equal(snapshot[0].updatedBy,undefined);
});
test('public trainer rename preserves portrait key, real staff IDs and the joint trainer option',()=>{
 const david={id:'111111111111111111111111',name:'David Northrop'},ashley={id:'222222222222222222222222',name:'Ashley Northrop',publicName:'Ashley Example',publicProfileRevision:1};
 const before=publicTrainerProfile({...ashley,publicName:undefined}),after=publicTrainerProfile(ashley);
 assert.equal(before.imageKey,after.imageKey);assert.equal(before.image,after.image);assert.equal(after.name,'Ashley Example');assert.equal(after.id,ashley.id);
 assert.equal(trainerOptions([publicTrainerProfile(david),after]).find(row=>row.joint).disabled,false);
 const choices=trainerOptions([david,ashley]);assert.equal(choices.find(row=>row.joint).disabled,false);assert.equal(choices.find(row=>row.id===ashley.id).name,'Ashley Example');
 assert.equal(scheduledTrainerLabel({staffId:ashley}),'Ashley Example');
 assert.equal(scheduledTrainerLabel({staffIds:[ashley],trainerAcceptanceRequired:true}),'Awaiting acceptance from Ashley Example');
});
test('background photos use public uploaded image paths and reject CSS or external URL injection',()=>{
 const path='/api/site-images/background-11111111-1111-1111-1111-111111111111/image?v=1';
 assert.equal(contentInput.safeParse({background:'image',backgroundImage:path}).success,true);
 assert.match(contentStyle({background:'image',backgroundImage:path}).backgroundImage,/background-11111111/);
 for(const backgroundImage of ['javascript:alert(1)','https://tracking.example/a.jpg','/api/lessons/private/video',`${path}");color:red;`]){
  assert.equal(contentInput.safeParse({background:'image',backgroundImage}).success,false);
  assert.equal(contentStyle({background:'image',backgroundImage}).backgroundImage,undefined);
 }
});
