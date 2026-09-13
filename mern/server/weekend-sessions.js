import { randomUUID } from 'node:crypto';
import { bookingTrainerIds } from '../shared/trainers.js';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { Booking, User, Settings, TrainerSchedule, Slot, Subscription, Notification, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { dateTime, HOURS, availability } from './scheduling.js';
import { personalHours } from '../shared/trainer-schedule.js';
import { checkTrainerVisits } from './trainer-schedules.js';
import { ALL_SERVICES } from '../shared/catalog.js';
const id=z.string().regex(/^[a-f\d]{24}$/i);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function future(date,time='21:00') { const d=dateTime(date,time); if(d<=DateTime.now() || d.diff(DateTime.now(),'days').days>92) throw fail('Choose a future date within 92 days.');return d; }
export async function openWeekendDates({actor,staffId,days,team,session}) {
  if(actor.role!=='owner' && (actor.role!=='staff' || String(actor._id)!==staffId)) throw fail('Staff can open their own weekend hours. Administrators and owners can choose any trainer.',403);
  if(!await User.exists({_id:staffId,role:{$in:['staff','owner']},blocked:{$ne:true}}).session(session)) throw fail('Choose an active trainer.');
  if(!team?.enabled) throw fail('Enable online booking before opening weekend sessions.');
  if(new Set(days.map(d=>d.date)).size!==days.length) throw fail('Use one set of hours per date.');
  for(const day of days) { if(future(day.date).weekday<6) throw fail('Choose Saturdays and Sundays.'); for(const time of day.hours) future(day.date,time); }
  const own=await TrainerSchedule.findById(staffId).session(session);
  if(own && !own.enabled) throw fail('Enable this trainer’s working schedule first.');
  const today=DateTime.now().setZone('America/Chicago').toISODate();
  const personal=own?.toObject()||{enabled:true,weekdays:[...team.weekdays],hours:[...team.hours],overrides:[]};
  for(const {date,hours} of days) {
    const teamHours=[...new Set([...personalHours(date,team.toObject()),...hours])].sort();
    team.overrides=[...(team.overrides||[]).filter(d=>d.date!==date && d.date>=today),{date,hours:teamHours}];
    const ownHours=[...new Set([...personalHours(date,personal),...hours])].sort();
    personal.overrides=[...(personal.overrides||[]).filter(d=>d.date!==date && d.date>=today),{date,hours:ownHours}];
  }
  await team.save({session});
  await TrainerSchedule.findOneAndUpdate({_id:staffId},{$set:{enabled:true,weekdays:personal.weekdays,hours:personal.hours,overrides:personal.overrides},$inc:{revision:1}},{upsert:true,session});
  await AuditEvent.create([{actorId:actor._id,action:'weekend.opened',targetType:'trainer',targetId:staffId,details:{days}}],{session});
}
export async function openWeekend(req,res) {
  const day=z.object({date:z.string(),hours:z.array(z.enum(HOURS)).min(1).max(13)}).strict();
  const input=z.union([z.object({staffId:id,days:z.array(day).min(1).max(62)}).strict(),z.object({staffId:id,date:z.string(),hours:z.array(z.enum(HOURS)).min(1).max(13)}).strict()]).parse(req.body);
  const days=input.days||[{date:input.date,hours:input.hours}];
  await transaction(async session=>{
    const team=await Settings.findOneAndUpdate({_id:'schedule'},{$inc:{revision:1}},{returnDocument:'after',session});
    await openWeekendDates({actor:req.user,staffId:input.staffId,days,team,session});
  });
  res.json({ok:true,message:`${days.length} weekend date(s) opened for this trainer. Add visits from the client’s schedule.`});
}
export async function addTrainingVisit(req,res) {
  const {bookingId,date,time}=z.object({bookingId:id,date:z.string(),time:z.enum(HOURS)}).strict().parse(req.body);
  const when=future(date,time);
  await transaction(async session=>{
    const team=await Settings.findOneAndUpdate({_id:'schedule'},{$inc:{revision:1}},{returnDocument:'after',session}).lean();
    const b=await Booking.findById(bookingId).session(session);
    const trainingIds=ALL_SERVICES.filter(s=>s.includes.includes('training')).map(s=>s.id);
    if(!b || !['paid','covered'].includes(b.paymentStatus) || !['requested','confirmed'].includes(b.status) || !b.serviceIds.some(s=>trainingIds.includes(s))) throw fail('Choose a paid active training request.',409);
    if(b.visits.length>=62) throw fail('This request already has 62 visits.');
    if((b.termStartsAt && when.toJSDate()<b.termStartsAt) || (b.termEndsAt && when.toJSDate()>=b.termEndsAt)) throw fail('This session must fall within this request’s training membership period.');
    if(!await Subscription.exists({userId:b.userId,serviceIds:{$in:trainingIds},status:{$in:['active','trialing','canceled']},validFrom:{$lte:when.toJSDate()},validUntil:{$gt:when.toJSDate()},dogCount:{$gte:b.dogCount||1}}).session(session)) throw fail('This session must fall within the client’s paid training month.');
    if(!availability({from:date,to:date,settings:team})[0].slots.includes(time)) throw fail('Open these days and times before adding a visit.');
    await checkTrainerVisits(bookingTrainerIds(b),[{date,time,service:'training'}],team,session);
    const key=`${date}|${time}`;
    if(await Slot.exists({_id:key}).session(session)) throw fail('This time is already reserved or blocked.',409);
    await Slot.create([{_id:key,date,time,bookingId:b._id}],{session});
    b.visits.push({date,time,service:'training'});b.visits.sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));await b.save({session});
    const body=`Bravo added a training visit on ${date} at ${time} for ${b.dogName}.`;
    const eventId=randomUUID();
    await Notification.create([{_id:`added:${eventId}:staff`,staff:true,body,href:`/schedule?client=${b.userId}&month=${date.slice(0,7)}`},{_id:`added:${eventId}:client`,userId:b.userId,staff:false,body,href:`/schedule?month=${date.slice(0,7)}`}],{session,ordered:true});
    await AuditEvent.create([{actorId:req.user._id,action:'visit.added',targetType:'booking',targetId:String(b._id),details:{date,time}}],{session});
  });res.json({ok:true,message:'Training visit added. The client and whole team have been notified.'});
}
