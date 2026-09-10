export const SERVICES = [
  { id: 'training', name: 'Professional training', cents: 20000, interval: 'month', includes: ['training'], description: 'Private, psychology-based training. We come to you.' },
  { id: 'online', name: 'Online training', cents: 5000, interval: 'month', includes: ['online'], description: 'Member lessons, captions, and written transcripts.' },
  { id: 'aggression', name: 'Aggressive-dog intake', cents: 40000, interval: 'once', includes: ['aggression'], description: 'Initial assessment with two trainers.' },
];
export function serviceSelection(ids) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('Choose at least one program without duplicates.');
  const items = ids.map(id => SERVICES.find(item => item.id === id));
  if (items.some(item => !item)) throw new Error('Unknown program.');
  if (items.some(item => item.bundle) && items.length > 1) throw new Error('Packages already include their services. Choose a package by itself.');
  if (ids.includes('training') && ids.includes('aggression')) throw new Error('Choose the aggressive-dog intake first; Bravo will confirm the ongoing training plan.');
  return items;
}
export function quote(ids, visits = []) {
  const items = serviceSelection(ids);
  const lines = items.map(item => ({ id: item.id, name: item.name, interval: item.interval, unitCents: item.cents, quantity: 1 }));
  const monthlyCents = lines.filter(l => l.interval === 'month').reduce((n, l) => n + l.unitCents * l.quantity, 0);
  const oneTimeCents = lines.filter(l => l.interval !== 'month').reduce((n, l) => n + l.unitCents * l.quantity, 0);
  return { lines, monthlyCents, oneTimeCents, dueNowCents: monthlyCents + oneTimeCents, currency: 'usd' };
}
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
