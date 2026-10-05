import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkshop, saturdayDate, validWorkshopDate } from '../shared/workshop-schedule.js';
import { workshopMarkup, DEFAULT_WORKSHOP } from '../shared/workshops.js';
const weekly = { ...DEFAULT_WORKSHOP, scheduleMode: 'weekly', date: null, startTime: '12:00', endTime: '14:00' };
test('Central Saturday recurrence keeps Saturday until local Sunday, including boundaries and DST', () => {
  for (const [instant,expected] of [
    ['2026-10-09T18:00:00Z','2026-10-10'],['2026-10-10T05:00:00Z','2026-10-10'],['2026-10-11T04:59:59Z','2026-10-10'],['2026-10-11T05:00:00Z','2026-10-17'],
    ['2026-11-01T05:00:00Z','2026-11-07'],['2026-11-01T08:00:00Z','2026-11-07'],['2026-03-08T08:00:00Z','2026-03-14'],
    ['2026-12-27T06:00:00Z','2027-01-02'],['2027-01-01T18:00:00Z','2027-01-02'],['2026-02-01T06:00:00Z','2026-02-07'],
  ]) {
    const event = resolveWorkshop(weekly,new Date(instant));assert.equal(event.date,expected);assert.equal(saturdayDate(new Date(instant)),expected);assert.equal(event.time,'12:00 PM–2:00 PM');assert.equal(event.occurrenceId,`featured:${expected}`);
  }
});
test('specific and no-date modes stay separate from recurrence and publication', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  assert.equal(resolveWorkshop({...weekly,scheduleMode:'specific',date:'2026-10-10'},now).date,'2026-10-10');
  const none = resolveWorkshop({...weekly,scheduleMode:'none',published:false},now);
  assert.equal(none.date,null);assert.equal(none.nextDate,null);assert.equal(none.occurrenceId,null);assert.equal(none.time,'');assert.equal(none.startTime,'12:00');assert.equal(none.published,false);
  assert.doesNotMatch(workshopMarkup(none),/Invalid Date|<dt>Date|<dt>Time/);
  assert.equal(resolveWorkshop({...none,scheduleMode:'weekly'},now).date,'2026-10-17');
  assert.equal(resolveWorkshop({...weekly,published:false},now).published,false);
  assert.equal(validWorkshopDate('2026-02-31'),false);assert.equal(validWorkshopDate('2028-02-29'),true);
});
test('occurrence identities stay independent across weeks and are not configuration revisions', () => {
  const first=resolveWorkshop(weekly,new Date('2026-10-10T18:00:00Z')),next=resolveWorkshop(weekly,new Date('2026-10-11T18:00:00Z'));
  assert.notEqual(first.occurrenceId,next.occurrenceId);
  assert.equal(resolveWorkshop({...weekly,revision:22},new Date('2026-10-10T18:00:00Z')).occurrenceId,first.occurrenceId);
});
