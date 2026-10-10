import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOME_ADS, SITE_AD_ID, safeAdLink, normalizeAdSettings } from '../shared/site-ads.js';

test('homepage ad carousel ships with the Saturday workshop as its first banner', async () => {
  const ad = DEFAULT_HOME_ADS[0];
  assert.equal(ad.id, 'saturday-workshop-october-3');
  assert.equal(ad.title, 'Saturday Dog Training Workshop');
  assert.equal(ad.link, '/workshops');
  assert.equal(ad.enabled, true);
  assert.equal(ad.image, '/images/saturday-workshop-october-3.webp');
});

test('ad IDs and links are constrained to safe public destinations', () => {
  for (const id of ['saturday-workshop-october-3', 'ad-1234', 'a']) assert.equal(SITE_AD_ID.test(id), true);
  for (const id of ['', '../admin', 'a/b', '<script>', 'a'.repeat(81)]) assert.equal(SITE_AD_ID.test(id), false);
  assert.equal(safeAdLink('/contact'), '/contact');
  assert.equal(safeAdLink('/portal?program=training'), '/portal?program=training');
  assert.equal(safeAdLink('https://example.com/workshop'), 'https://example.com/workshop');
  for (const link of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'http://example.com']) assert.equal(safeAdLink(link), '');
});

test('carousel autoplay timing is bounded', () => {
  assert.equal(normalizeAdSettings({}).autoplaySeconds, 7);
  assert.equal(normalizeAdSettings({ autoplaySeconds: 1 }).autoplaySeconds, 3);
  assert.equal(normalizeAdSettings({ autoplaySeconds: 99 }).autoplaySeconds, 20);
  assert.equal(normalizeAdSettings({ autoplaySeconds: 11.4 }).autoplaySeconds, 11);
});
