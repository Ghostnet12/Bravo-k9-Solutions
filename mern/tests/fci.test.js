import test from 'node:test';
import assert from 'node:assert/strict';
import { officialFCIUrl, cleanFCIItems } from '../shared/fci.js';
import { withFCICampaign, FCI_AD } from '../shared/site-ads.js';
import { parseFCIAnnouncements, fetchFCIAnnouncements } from '../server/fci-source.js';
import { loadFCIUpdates, fciSnapshot, fciCronHandler, nextFCIRefresh } from '../server/fci-updates.js';
const item = { url: 'https://www.fci.be/en/News-123.html', title: 'Verified news', date: '2026-10-06' };
test('page reads cannot push refresh beyond the next daily cron', () => {
  for (const [now, next] of [
    ['2026-10-13T13:05:00Z', '2026-10-14T13:00:00.000Z'],
    ['2026-10-13T12:59:00Z', '2026-10-13T13:00:00.000Z'],
    ['2026-10-13T13:00:00Z', '2026-10-14T13:00:00.000Z'],
    ['2026-12-31T23:59:00Z', '2027-01-01T13:00:00.000Z'],
  ]) assert.equal(nextFCIRefresh(new Date(now)).toISOString(), next);
});
test('FCI links reject executable URLs, credentials, ports and lookalike hosts', () => {
  for (const url of ['javascript:alert(1)', '//evil.test/en/a.html', 'https://www.fci.be.evil.test/en/a.html', 'https://user@fci.be/en/a.html', 'https://fci.be:8443/en/a.html', 'http://fci.be/en/a.html', 'https://fci.be/medias/script.js']) assert.equal(officialFCIUrl(url), null, url);
  assert.equal(officialFCIUrl('/en/News-123.html#x'), item.url);
  assert.equal(cleanFCIItems([item, item, { title: 'evil', url: 'https://evil.test/' }]).length, 1);
});
test('parser selects announcements, decodes text, excludes scripts and validates dates', () => {
  const html = `<a href="/en/Menu-1.html">Menu</a><a id="ContentPlaceHolder1_ActualitesRepeater_HyperLink1_0" href="/en/News-123.html"><span class="date">10/6/2026</span><span class="titre">Health &amp; welfare<script>alert(1)</script></span></a><a id="ContentPlaceHolder1_ActualitesRepeater_HyperLink1_1" href="https://evil.test/en/News-1.html"><span class="titre">Bad</span></a>`;
  assert.deepEqual(parseFCIAnnouncements(html), [{ ...item, title: 'Health & welfare' }]);
});
test('source retrieval is bounded, disallows redirects and rejects changed markup', async () => {
  await assert.rejects(fetchFCIAnnouncements(async (url, options) => { assert.equal(url, 'https://www.fci.be/en/'); assert.equal(options.redirect, 'error'); return new Response('x'.repeat(1000001), { headers: { 'Content-Type': 'text/html' } }); }), /limit/);
  await assert.rejects(fetchFCIAnnouncements(async () => new Response('<html>No news</html>', { headers: { 'Content-Type': 'text/html' } })), /structure/);
});
test('FCI campaign preserves existing ads, deduplicates and respects removal', () => {
  const custom = { id: 'existing', image: '/image.webp', enabled: false };
  assert.deepEqual(withFCICampaign({ ads: [custom] }), [custom, { ...FCI_AD }]);
  assert.equal(withFCICampaign({ ads: [FCI_AD] }).length, 1);
  assert.equal(withFCICampaign({ ads: [{ id: 'custom', link: '/fci-support' }] }).length, 1);
  assert.deepEqual(withFCICampaign({ ads: [custom], fciCampaignVersion: 1 }), [custom]);
});
test('persistent cache coalesces refreshes, retains verified news on failure and later recovers', async () => {
  let row; let calls = 0;
  const Model = {
    async updateOne(filter, update) { if (!row) row = { _id: filter._id, ...update.$setOnInsert }; if (update.$set) Object.assign(row, update.$set); },
    findOneAndUpdate(filter, update) { let value = null; if (row.nextAttemptAt <= filter.nextAttemptAt.$lte) { Object.assign(row, update.$set); value = { ...row }; } return { lean: async () => value }; },
    findById() { return { lean: async () => ({ ...row }) }; },
  };
  const options = { Model, connect: async () => {}, now: new Date(), fetchSource: async () => { calls++; return [item]; } };
  const first = await loadFCIUpdates(options); assert.equal(first.items.length, 1);
  await Promise.all([loadFCIUpdates(options), loadFCIUpdates(options)]); assert.equal(calls, 1);
  const failed = await loadFCIUpdates({ ...options, now: new Date(options.now.getTime() + 86400001), fetchSource: async () => { throw new Error('offline'); } });
  assert.deepEqual(failed.items, first.items); assert.equal(failed.stale, true); assert.equal(failed.lastSuccessAt, first.lastSuccessAt);
  const recovered = await loadFCIUpdates({ ...options, now: new Date(options.now.getTime() + 90000002), fetchSource: async () => [{ ...item, title: 'New official title' }] });
  assert.equal(recovered.items[0].title, 'New official title'); assert.equal(recovered.stale, false);
  assert.equal(fciSnapshot(null).unavailable, true);
});
test('cron rejects unauthenticated calls before database access', async () => {
  const res = { set() { return this; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await fciCronHandler({ get: () => 'Bearer invalid' }, res);
  assert.equal(res.code, 401);
});
