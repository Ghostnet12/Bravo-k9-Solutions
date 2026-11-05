export const SITE_ORIGIN = 'https://bravounleashed.com';
export const PHONE = 'tel:+16058242767';

export type PortalTarget = { title: string; path: string };
export const destinations = {
  booking: { title: 'Book training', path: '/portal?program=training' },
  schedule: { title: 'My schedule', path: '/schedule' },
  account: { title: 'My Bravo', path: '/account' },
  messages: { title: 'Bravo Room', path: '/community' },
  live: { title: 'Live training', path: '/live' },
  workshops: { title: 'Workshops', path: '/workshops' },
} satisfies Record<string, PortalTarget>;

// Never pass credentials to another origin or silently launch arbitrary URI schemes.
export function navigationPolicy(value: string): 'internal' | 'external' | 'contact' | 'blocked' {
  try {
    const url = new URL(value);
    if (url.username || url.password) return 'blocked';
    if (url.protocol === 'https:') return url.origin === SITE_ORIGIN ? 'internal' : 'external';
    if (value === PHONE) return 'contact';
    return 'blocked';
  } catch { return 'blocked'; }
}

export function portalUrl(path: string): string {
  const url = new URL(path, SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN || url.username || url.password) throw new Error('Invalid Bravo destination.');
  return url.href;
}

export type Service = { id: string; name: string; description: string; cents: number; interval: string; enabled: boolean; additionalDogCents?: number };
export function parseServices(data: unknown): Service[] {
  const config = data as { connected?: boolean; services?: unknown[] };
  if (!config || config.connected !== true || !Array.isArray(config.services)) throw new Error('Current prices are unavailable.');
  return config.services.filter((value): value is Service => {
    const s = value as Service;
    return !!s && typeof s.id === 'string' && ['training', 'walking', 'aggression', 'online'].includes(s.id)
      && typeof s.name === 'string' && typeof s.description === 'string' && typeof s.interval === 'string'
      && Number.isInteger(s.cents) && s.cents >= 0 && s.cents <= 1000000 && s.enabled === true;
  });
}

export function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export type LiveSession = { id: string; trainerName: string; dogName: string; status: string; audience: string; liveUntil: string };
export function publicLiveSessions(data: unknown): LiveSession[] {
  const snapshot = data as { serverTime?: string; sessions?: LiveSession[]; availability?: string };
  if (!snapshot || snapshot.availability !== 'available' || !Array.isArray(snapshot.sessions)) throw new Error('Live status is unavailable.');
  const serverTime = Date.parse(snapshot.serverTime || '');
  if (!Number.isFinite(serverTime)) throw new Error('Live status is unavailable.');
  return snapshot.sessions.filter(s => s && typeof s.id === 'string' && typeof s.trainerName === 'string'
    && s.audience === 'public' && s.status === 'live' && Date.parse(s.liveUntil) > serverTime);
}

export const focusOptions = ['Focus & engagement', 'Loose-leash walking', 'Recall', 'Place & settle', 'Obedience', 'Other'] as const;
export type JournalEntry = { id: string; dog: string; focus: string; minutes: number; note: string; createdAt: string };
export const JOURNAL_KEY = 'bravo.training-journal.v1';
export function validateEntry(entry: JournalEntry): JournalEntry {
  if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.dog !== 'string' || !entry.dog.trim() || entry.dog.length > 60
    || !focusOptions.includes(entry.focus as typeof focusOptions[number]) || !Number.isInteger(entry.minutes) || entry.minutes < 1 || entry.minutes > 240
    || typeof entry.note !== 'string' || entry.note.length > 2000 || !Number.isFinite(Date.parse(entry.createdAt))) {
    throw new Error('Enter your dog’s name and a practice time between 1 and 240 minutes.');
  }
  return { ...entry, dog: entry.dog.trim(), note: entry.note.trim() };
}
export function decodeJournal(raw: string | null): JournalEntry[] {
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.entries) || data.entries.length > 5000) throw new Error('The saved journal could not be opened.');
  return data.entries.map(validateEntry);
}
export function encodeJournal(entries: JournalEntry[]) {
  if (entries.length > 5000) throw new Error('Your journal is full. Share a copy, then remove older entries.');
  return JSON.stringify({ version: 1, entries: entries.map(validateEntry) });
}
export function journalSummary(entries: JournalEntry[], now = Date.now()) {
  const recent = entries.filter(e => Date.parse(e.createdAt) >= now - 7 * 86400000 && Date.parse(e.createdAt) <= now);
  return { sessions: recent.length, minutes: recent.reduce((sum, e) => sum + e.minutes, 0) };
}
export function exportJournal(entries: JournalEntry[]) {
  return ['BRAVO K9 · TRAINING JOURNAL', 'Personal practice notes', '', ...entries.map(e =>
    `${new Date(e.createdAt).toLocaleDateString('en-US')} · ${e.dog}\n${e.focus} · ${e.minutes} minutes\n${e.note || 'No notes.'}\n`)].join('\n');
}
