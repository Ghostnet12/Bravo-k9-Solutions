// Browser-only fixtures. This module is never imported by the deployed app.
import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SERVICES } from '../shared/catalog.js';
import { transportLocationState } from '../shared/transport.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
export async function createTransportFixture() {
  const app = express(), html = await readFile(`${dist}/transport.html`, 'utf8');
  const tripId = 'bbbbbbbbbbbbbbbbbbbbbbbb', breederId = 'cccccccccccccccccccccccc';
  const user = role => ({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Fixture Account', role: role === 'owner' ? 'owner' : 'member', email: 'fixture@example.test' });
  const fresh = () => ({ id: tripId, breederName: 'Prairie Kennels', breederId, dogName: 'Gunner', pickup: 'Aberdeen, SD', destination: 'Omaha, NE', pickupAt: '', etaAt: '', status: 'in_transit', sharingEnabled: true, revision: 0, clientEmail: 'fixture@example.test', deviceId: 'fixture-device', location: { latitude: 45.46, longitude: -98.48, observedAt: new Date().toISOString() }, events: [{ status: 'picked_up', note: 'Picked up safely.', at: new Date().toISOString() }] });
  let trip = fresh(), breeders = [{ _id: breederId, name: 'Prairie Kennels', enabled: true, revision: 0 }], mode = 'live', writes = [];
  app.use(express.json());
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'private, no-store'); req.fixtureRole = /fixture-role=([^;]+)/.exec(req.headers.cookie || '')?.[1]; next(); });
  app.get('/api/config', (_req, res) => res.json({ connected: true, paymentsReady: false, services: SERVICES, schedule: { enabled: true } }));
  app.get('/api/auth/me', (req, res) => res.json({ user: req.fixtureRole ? user(req.fixtureRole) : null, services: [], subscriptions: [], membership: { active: false } }));
  app.post('/api/auth/login', (_req, res) => { res.cookie('fixture-role', 'client'); res.json({ user: user('client') }); });
  app.post('/api/auth/logout', (_req, res) => { res.clearCookie('fixture-role'); res.json({ ok: true }); });
  app.get('/api/live', (_req, res) => res.json({ sessions: [], announcements: [], serverTime: new Date().toISOString() }));
  app.get('/api/transport', (req, res) => {
    if (!req.fixtureRole) return res.status(401).json({ error: 'Sign in to continue.' });
    res.json({ canManage: req.fixtureRole === 'owner', gpsConfigured: false, trips: mode === 'empty' ? [] : [trip], breeders: req.fixtureRole === 'client' ? [] : breeders, next: null });
  });
  app.get('/api/transport/trips/:id', (req, res) => {
    if (mode === 'forbidden' || req.params.id !== trip.id) return res.status(404).json({ error: 'Trip not found.' });
    if (mode === 'offline') return res.status(503).json({ error: 'Updates are temporarily unavailable.' });
    const value = structuredClone(trip);
    if (mode === 'stale' && value.location) value.location.observedAt = new Date(Date.now() - 180000).toISOString();
    value.locationState = transportLocationState(value);
    res.json({ trip: value, serverTime: new Date().toISOString() });
  });
  app.post('/api/transport/breeders', (req, res) => { writes.push(req.body); breeders.push({ _id: 'dddddddddddddddddddddddd', name: req.body.name, enabled: true, revision: 0 }); res.status(201).json({ id: 'dddddddddddddddddddddddd' }); });
  app.post('/api/transport/trips', (req, res) => { writes.push(req.body); trip = { ...fresh(), ...req.body, id: tripId, status: 'scheduled', sharingEnabled: false, location: null }; res.status(201).json({ id: tripId }); });
  app.patch('/api/transport/trips/:id', (req, res) => { writes.push(req.body); trip = { ...trip, ...req.body, revision: trip.revision + 1 }; if (!trip.sharingEnabled) trip.location = null; trip.events.push({ status: trip.status, note: req.body.note, at: new Date().toISOString() }); res.json({ ok: true }); });
  app.use('/api', (_req, res) => res.json({ services: [], images: {}, entries: {}, team: [], schedules: [], reviews: [], recommendations: [], count: 0, clips: [], bookings: [], terms: [], messages: [], items: [], tracks: [], alerts: [], revision: 0 }));
  app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
  return { app, tripId, setMode: value => { mode = value; }, reset: () => { trip = fresh(); breeders = [{ _id: breederId, name: 'Prairie Kennels', enabled: true, revision: 0 }]; mode = 'live'; writes = []; }, writes: () => writes };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await createTransportFixture();
  fixture.app.listen(Number(process.env.PORT || (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 3000)), '0.0.0.0', () => console.log('Transport UI fixture ready'));
}
