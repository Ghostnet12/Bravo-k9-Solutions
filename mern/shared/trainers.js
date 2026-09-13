// Booking choices are distinct from real staff identities. Never create a fake user.
export const JOINT_TRAINER_ID = 'david-and-ashley';
export const JOINT_TRAINER_LABEL = 'David and Ashley';
const identity = value => String(value?._id || value?.id || value || '');
const unique = values => [...new Set(values.filter(Boolean).map(identity).filter(Boolean))];
export const assignedTrainerIds = booking => unique([...(booking?.staffIds || []), booking?.staffId]);
export const requestedTrainerIds = booking => unique([...(booking?.requestedStaffIds || []), booking?.requestedStaffId]);
export const bookingTrainerIds = booking => {
  const assigned = assignedTrainerIds(booking);
  return assigned.length ? assigned : requestedTrainerIds(booking);
};
export const trainerChoice = booking => {
  const ids = bookingTrainerIds(booking);
  return ids.length > 1 ? JOINT_TRAINER_ID : ids[0] || '';
};
export const acceptedTrainerIds = booking => unique(booking?.trainerAcceptedIds?.length ? booking.trainerAcceptedIds : booking?.trainerAcceptedAt && !booking?.trainerAcceptanceRequired ? assignedTrainerIds(booking) : []);
export function jointTrainerPair(people = []) {
  const real = people.filter(person => identity(person) !== JOINT_TRAINER_ID && !person.blocked);
  const normalized = person => String(person.name || '').trim().replace(/\s+/g, ' ');
  const david = real.filter(person => /^(?:david|dave)(?: northrop)?$/i.test(normalized(person)));
  const ashley = real.filter(person => /^ashley(?: northrop| leverock)?$/i.test(normalized(person)));
  // Fail closed when profiles are missing or names are ambiguous.
  return david.length === 1 && ashley.length === 1 && identity(david[0]) !== identity(ashley[0]) ? [david[0], ashley[0]] : [];
}
export function trainerOptions(people = []) {
  const real = people.filter(person => identity(person) !== JOINT_TRAINER_ID);
  const pair = jointTrainerPair(real), ids = pair.map(identity);
  const capacityKnown = pair.length === 2 && pair.every(person => Number.isFinite(person.spotsRemaining));
  const group = { id: JOINT_TRAINER_ID, _id: JOINT_TRAINER_ID, name: JOINT_TRAINER_LABEL, staffIds: ids, disabled: pair.length !== 2, joint: true,
    ...(capacityKnown ? { spotsRemaining: Math.min(...pair.map(person => person.spotsRemaining)), activeDogs: Math.max(...pair.map(person => person.activeDogs || 0)), limit: Math.min(...pair.map(person => person.limit || 5)), full: pair.some(person => person.full || person.spotsRemaining === 0) } : {}) };
  return pair.length ? [...pair, group, ...real.filter(person => !ids.includes(identity(person)))] : [...real, group];
}
export function scheduledTrainerLabel(booking) {
  const people = booking?.staffIds?.filter(person => person?.name) || [];
  const assigned = people.length ? people : booking?.staffId?.name ? [booking.staffId] : [];
  if (!assigned.length) return 'Awaiting assignment';
  if (booking.trainerAcceptanceRequired) {
    const accepted = acceptedTrainerIds(booking);
    const pending = assigned.filter(person => !accepted.includes(identity(person)));
    return `Awaiting acceptance from ${(pending.length ? pending : assigned).map(person => person.name).join(' and ')}`;
  }
  return assigned.length > 1 ? JOINT_TRAINER_LABEL : assigned[0].name;
}
