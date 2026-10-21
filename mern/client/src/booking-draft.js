import { JOINT_TRAINER_ID } from '../../shared/trainers.js';
import { SERVICES, TRAINING_FOCUSES } from '../../shared/catalog.js';

export const BOOKING_DRAFT_KEY = 'bravo-booking-draft-v1';
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;
const ids = new Set(SERVICES.map(service => service.id));
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`));
const time = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const integer = (value, min, max, fallback) => Number.isInteger(value) && value >= min && value <= max ? value : fallback;
export function bookingEntry(params) {
  const selected = {};
  for (const key of ['program', 'focus', 'trainer', 'lessons']) {
    const value = params.get(key);
    if (value && value.length <= 80) selected[key] = value;
  }
  if (!ids.has(selected.program)) selected.program = 'training';
  return new URLSearchParams(Object.entries(selected).sort(([a],[b]) => a.localeCompare(b))).toString();
}

// Persist only bounded booking inputs, never server records, prices or credentials.
export function cleanBookingDraft(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.ids) || !value.ids.length || value.ids.length > ids.size || value.ids.some(id => !ids.has(id))) return null;
  if (!value.form || typeof value.form !== 'object' || !Array.isArray(value.visits) || value.visits.length > 366) return null;
  if (typeof value.entry !== 'string' || value.entry.length > 400 || bookingEntry(new URLSearchParams(value.entry)) !== value.entry) return null;
  if (value.visits.some(visit => !visit || !date(visit.date) || !time(visit.time) || !ids.has(visit.service))) return null;
  const form = Object.fromEntries(Object.entries({dogName:80,phone:30,address:300,notes:1500}).map(([field,max]) => [field,text(value.form[field],max)]));
  if (!form.dogName.trim() && !form.notes.trim() && !value.trainerId && !value.visits.length && !(value.dogCount > 1) && !(value.trainingFocus && value.trainingFocus !== 'basic-obedience')) return null;
  return {
    entry: value.entry, ids: [...new Set(value.ids)], form,
    visits: value.visits.map(({date,time,service}) => ({date,time,service})),
    trainerId: typeof value.trainerId === 'string' && (value.trainerId === JOINT_TRAINER_ID || /^[a-f\d]{24}$/.test(value.trainerId)) ? value.trainerId : '',
    trainerName: text(value.trainerName,80),
    kind: ids.has(value.kind) ? value.kind : value.ids[0],
    trainingFocus: TRAINING_FOCUSES.some(focus => focus.id === value.trainingFocus) ? value.trainingFocus : 'basic-obedience',
    dogCount: integer(value.dogCount,1,10,1), count: integer(value.count,1,31,4),
    from: date(value.from) ? value.from : undefined, to: date(value.to) ? value.to : undefined,
    startTime: time(value.startTime) ? value.startTime : '09:00', endTime: time(value.endTime) ? value.endTime : '21:00',
    preference: ['any','morning','afternoon','evening'].includes(value.preference) ? value.preference : 'any',
    introDone: value.introDone === true, firstVisit: value.firstVisit !== false,
    bookingStep: ['trainer','visit','review'].includes(value.bookingStep) ? value.bookingStep : 'trainer',
    timeConfirmed: value.timeConfirmed === true,
    requestKey: typeof value.requestKey === 'string' && /^[0-9a-f-]{36}$/i.test(value.requestKey) ? value.requestKey : undefined,
  };
}
function storage() { try { return globalThis.sessionStorage; } catch { return null; } }
export function readBookingDraft(owner, { claimGuest = false, now = Date.now(), store = storage() } = {}) {
  try {
    const raw = store?.getItem(BOOKING_DRAFT_KEY);
    if (!raw) return null;
    if (raw.length > 60000) throw new Error('Draft too large');
    const envelope = JSON.parse(raw);
    if (envelope.version !== 1 || !Number.isFinite(envelope.updatedAt) || envelope.updatedAt > now || now - envelope.updatedAt > DRAFT_TTL_MS || !(envelope.owner === owner || (claimGuest && envelope.owner === 'guest'))) throw new Error('Draft expired or belongs to another account');
    const draft = cleanBookingDraft(envelope.draft);
    if (!draft) throw new Error('Invalid draft');
    return draft;
  } catch { try { store?.removeItem(BOOKING_DRAFT_KEY); } catch { /* Optional storage. */ } return null; }
}
export function writeBookingDraft(owner, value, { now = Date.now(), store = storage() } = {}) {
  const draft = cleanBookingDraft(value);
  try {
    if (draft && owner) store?.setItem(BOOKING_DRAFT_KEY, JSON.stringify({ version:1, owner, updatedAt:now, draft }));
    else store?.removeItem(BOOKING_DRAFT_KEY);
  } catch { /* In-memory drafts still work when storage is unavailable. */ }
  return draft;
}
