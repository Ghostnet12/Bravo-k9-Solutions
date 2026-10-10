import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { nextRequestedVisit, currentTrainingTerm } from '../shared/customer-journey.js';
import { livePlayerStatus } from '../shared/live-presentation.js';
import { workshopRegistrationLabel, workshopMarkup } from '../shared/workshops.js';
import { resolveWorkshop } from '../shared/workshop-schedule.js';
const now = DateTime.fromISO('2026-10-10T12:00:00', {zone:'America/Chicago'});
test('next visit excludes cancelled and waitlisted records, keeps requests distinct', () => {
 const bookings = [
  {_id:'old',status:'cancelled',visits:[{date:'2026-10-11',time:'09:00'}]},
  {_id:'wait',status:'waitlisted',visits:[{date:'2026-10-11',time:'10:00'}]},
  {_id:'new',dogName:'Test Dog',status:'requested',paymentStatus:'unpaid',visits:[{date:'2026-10-11',time:'11:00',cancelled:true},{date:'2026-10-12',time:'09:00'}]},
 ];
 assert.equal(nextRequestedVisit(bookings,now).date,'2026-10-12');
 assert.equal(nextRequestedVisit(bookings,now).status,'requested');
 assert.equal(nextRequestedVisit([],now),null);
});
test('coverage only shows active dated training terms, including paid canceled renewal', () => {
 const active={serviceIds:['training'],status:'canceled',validFrom:'2026-10-01T00:00:00Z',validUntil:'2026-11-01T00:00:00Z'};
 assert.equal(currentTrainingTerm([active],now.toMillis()),active);
 assert.equal(currentTrainingTerm([{...active,validFrom:'2026-11-01T00:00:00Z'}],now.toMillis()),null);
 assert.equal(currentTrainingTerm([{...active,serviceIds:['online']}],now.toMillis()),null);
});
test('live display never calls unavailable or reconnecting playback connected', () => {
 assert.equal(livePlayerStatus('unavailable','watching'),'Status unavailable');
 assert.equal(livePlayerStatus('reconnecting','watching'),'Reconnecting');
 assert.equal(livePlayerStatus('live','ended'),'Connection interrupted');
 assert.equal(livePlayerStatus('ended','watching'),'Session ended');
 assert.equal(livePlayerStatus('live','blocked'),'Tap to play');
 assert.equal(livePlayerStatus('live','watching'),'Connected');
});
test('workshop status distinguishes no date, passed date, ended today and inquiry', () => {
 const e={published:true,date:'2026-10-10',endTime:'14:00'};
 assert.match(workshopRegistrationLabel(e,now.toJSDate()),/request a seat/);
 assert.match(workshopRegistrationLabel(e,now.plus({hours:3}).toJSDate()),/has ended/);
 assert.match(workshopRegistrationLabel({...e,date:null},now.toJSDate()),/Date to be announced/);
 assert.match(workshopRegistrationLabel({...e,date:'2026-10-03'},now.toJSDate()),/Closed/);
 assert.match(workshopRegistrationLabel({...e,published:false},now.toJSDate()),/Not open/);
});
test('Saturday recurrence remains Saturday all day and advances Sunday', () => {
 const e={scheduleMode:'weekly',startTime:'12:00',endTime:'14:00'};
 assert.equal(resolveWorkshop(e,new Date('2026-10-11T04:59:00Z')).date,'2026-10-10');
 assert.equal(resolveWorkshop(e,new Date('2026-10-11T05:01:00Z')).date,'2026-10-17');
});
test('workshop markup keeps stored copy escaped and real undated mode', () => {
 const html=workshopMarkup({published:true,scheduleMode:'none',date:null,time:'12 PM',title:'<script>',description:'<img onerror=x>',duration:'2 hours',cents:10000,location:''});
 assert.ok(!html.includes('<dt>Date</dt>'));
 assert.ok(!html.includes('<dt>Time</dt>'));
 assert.ok(html.includes('<dt>Registration</dt>'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('confirm meeting instructions'));
});
