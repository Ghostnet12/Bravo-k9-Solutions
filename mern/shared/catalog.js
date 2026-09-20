export const SERVICES = [
  { id: 'training', name: 'Professional training', cents: 20000, interval: 'month', includes: ['training'], description: 'Private mobile training, Monday–Friday, one hour per day. Customize your schedule in your profile. $200/month for one dog; $100/month for each additional dog.' },
  { id: 'walking', name: 'Dog Walking', cents: 2500, interval: 'walk', durationMinutes: 30, includes: ['walking'], description: 'A focused 30-minute walk, priced per dog.' },
  { id: 'online', name: 'Online training', cents: 7500, bundleCents: 25000, interval: 'month', includes: ['online'], description: 'Member lessons, captions, and written transcripts.' },
  { id: 'aggression', name: 'Aggressive-dog intake', cents: 40000, interval: 'once', includes: ['aggression'], description: 'Initial assessment with two trainers.' },
];
export const TRAINING_ADDITIONAL_DOG_CENTS = 10000;
export const TRAINING_FOCUSES = [
  { id: 'basic-obedience', name: 'Basic obedience' },
  { id: 'advanced-obedience', name: 'Advanced obedience' },
  { id: 'puppy-foundations', name: 'Puppy foundations' },
  { id: 'behavior-modification', name: 'Behavior modification' },
  { id: 'job-specific', name: 'Job-specific working-dog training' },
  { id: 'service-dog', name: 'Service dog training' },
  { id: 'law-enforcement', name: 'Law-enforcement K9 training' },
  { id: 'search-and-rescue', name: 'Search-and-rescue training' },
  { id: 'executive-protection', name: 'Executive protection training' },
];
export const trainingFocusName = id => TRAINING_FOCUSES.find(focus => focus.id === id)?.name || 'Professional training';
// Retained only to label historical records. These programs are never exposed
// to new quotes, bookings, checkout, or owner service controls.
export const LEGACY_SERVICES = [
  { id: 'sitting', name: 'Retired dog-care service', cents: 2000, interval: 'day', includes: ['sitting'] },
  { id: 'complete', name: 'Retired training + care package', cents: 35000, interval: 'month', includes: ['training', 'sitting'], bundle: true },
  { id: 'all-access', name: 'Retired all-access package', cents: 40000, interval: 'month', includes: ['training', 'sitting', 'online'], bundle: true },
];
export const ALL_SERVICES = [...SERVICES, ...LEGACY_SERVICES];
export function serviceSelection(ids, catalog = SERVICES) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('Choose at least one program without duplicates.');
  const items = ids.map(id => catalog.find(item => item.id === id));
  if (items.some(item => !item)) throw new Error('Unknown program.');
  if (items.some(item => item.bundle) && items.length > 1) throw new Error('Packages already include their services. Choose a package by itself.');
  if (ids.includes('training') && ids.includes('aggression')) throw new Error('Choose the aggressive-dog intake first; Bravo will confirm the ongoing training plan.');
  return items;
}
export function quote(ids, visits = [], details = {}, catalog = SERVICES) {
  const items = serviceSelection(ids, catalog);
  const dogCount = Number.isInteger(details.dogCount) && details.dogCount >= 1 ? details.dogCount : 1;
  const walkingVisits = visits.filter(visit => visit.service === 'walking').length;
  const lines = items.flatMap(item => {
    const base = {
      id: item.id, name: item.id === 'online' && ids.includes('training') ? 'Lessons · training bundle rate' : item.name, interval: item.interval, unitCents: item.id === 'online' && ids.includes('training') ? Math.max(0, (item.bundleCents ?? 25000) - items.find(service => service.id === 'training').cents) : item.cents,
      quantity: item.interval === 'walk' ? walkingVisits * dogCount : 1,
      ...(['training', 'walking'].includes(item.id) ? { dogCount } : {}),
      ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}),
    };
    if (item.id !== 'training' || dogCount === 1) return [base];
    const additionalDogs = dogCount - 1;
    return [base, {
      id: 'training-additional-dogs',
      name: additionalDogs === 1 ? 'Additional training dog' : 'Additional training dogs',
      interval: 'month', unitCents: TRAINING_ADDITIONAL_DOG_CENTS, quantity: additionalDogs, dogCount,
    }];
  });
  const monthlyCents = lines.filter(l => l.interval === 'month').reduce((n, l) => n + l.unitCents * l.quantity, 0);
  const oneTimeCents = lines.filter(l => l.interval !== 'month').reduce((n, l) => n + l.unitCents * l.quantity, 0);
  return { lines, monthlyCents, oneTimeCents, dueNowCents: monthlyCents + oneTimeCents, currency: 'usd' };
}
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

// Rescheduling changes visit quantities, never the prices agreed when saved.
export function rescheduledQuote(booking, visits) {
  if (!booking.quote?.lines?.length) throw new Error('The saved price is unavailable. Contact Bravo before changing this request.');
  const lines = booking.quote.lines.map(line => ({ ...line, quantity: line.interval === 'walk' ? visits.filter(visit => visit.service === line.id).length * (booking.dogCount || 1) : line.quantity }));
  const monthlyCents = lines.filter(line => line.interval === 'month').reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
  const oneTimeCents = lines.filter(line => line.interval !== 'month').reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
  return { ...booking.quote, lines, monthlyCents, oneTimeCents, dueNowCents: monthlyCents + oneTimeCents };
}
