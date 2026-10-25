import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SERVICES, ALL_SERVICES } from '../shared/catalog.js';
import { GOALS } from '../shared/discovery.js';
import { PAGE_METADATA } from '../shared/page-metadata.js';
import { publicPagePaths } from '../server/public-page.js';

test('retired walking is not offered in services, training goals, pages, or routes', async () => {
  assert.ok(!SERVICES.some(service => service.id === 'walking'));
  assert.ok(ALL_SERVICES.some(service => service.id === 'walking'), 'historical service labels are retained');
  assert.ok(!GOALS.some(goal => goal.program === 'walking'));
  assert.equal(PAGE_METADATA['/dog-walking'], undefined);
  assert.ok(!publicPagePaths.includes('/dog-walking'));
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const source of ['/dog-walking', '/dog-walking.html'])
    assert.ok(config.redirects.some(route => route.source === source && route.destination === '/dog-training' && route.permanent === true));
  assert.ok(!config.rewrites.some(route => route.source === '/dog-walking'));
});
