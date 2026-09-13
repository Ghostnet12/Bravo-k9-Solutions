import { z } from 'zod';
import { User } from './models.js';
import { JOINT_TRAINER_ID, jointTrainerPair } from '../shared/trainers.js';
export const trainerSelectionInput = z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal(JOINT_TRAINER_ID)]);
const unavailable = message => Object.assign(new Error(message), { status: 409 });
export async function resolveTrainerIds(selection, session) {
  if (!selection || (Array.isArray(selection) && !selection.length)) return [];
  if (selection === JOINT_TRAINER_ID) {
    let query = User.find({ role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } }).select('name');
    if (session) query = query.session(session);
    const pair = jointTrainerPair(await query.lean());
    if (pair.length !== 2) throw unavailable('Both David and Ashley must have active, uniquely identifiable trainer profiles for this choice.');
    return pair.map(person => String(person._id));
  }
  const values = z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(2).parse(Array.isArray(selection) ? selection.map(String) : [String(selection)]);
  const ids = [...new Set(values.map(value => value.toLowerCase()))];
  for (const id of ids) {
    let query = User.exists({ _id: id, role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } });
    if (session && query.session) query = query.session(session);
    if (!await query) throw unavailable('Choose an active trainer.');
  }
  return ids;
}
