import { z } from 'zod';
import { DateTime } from 'luxon';
import { User, Settings, Slot, Booking, TrainerSchedule, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { dateTime, dateRange, HOURS, ZONE, DEFAULT_SCHEDULE } from './scheduling.js';
import { workingHours, restrictTrainerDays } from '../shared/trainer-schedule.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const input = z.object({
  revision: z.number().int().min(0), enabled: z.boolean(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  hours: z.array(z.enum(HOURS)).max(13),
  overrides: z.array(z.object({ date: z.string(), hours: z.array(z.enum(HOURS)).max(13) }).strict()).max(93),
}).strict();
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
function editable(stored, team) {
  return { revision: stored?.revision || 0, enabled: stored ? stored.enabled : true, weekdays: stored?.weekdays || team.weekdays, hours: stored?.hours || team.hours, overrides: stored?.overrides || [] };
}
async function target(req) {
  const id = objectId.parse(req.params.id).toLowerCase();
  if (String(req.user._id) !== id && req.user.role !== 'owner') throw fail('You can only edit your own working schedule.', 403);
  if (!await User.exists({ _id: id, role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } })) throw fail('Active trainer not found.', 404);
  return id;
}
export async function readTrainerSchedule(req, res) {
  const id = await target(req);
  const [stored, team] = await Promise.all([TrainerSchedule.findById(id).lean(), Settings.findById('schedule').lean()]);
  const today = DateTime.now().setZone(ZONE).toISODate();
  res.json({ staffId: id, inherited: !stored, schedule: { ...editable(stored, team), overrides: (stored?.overrides || []).filter(day => day.date >= today).map(day => ({ date: day.date, hours: day.hours })) }, team: { enabled: team.enabled, weekdays: team.weekdays, hours: team.hours }, today, maxDate: dateTime(today).plus({ days: 92 }).toISODate() });
}
export async function saveTrainerSchedule(req, res) {
  const id = await target(req), data = input.parse(req.body);
  const today = DateTime.now().setZone(ZONE).toISODate(), last = dateTime(today).plus({ days: 92 }).toISODate();
  if (new Set(data.overrides.map(day => day.date)).size !== data.overrides.length) throw fail('Use one exception per date.', 400);
  for (const day of data.overrides) {
    const parsed = dateTime(day.date);
    if (day.date < today || day.date > last) throw fail('Choose dates within the next 92 days.', 400);
  }
  data.weekdays = [...new Set(data.weekdays)].sort(); data.hours = [...new Set(data.hours)].sort();
  data.overrides = data.overrides.map(day => ({ date: day.date, hours: [...new Set(day.hours)].sort() })).sort((a, b) => a.date.localeCompare(b.date));
  let saved;
  await transaction(async session => {
    // Same lock used by reservations: a saved day off cannot race a new booking.
    const team = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { returnDocument: 'after', session }).lean();
    const previous = await TrainerSchedule.findById(id).session(session).lean();
    if ((previous?.revision || 0) !== data.revision) throw fail('This schedule changed in another window. Reset to the saved schedule before editing again.');
    const bookings = await Booking.find({ $or: [{ staffId: id }, { coTrainerId: id }], status: { $in: ['requested', 'confirmed'] }, 'visits.date': { $gte: today } }).select('visits').session(session).lean();
    const conflicts = bookings.flatMap(booking => booking.visits).filter(visit => visit.date >= today && workingHours(visit.date, previous, team).includes(visit.time) && !workingHours(visit.date, data, team).includes(visit.time));
    if (conflicts.length) throw fail(`This change overlaps ${conflicts.length} saved visit(s). Reschedule or reassign those visits first; nothing was cancelled.`);
    saved = await TrainerSchedule.findOneAndUpdate({ _id: id }, { $set: { ...data, revision: data.revision + 1 } }, { upsert: true, returnDocument: 'after', runValidators: true, session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'trainer.schedule.published', targetType: 'trainer', targetId: id, details: { revision: saved.revision } }], { session });
  });
  res.json({ ok: true, staffId: id, schedule: { ...data, revision: saved.revision }, publishedAt: saved.updatedAt });
}
export async function publicTrainerSchedules(_req, res) {
  const now = DateTime.now().setZone(ZONE), from = now.toISODate(), to = now.plus({ days: 13 }).toISODate();
  // Only active public team identities, working hours and shared closures are read.
  // Never read customer bookings, private notes, time-off reasons or contact details.
  const people = await User.find({ role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } }).select('_id').lean();
  const ids = people.map(person => String(person._id));
  const [team, schedules, blocks] = await Promise.all([
    Settings.findById('schedule').lean(), TrainerSchedule.find({ _id: { $in: ids } }).lean(),
    Slot.find({ bookingId: { $exists: false }, date: { $gte: from, $lte: to } }).select('date time -_id').lean(),
  ]);
  const limit = team || DEFAULT_SCHEDULE, blocked = new Set(blocks.map(slot => `${slot.date}|${slot.time}`));
  const records = new Map(schedules.map(schedule => [String(schedule._id), schedule]));
  const days = dateRange(from, to);
  res.set('Cache-Control', 'private, no-store');
  res.json({ timezone: ZONE, checkedAt: now.toISO(), schedules: ids.map(staffId => {
    const personal = records.get(staffId);
    return { staffId, source: personal ? 'personal' : 'team', updatedAt: personal?.updatedAt || null,
      days: days.map(date => { const hours = workingHours(date, personal, limit).filter(time => !blocked.has(`${date}|${time}`)); return { date, hours, status: hours.length ? 'working' : 'off' }; }) };
  }) });
}
export async function filterTrainerAvailability(days, staffId, team, session) {
  const ids = (Array.isArray(staffId) ? staffId : [staffId]).filter(Boolean);
  let filtered = days;
  for (const id of ids) {
    let query = TrainerSchedule.findById(String(id));
    if (session) query = query.session(session);
    filtered = restrictTrainerDays(filtered, await query.lean(), team);
  }
  return filtered;
}
export async function checkTrainerVisits(staffId, visits, team, session) {
  if (!visits.length) return;
  const ids = (Array.isArray(staffId) ? staffId : [staffId]).filter(Boolean);
  const today = DateTime.now().setZone(ZONE).toISODate();
  for (const id of ids) {
    let query = TrainerSchedule.findById(String(id));
    if (session) query = query.session(session);
    const personal = await query.lean();
    if (visits.some(visit => visit.date >= today && !workingHours(visit.date, personal, team).includes(visit.time))) throw fail('The selected trainer is not working at one or more chosen times. Shared training requires both trainers to be available. Refresh availability and choose another time or trainer.');
  }
}
