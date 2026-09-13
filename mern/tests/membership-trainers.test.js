import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { manualMonthTerm, membershipDate, termActive } from '../shared/membership-terms.js';
import { trainerOptions, jointTrainerPair, bookingTrainerIds, trainerChoice, acceptedTrainerIds, scheduledTrainerLabel, JOINT_TRAINER_ID } from '../shared/trainers.js';
const david={id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'David Northrop',spotsRemaining:5,activeDogs:0,limit:5};
const ashley={id:'bbbbbbbbbbbbbbbbbbbbbbbb',name:'Ashley Northrop',spotsRemaining:2,activeDogs:3,limit:5};
for(const [start,end] of [['2026-01-01','2026-02-01'],['2026-01-31','2026-02-28'],['2028-01-31','2028-02-29'],['2026-08-31','2026-09-30'],['2026-12-31','2027-01-31'],['2026-03-01','2026-04-01'],['2026-11-01','2026-12-01']]) test(`manual membership calendar month ${start} → ${end}`,()=>{
  const term=manualMonthTerm(start);assert.equal(membershipDate(term.validFrom),start);assert.equal(membershipDate(term.validUntil),end);
  for(const value of Object.values(term))assert.equal(DateTime.fromJSDate(value,{zone:'America/Chicago'}).hour,0);
});
test('backdating uses the chosen start, never the account creation date',()=>{
  const term={...manualMonthTerm('2026-01-01'),status:'active'};
  assert.equal(termActive(term,new Date('2026-01-26T12:00:00Z')),true);
  assert.equal(termActive(term,new Date('2026-01-01T05:59:59Z')),false);
  assert.equal(termActive(term,new Date('2026-02-01T05:59:59Z')),true);
  assert.equal(termActive(term,new Date('2026-02-01T06:00:00Z')),false);
});
test('future starts and DST boundaries are respected',()=>{
  const t={...manualMonthTerm('2027-03-01'),status:'active'};
  assert.equal(termActive(t,new Date('2027-02-28T12:00:00Z')),false);
  assert.equal(t.validFrom.toISOString(),'2027-03-01T06:00:00.000Z');
  assert.equal(t.validUntil.toISOString(),'2027-04-01T05:00:00.000Z');
});
test('invalid or timestamp input cannot silently normalize into another date',()=>{
  for(const value of ['',null,0,'2026-02-29','2026-01-32','2026-13-01','0000-01-01','2026-1-1','2026-01-01T00:00:00Z'])assert.throws(()=>manualMonthTerm(value),/valid membership start/);
});
test('David and Ashley is a third option with capacity limited by both real staff profiles',()=>{
  const options=trainerOptions([ashley,david]);assert.deepEqual(options.map(p=>p.name),['David Northrop','Ashley Northrop','David and Ashley']);
  const pair=options[2];assert.equal(pair.id,JOINT_TRAINER_ID);assert.equal(pair.spotsRemaining,2);assert.deepEqual(pair.staffIds,[david.id,ashley.id]);assert.equal(pair.disabled,false);
  assert.equal(trainerOptions([david,{...ashley,spotsRemaining:0}])[2].full,true);
});
test('missing, blocked, ambiguous, or virtual profiles do not invent a trainer identity',()=>{
  for(const people of [[david],[david,{...ashley,blocked:true}],[david,ashley,{...ashley,id:'cccccccccccccccccccccccc'}],[david,{id:JOINT_TRAINER_ID,name:'Ashley'}]])assert.equal(trainerOptions(people).find(p=>p.joint).disabled,true);
  assert.equal(jointTrainerPair([{...david,name:'Dave Northrop'},{...ashley,name:'Ashley Leverock'}]).length,2);
});
test('legacy and multi-trainer bookings resolve consistently without duplicating the primary trainer',()=>{
  assert.deepEqual(bookingTrainerIds({staffId:david.id}),[david.id]);
  assert.equal(trainerChoice({staffId:david.id,staffIds:[david.id,ashley.id]}),JOINT_TRAINER_ID);
  assert.deepEqual(bookingTrainerIds({requestedStaffIds:[david.id,ashley.id]}),[david.id,ashley.id]);
  assert.equal(scheduledTrainerLabel({staffId:{...david,_id:david.id}}),'David Northrop');
  assert.equal(scheduledTrainerLabel({}),'Awaiting assignment');
});
test('partial acceptance names the remaining trainer and does not claim both accepted',()=>{
  const b={staffId:david,staffIds:[david,ashley],trainerAcceptanceRequired:true,trainerAcceptedIds:[david.id]};
  assert.equal(scheduledTrainerLabel(b),'Awaiting acceptance from Ashley Northrop');
  assert.deepEqual(acceptedTrainerIds(b),[david.id]);
  assert.equal(scheduledTrainerLabel({...b,trainerAcceptanceRequired:false,trainerAcceptedIds:[david.id,ashley.id]}),'David and Ashley');
});
