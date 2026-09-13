// A shared choice is not a fabricated user: persisted assignments contain real IDs.
export const SHARED_TRAINER_ID = 'david-and-ashley';
const idOf = person => String(person?.id || person?._id || '');
export function sharedTrainerPair(people = []) {
  const david = people.filter(person => person.isPrimaryOwner === true);
  const ashley = people.filter(person => /^Ashley (Northrop|Leverock)$/i.test(String(person.name || '').trim()));
  return david.length === 1 && ashley.length === 1 && idOf(david[0]) !== idOf(ashley[0]) ? [david[0], ashley[0]] : [];
}
export function trainerOptions(people = []) {
  if (people.some(person => idOf(person) === SHARED_TRAINER_ID)) return people;
  const pair = sharedTrainerPair(people);
  if (pair.length !== 2) return [...people, { id: SHARED_TRAINER_ID, _id: SHARED_TRAINER_ID, name: 'David and Ashley', unavailable: true, unavailableReason: 'Both David and Ashley need active Staff profiles.', spotsRemaining: 0, limit: 5, full: false }];
  return [...people, { id: SHARED_TRAINER_ID, _id: SHARED_TRAINER_ID, name: 'David and Ashley', title: 'Shared training team', memberIds: pair.map(idOf), activeDogs: Math.max(...pair.map(person => person.activeDogs || 0)), spotsRemaining: Math.min(...pair.map(person => person.spotsRemaining ?? 5)), full: pair.some(person => person.full), limit: 5 }];
}
export function bookingTrainerIds(booking) {
  const assigned = booking?.staffId ? [booking.staffId, booking.coTrainerId] : [booking?.requestedStaffId, booking?.requestedCoTrainerId];
  return [...new Set(assigned.filter(Boolean).map(value => String(value?._id || value)))];
}
export function selectedTrainerId(booking) {
  const ids = bookingTrainerIds(booking);
  return ids.length > 1 ? SHARED_TRAINER_ID : ids[0] || '';
}
