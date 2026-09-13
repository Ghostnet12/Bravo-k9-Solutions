import { z } from 'zod';
import { User } from './models.js';
import { isPrimaryOwner } from './auth.js';
import { SHARED_TRAINER_ID, sharedTrainerPair } from '../shared/trainer-selection.js';
export const trainerSelectionInput = z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal(SHARED_TRAINER_ID)]);
export async function resolveTrainerSelection(selection, session) {
  if (!selection) return { staffId: null, coTrainerId: null, ids: [] };
  trainerSelectionInput.parse(selection);
  let query = User.find({ ...(selection === SHARED_TRAINER_ID ? {} : { _id: selection }), role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } }).select('name');
  if (session) query = query.session(session);
  const people = (await query.lean()).map(person => ({ ...person, isPrimaryOwner: isPrimaryOwner(person) }));
  const chosen = selection === SHARED_TRAINER_ID ? sharedTrainerPair(people) : people;
  if (chosen.length !== (selection === SHARED_TRAINER_ID ? 2 : 1)) throw Object.assign(new Error(selection === SHARED_TRAINER_ID ? 'David and Ashley must both have active trainer profiles before choosing shared training.' : 'Choose an active trainer.'), { status: 400 });
  const ids = chosen.map(person => String(person._id));
  return { staffId: ids[0], coTrainerId: ids[1] || null, ids };
}
