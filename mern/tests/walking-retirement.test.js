import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICES, ALL_SERVICES, quote } from '../shared/catalog.js';
import { GOALS } from '../shared/discovery.js';
import { PAGE_METADATA } from '../shared/page-metadata.js';
import { publicPagePaths } from '../server/public-page.js';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('dog-walking service is retired from the public catalog, quotes and goal finder', () => {
  assert.equal(SERVICES.some(service => service.id === 'walking'), false);
  assert.ok(ALL_SERVICES.some(service => service.id === 'walking'), 'historical records retain their original service identity');
  assert.throws(() => quote(['walking'], [{date:'2026-11-02',time:'10:00',service:'walking'}]), /Unknown program/);
  assert.equal(GOALS.some(goal => goal.program === 'walking'), false);
});
test('dog walking is absent from public routes, marketing and search metadata', () => {
  assert.equal(PAGE_METADATA['/dog-walking'], undefined);
  assert.equal(publicPagePaths.includes('/dog-walking'), false);
  for (const path of ['mern/client/src/Home.tsx','mern/client/src/ui.jsx','mern/client/src/ContactPage.jsx','mern/shared/page-metadata.js']) {
    assert.doesNotMatch(source(path), /(?:Dog Walking|dog walking|dog-walking|Better walks\.)/i, path);
  }
  const vercel = JSON.parse(source('mern/vercel.json'));
  assert.ok(vercel.redirects.some(rule => rule.source === '/dog-walking' && rule.destination === '/dog-training' && rule.permanent));
  assert.ok(vercel.redirects.some(rule => rule.source === '/dog-walking.html' && rule.destination === '/dog-training' && rule.permanent));
  assert.ok(!vercel.rewrites.some(rule => rule.source === '/dog-walking'));
});
