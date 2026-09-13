import { bookingTrainerIds, selectedTrainerId } from '../shared/trainer-selection.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { Booking, Settings, Slot, Subscription, User, Notification, DirectMessage, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { availability, dateTime, HOURS } from './scheduling.js';
import { checkTrainerVisits } from './trainer-schedules.js';
import { openWeekendDates } from './weekend-sessions.js';
import { trainerCapacity, TRAINER_DOG_LIMIT } from './bookings.js';
import { ALL_SERVICES } from '../shared/catalog.js';

const id=z.string().regex(/^[a-f\d]{24}$/i);
const visit=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.enum(HOURS)}).strict();
const input=z.object({bookingId:id,revision:z.string().datetime(),additions:z.array(visit).max(62),removals:z.array(visit).max(62),note:z.string().trim().min(1).max(1200),openWeekends:z.boolean().default(false),staffId:id.optional()}).strict();
const key=v=>`${v.date}|${v.time}`;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function when(v) { try{return dateTime(v.date,v.time)}catch{throw fail('Enter a valid date and time.')} }

export async function saveScheduleChanges(req,res) {
  const data=input.parse(req.body), isStaff=['staff','owner'].includes(req.user.role);
  if(!isStaff && (data.openWeekends || data.staffId)) throw fail('Only Bravo can open weekend hours or assign a trainer.',403);
  if(req.user.mutedUntil && req.user.mutedUntil>new Date()) throw fail('Messaging is temporarily paused for this account.',403);
  if(!data.additions.length && !data.removals.length) throw fail('Select a day or time to change.');
  const addKeys=new Set(data.additions.map(key)),removeKeys=new Set(data.removals.map(key));
  if(addKeys.size!==data.additions.length || removeKeys.size!==data.removals.length || [...addKeys].some(k=>removeKeys.has(k))) throw fail('Each visit can be changed only once.');
  await transaction(async session=>{
    // Serialize with reservations and changes to trainer working hours.
    const team=await Settings.findOneAndUpdate({_id:'schedule'},{$inc:{revision:1}},{returnDocument:'after',session});
    const booking=await Booking.findById(data.bookingId).session(session);
    if(!booking || (!isStaff && String(booking.userId)!==String(req.user._id))) throw fail('Schedule not found.',404);
    if(booking.updatedAt.toISOString()!==data.revision) throw fail('This schedule changed. Reload the saved calendar and try again. No changes were saved.',409);
    const trainingIds=ALL_SERVICES.filter(s=>s.includes.includes('training')).map(s=>s.id);
    if(!['paid','covered'].includes(booking.paymentStatus) || !['requested','confirmed'].includes(booking.status) || !booking.serviceIds.some(s=>trainingIds.includes(s))) throw fail('Choose a paid active training request.',409);
    for(const v of data.removals) {
      if(when(v)<=DateTime.now()) throw fail('Past visits cannot be changed.');
      if(!booking.visits.some(old=>old.service==='training' && key(old)===key(v))) throw fail('A selected visit changed. Reload your calendar.',409);
    }
    const remaining=booking.visits.filter(v=>v.service!=='training' || !removeKeys.has(key(v)));
    if(remaining.length+data.additions.length>62) throw fail('A request can contain up to 62 visits.');
    const trainer=booking.staffId || booking.requestedStaffId || data.staffId;
    const trainerIds=bookingTrainerIds(booking).length?bookingTrainerIds(booking):[data.staffId].filter(Boolean);
    if(data.staffId && trainer && String(trainer)!==data.staffId) throw fail('This request already has a trainer. Use its assigned trainer.',409);
    const terms=await Subscription.find({userId:booking.userId,serviceIds:{$in:trainingIds},status:{$in:['active','trialing','canceled']},dogCount:{$gte:booking.dogCount||1}}).session(session).lean();
    for(const v of data.additions) {
      const at=when(v);
      if(at<=DateTime.now() || at.diff(DateTime.now(),'days').days>92) throw fail('Choose a future session within 92 days.');
      if(!terms.some(t=>t.validFrom && at.toJSDate()>=t.validFrom && at.toJSDate()<t.validUntil)) throw fail('Every added session must be within the client’s paid training month.');
      if(remaining.some(old=>key(old)===key(v))) throw fail('This visit is already on the schedule.',409);
    }
    const weekends=data.additions.filter(v=>when(v).weekday>=6);
    if(data.openWeekends && weekends.length) {
      if(!trainer) throw fail('Choose a trainer to open weekend hours.');
      const days=[...new Set(weekends.map(v=>v.date))].map(date=>({date,hours:weekends.filter(v=>v.date===date).map(v=>v.time)}));
      for(const trainerId of trainerIds) await openWeekendDates({actor:req.user,staffId:trainerId,days,team,session});
    }
    if(data.additions.length && trainer) {
      if(!await User.exists({_id:trainer,role:{$in:['staff','owner']},blocked:{$ne:true}}).session(session)) throw fail('This trainer is unavailable. Contact Bravo.');
      if(!booking.staffId) {
        for(const trainerId of trainerIds) { const capacity=await trainerCapacity(trainerId,{session,excludeUserId:booking.userId});
        if(capacity.activeDogs+(booking.dogCount||1)>TRAINER_DOG_LIMIT) throw fail('That trainer is at the five-dog limit.',409); }
        await checkTrainerVisits(trainerIds,remaining,team.toObject(),session);
        booking.staffId=trainer; booking.coTrainerId=booking.requestedCoTrainerId || null; booking.requestedStaffId ||= trainer;
      }
    }
    for(const v of data.additions) if(!availability({from:v.date,to:v.date,settings:team.toObject()})[0].slots.includes(v.time)) throw fail(`${v.date} at ${v.time} is closed. No changes were saved.`,409);
    await checkTrainerVisits(trainerIds,data.additions,team.toObject(),session);
    for(const v of data.removals) await Slot.deleteOne({_id:key(v),bookingId:booking._id},{session});
    for(const v of data.additions) {
      if(await Slot.exists({_id:key(v)}).session(session)) throw fail(`${v.date} at ${v.time} was taken or blocked. No changes were saved.`,409);
      await Slot.create([{_id:key(v),date:v.date,time:v.time,bookingId:booking._id}],{session});
    }
    booking.cancelledVisits.push(...data.removals.map(v=>({...v,service:'training'})));
    booking.visits=[...remaining,...data.additions.map(v=>({...v,service:'training'}))].sort((a,b)=>key(a).localeCompare(key(b)));
    if(data.additions.length && !isStaff) booking.status='requested';
    await booking.save({session});
    const describe=values=>values.map(v=>`${v.date} at ${v.time}`).join(', ');
    const body=`${req.user.name}: ${data.additions.length?`Added ${describe(data.additions)}. `:''}${data.removals.length?`Cancelled ${describe(data.removals)}. `:''}${data.note}`;
    const event=randomUUID(),month=(data.additions[0]||data.removals[0]).date.slice(0,7);
    await Notification.create([{_id:`schedule:${event}:staff`,staff:true,body,href:`/schedule?client=${booking.userId}&month=${month}`},...(isStaff?[{_id:`schedule:${event}:client`,staff:false,userId:booking.userId,body,href:`/schedule?month=${month}`}]:[])],{session,ordered:true});
    await DirectMessage.create([{memberId:booking.userId,senderId:req.user._id,senderName:req.user.name,senderRole:req.user.role,body}],{session});
    await AuditEvent.create([{actorId:req.user._id,action:'schedule.changed',targetType:'booking',targetId:String(booking._id),details:{additions:data.additions,removals:data.removals}}],{session});
  });
  res.json({ok:true,message:isStaff?'Schedule saved. The client and Bravo team have been notified.':'Schedule saved. Your note was sent to all staff, administrators and owners.'});
}
