import test from 'node:test';
import assert from 'node:assert/strict';
import { manualMembershipDates, businessDate } from '../shared/manual-membership.js';
import { trainerOptions, sharedTrainerPair, selectedTrainerId, bookingTrainerIds, SHARED_TRAINER_ID } from '../shared/trainer-selection.js';
const now = new Date('2026-09-13T03:00:00Z');
test('calendar-month start dates allow backdating and future dates, clamp month ends, and reject impossible dates', () => {
  for (const [start,end] of [['2026-01-01','2026-02-01'],['2026-01-31','2026-02-28'],['2028-01-31','2028-02-29'],['2026-12-31','2027-01-31'],['2030-03-09','2030-04-09']]) assert.equal(manualMembershipDates(start,now).endDate,end);
  assert.equal(manualMembershipDates('2026-01-01',now).expired,true);
  assert.equal(manualMembershipDates('2027-01-01',now).expired,false);
  assert.equal(businessDate(new Date('2026-01-01T03:00:00Z')),'2025-12-31');
  for (const start of ['2026-02-29','2026-02-30','2026-13-01','not-a-date','2026-1-1','0000-01-01']) assert.throws(()=>manualMembershipDates(start,now));
});
test('shared option contains real trainer IDs, has the tighter capacity, and becomes unavailable for missing or ambiguous staff', () => {
  const david={id:'david',name:'David Northrop',isPrimaryOwner:true,spotsRemaining:4},ashley={id:'ashley',name:'Ashley Northrop',spotsRemaining:2};
  const options=trainerOptions([david,ashley]);
  assert.equal(options.length,3); assert.equal(options[2].name,'David and Ashley'); assert.equal(options[2].spotsRemaining,2); assert.deepEqual(options[2].memberIds,['david','ashley']);
  assert.equal(trainerOptions([david]).at(-1).unavailable,true);
  assert.equal(sharedTrainerPair([david,ashley,{...ashley,id:'other'}]).length,0);
  assert.deepEqual(bookingTrainerIds({staffId:'david',coTrainerId:'ashley'}),['david','ashley']);
  assert.equal(selectedTrainerId({staffId:null,requestedStaffId:'david',requestedCoTrainerId:'ashley'}),SHARED_TRAINER_ID);
  assert.equal(selectedTrainerId({staffId:'david'}),'david');
});
