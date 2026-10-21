import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_DRAFT_KEY, DRAFT_TTL_MS, bookingEntry, cleanBookingDraft, readBookingDraft, writeBookingDraft } from '../client/src/booking-draft.js';
const fixture = { entry:'program=training', ids:['training'], form:{dogName:'Biscuit',phone:'555',address:'Fixture',notes:'Keep this'}, visits:[{date:'2026-11-02',time:'10:00',service:'training'}], trainerId:'111111111111111111111111', trainerName:'Fixture Trainer', introDone:true, bookingStep:'review', timeConfirmed:true, requestKey:'11111111-1111-4111-8111-111111111111' };
function memory() { const entries = new Map(); return {getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)}; }
test('bounded versioned draft round-trips every booking field and discards unknown private fields', () => {
 const store=memory(); const draft=writeBookingDraft('guest',{...fixture,password:'never',quote:{dueNowCents:1}},{store,now:100});
 assert.deepEqual(readBookingDraft('guest',{store,now:101}),draft); assert.equal(draft.form.dogName,'Biscuit'); assert.equal(draft.bookingStep,'review'); assert.equal(draft.requestKey,fixture.requestKey); assert.equal(draft.password,undefined); assert.equal(draft.quote,undefined);
 assert.equal(bookingEntry(new URLSearchParams('resume=1&program=training&focus=basic-obedience')), 'focus=basic-obedience&program=training');
});
test('guest handoff is explicit; account changes, expiry and discard cannot expose another draft',()=>{
 const store=memory();writeBookingDraft('guest',fixture,{store,now:100});assert.equal(readBookingDraft('user:a',{store,now:101}),null);
 writeBookingDraft('guest',fixture,{store,now:100}); const claimed=readBookingDraft('user:a',{store,now:101,claimGuest:true});assert.ok(claimed);writeBookingDraft('user:a',claimed,{store,now:101});assert.equal(readBookingDraft('user:b',{store,now:102,claimGuest:true}),null);
 writeBookingDraft('user:a',fixture,{store,now:100});assert.equal(readBookingDraft('user:a',{store,now:100+DRAFT_TTL_MS+1}),null);
 writeBookingDraft('user:a',fixture,{store,now:100});writeBookingDraft('user:a',null,{store});assert.equal(store.getItem(BOOKING_DRAFT_KEY),undefined);
});
test('malformed, empty and blocked storage cannot crash the booking form',()=>{
 const store=memory();store.setItem(BOOKING_DRAFT_KEY,'{');assert.equal(readBookingDraft('guest',{store}),null);
 assert.equal(cleanBookingDraft({...fixture,form:{},trainerId:'',visits:[]}),null);
 assert.equal(cleanBookingDraft({...fixture,form:{},trainerId:'',visits:[],dogCount:2}).dogCount,2);
 assert.equal(cleanBookingDraft({...fixture,visits:[{date:'oops',time:'100:00',service:'training'}]}),null);
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
 assert.equal(readBookingDraft('guest',{store:blocked}),null);assert.equal(writeBookingDraft('guest',fixture,{store:blocked}).form.dogName,'Biscuit');
});
