export const SERVICES = [
  { id: 'training', name: 'Professional training', cents: 20000, interval: 'month', includes: ['training'], description: 'Private, psychology-based training. We come to you.' },
  { id: 'walking', name: 'Dog Walking', cents: 2500, interval: 'walk', durationMinutes: 30, includes: ['walking'], description: 'A focused 30-minute walk, priced per dog.' },
  { id: 'online', name: 'Online training', cents: 5000, interval: 'month', includes: ['online'], description: 'Member lessons, captions, and written transcripts.' },
  { id: 'aggression', name: 'Aggressive-dog intake', cents: 40000, interval: 'once', includes: ['aggression'], description: 'Initial assessment with two trainers.' },
];
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
  const lines = items.map(item => ({
    id: item.id, name: item.name, interval: item.interval, unitCents: item.cents,
    quantity: item.interval === 'walk' ? walkingVisits * dogCount : 1,
    ...(item.durationMinutes ? { durationMinutes: item.durationMinutes, dogCount } : {}),
  }));
  const monthlyCents = lines.filter(l => l.interval === 'month').reduce((n, l) => n + l.unitCents * l.quantity, 0);
  const oneTimeCents = lines.filter(l => l.interval !== 'month').reduce((n, l) => n + l.unitCents * l.quantity, 0);
  return { lines, monthlyCents, oneTimeCents, dueNowCents: monthlyCents + oneTimeCents, currency: 'usd' };
}
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
