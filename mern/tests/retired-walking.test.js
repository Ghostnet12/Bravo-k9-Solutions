import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SERVICES, ALL_SERVICES, publicCatalogSnapshot, serviceSelection, quote } from '../shared/catalog.js';
import { GOALS, goalBookingPath } from '../shared/discovery.js';
import { PAGE_METADATA, publicRoutes } from '../shared/page-metadata.js';
import { bookingEntry, cleanBookingDraft } from '../client/src/booking-draft.js';

test('retired walking is absent from public catalog, search routes, and booking entry', () => {
  assert.equal(SERVICES.some(service => service.id === 'walking'), false);
  assert.equal(publicCatalogSnapshot([...SERVICES, { id: 'walking', name: 'Stale Dog Walking' }]).some(service => service.id === 'walking'), false);
  assert.equal(GOALS.some(goal => goal.program === 'walking' || goal.id === 'walks'), false);
  assert.ok(GOALS.every(goal => !goalBookingPath(goal).includes('program=walking')));
  assert.equal(Object.hasOwn(PAGE_METADATA, '/dog-walking'), false);
  assert.ok(!publicRoutes().some(([path]) => path === '/dog-walking'));
  assert.equal(bookingEntry(new URLSearchParams('program=walking')), 'program=training');
  assert.equal(cleanBookingDraft({entry: 'program=walking', ids: ['walking'], form: {}, visits: []}), null);
  assert.throws(() => serviceSelection(['walking']), /Unknown program/);
  assert.throws(() => quote(['walking']), /Unknown program/);
});

test('historical walking invoices retain their saved quantities without reopening sales', () => {
  const historical = ALL_SERVICES.find(service => service.id === 'walking');
  assert.equal(historical?.interval, 'walk');
  const visits = [{ date: '2026-09-21', time: '10:00', service: 'walking' }];
  const saved = quote(['walking'], visits, { dogCount: 2 }, ALL_SERVICES);
  assert.equal(saved.lines[0].quantity, 2);
  assert.equal(saved.dueNowCents, 5000);
});

test('old walking URLs redirect and have no page or sitemap entry', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const source of ['/dog-walking', '/dog-walking.html']) {
    const redirect = config.redirects.find(item => item.source === source);
    assert.equal(redirect?.destination, '/dog-training');
    assert.equal(redirect?.permanent, true);
  }
  assert.ok(!config.rewrites.some(item => item.source === '/dog-walking'));
  const source = await readFile(new URL('../server/public-page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /['"]dog-walking['"]/);
  const sitemap = await readFile(new URL('../client/dist/sitemap.xml', import.meta.url), 'utf8');
  assert.doesNotMatch(sitemap, /dog-walking/);
});

test('customer navigation and booking UI no longer advertise retired walking', async () => {
  for (const path of ['Home.tsx', 'ui.jsx', 'ContactPage.jsx', 'BookingPage.jsx', 'GoalFinder.jsx']) {
    const source = await readFile(new URL('../client/src/' + path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /dog-walking|Dog Walking|program === 'walking'|ids.includes\\('walking'\\)/, path);
  }
});
