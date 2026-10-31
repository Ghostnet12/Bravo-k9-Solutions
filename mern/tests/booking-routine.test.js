import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRoutine, routineDates, usualRoutine } from '../shared/booking-routine.js';

test('a weekly routine survives the daylight-saving change and reports exact-time conflicts', () => {
  const result = previewRoutine({ from: '2026-10-26', to: '2026-11-06', pattern: { 1: '17:00', 3: '17:00', 5: '17:00' },
    canUse: date => date === '2026-11-04' ? 'Trainer unavailable' : true });
  assert.deepEqual(result.visits.map(visit => visit.date), ['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-06']);
  assert.ok(result.visits.every(visit => visit.time === '17:00'));
  assert.deepEqual(result.conflicts, [{ date: '2026-11-04', time: '17:00', reason: 'Trainer unavailable' }]);
});
test('a routine keeps existing visits at different times and never substitutes for a conflict', () => {
  const existing = [{ date: '2026-11-02', time: '10:00', service: 'training' }];
  const result = previewRoutine({ from: '2026-11-02', to: '2026-11-06', pattern: { 1: '17:00', 3: '17:00', 5: '17:00' }, existing,
    canUse: date => date === '2026-11-06' ? 'Outside paid membership' : false });
  assert.deepEqual(result.visits, []); assert.deepEqual(result.kept, existing);
  assert.equal(result.conflicts.length, 2); assert.equal(result.conflicts[1].reason, 'Outside paid membership');
  assert.equal(existing[0].time, '10:00');
});
test('the usual routine uses recent, most frequent weekday times without enabling weekends', () => {
  const visits = [
    ['2026-09-07','09:00'], ['2026-10-05','17:00'], ['2026-10-12','17:00'], ['2026-10-19','10:00'],
    ['2026-10-07','14:00'], ['2026-10-14','15:00'], ['2026-10-24','11:00'],
  ].map(([date,time]) => ({ date,time,service:'training' }));
  visits.push({ date:'2026-10-26',time:'09:00',service:'training',cancelled:true });
  visits.push({ date:'2026-10-26',time:'09:00',service:'aggression' });
  assert.deepEqual(usualRoutine(visits), { 1:'17:00',3:'15:00' });
  assert.deepEqual(usualRoutine([]), {});
});
test('date previews are bounded and reject reversed or invalid dates', () => {
  for (const [from,to] of [['2026-02-30','2026-03-02'],['2026-11-02','2026-11-01'],['2026-01-01','2026-12-31'],['','2026-11-01']]) assert.deepEqual(routineDates(from,to),[]);
  assert.deepEqual(routineDates('2028-02-28','2028-03-01'), ['2028-02-28','2028-02-29','2028-03-01']);
});
