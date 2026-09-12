import test from 'node:test';
import assert from 'node:assert/strict';
import { personalHours, workingHours, restrictTrainerDays, startTimeRanges } from '../shared/trainer-schedule.js';
const team = { enabled: true, weekdays: [1,2,3,4,5], hours: ['09:00','10:00','11:00','15:00'] };
const person = { enabled: true, weekdays: [1,3], hours: ['09:00','10:00'], overrides: [] };
test('individual schedule inherits team hours only until personalized', () => {
  assert.deepEqual(workingHours('2026-09-14', null, team), team.hours);
  assert.deepEqual(workingHours('2026-09-15', person, team), []);
  assert.deepEqual(workingHours('2026-09-14', person, team), ['09:00','10:00']);
});
test('specific day off and added day are reversible without affecting another trainer', () => {
  const custom = { ...person, overrides: [{date:'2026-09-14',hours:[]},{date:'2026-09-15',hours:['15:00']}] };
  assert.deepEqual(workingHours('2026-09-14', custom, team), []);
  assert.deepEqual(workingHours('2026-09-14', person, team), ['09:00','10:00']);
  assert.deepEqual(workingHours('2026-09-15', custom, team), ['15:00']);
  assert.deepEqual(workingHours('2026-09-14', {...custom,overrides:[]}, team), ['09:00','10:00']);
});
test('global closures, weekends, and supported hours cannot be overridden', () => {
  assert.deepEqual(workingHours('2026-09-14', person, {...team,enabled:false}), []);
  assert.deepEqual(workingHours('2026-09-19', {...person,overrides:[{date:'2026-09-19',hours:['09:00']}]}, team), []);
  assert.deepEqual(personalHours('2026-09-14', {...person,hours:['08:00','09:00','22:00']}), ['09:00']);
});
test('trainer filtering never reopens occupied times or mutates availability', () => {
  const days = [{date:'2026-09-14',slots:['10:00','15:00']},{date:'2026-09-15',slots:['09:00']}];
  assert.deepEqual(restrictTrainerDays(days,person,team),[{date:'2026-09-14',slots:['10:00']},{date:'2026-09-15',slots:[]}]);
  assert.deepEqual(days[0].slots,['10:00','15:00']);
});
test('hour labels preserve gaps and show session starts rather than invented ranges', () => {
  assert.equal(startTimeRanges(['09:00','10:00','15:00','17:00','18:00']), '9 AM–10 AM · 3 PM · 5 PM–6 PM');
  assert.equal(startTimeRanges([]),'Off'); assert.equal(startTimeRanges(['12:00','13:00']),'12 PM–1 PM');
});

test('weekends open only inside team and personal working hours, including Sunday', () => {
  const open = {...team, weekdays:[1,2,3,4,5,6,7]};
  assert.deepEqual(workingHours('2026-09-19', null, open), team.hours);
  assert.deepEqual(workingHours('2026-09-20', {...person, weekdays:[7]}, open), person.hours);
  assert.deepEqual(workingHours('2026-09-20', {...person, weekdays:[7]}, team), []);
});
