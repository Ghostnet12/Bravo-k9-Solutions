// Read-only production audit. No credentials, form submissions or client data.
import assert from 'node:assert/strict';
import { PAGE_METADATA, SITE_ORIGIN, publicRoutes, canonicalUrl } from '../shared/page-metadata.js';
const checks = [];
const response = async path => {
  const res = await fetch(SITE_ORIGIN + path, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  return { status: res.status, headers: res.headers, html: await res.text() };
};
for (const [path, metadata] of Object.entries(PAGE_METADATA)) {
  checks.push([path, async () => {
    const r = await response(path);
    assert.equal(r.status, 200);
    assert.ok(r.html.includes(`rel="canonical" href="${canonicalUrl(path)}"`));
    assert.equal((r.html.match(/rel="canonical"/g) || []).length, 1);
    if (metadata.private) {
      assert.match(r.headers.get('x-robots-tag'), /noindex/);
      assert.match(r.html, /name="robots" content="noindex/);
    } else {
      assert.match(r.html, /name="robots" content="index, follow/);
      assert.ok(!/noindex/.test(r.headers.get('x-robots-tag') || ''));
      assert.equal((r.html.match(/<h1\b/g) || []).length, 1);
      assert.match(r.html, /id="bravo-structured-data"/);
    }
  }]);
  if (path !== '/') for (const suffix of ['.html', '/']) checks.push([path + suffix, async () => {
    const r = await response(path + suffix + '?audit=1');
    assert.ok([301, 308].includes(r.status));
    assert.equal(new URL(r.headers.get('location'), SITE_ORIGIN).href, SITE_ORIGIN + path + '?audit=1');
  }]);
}
checks.push(['/sitemap.xml', async () => {
  const r = await response('/sitemap.xml'); assert.equal(r.status, 200);
  assert.deepEqual([...r.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort(), publicRoutes().map(([path]) => canonicalUrl(path)).sort());
}], ['/robots.txt', async () => {
  const r = await response('/robots.txt'); assert.equal(r.status, 200);
  assert.ok(r.html.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
  assert.ok(r.html.includes('Allow: /api/proof-videos$'));
  assert.ok(r.html.includes('Allow: /api/team/schedules$'));
  assert.doesNotMatch(r.html, /Disallow: \/(?:account|admin|schedule|portal)/);
}], ['/missing-bravo-indexing-audit-page', async () => {
  const r = await response('/missing-bravo-indexing-audit-page'); assert.equal(r.status, 404);
  assert.match(r.html, /noindex/); assert.doesNotMatch(r.html, /rel="canonical"/);
}]);
let failures = 0;
for (let i = 0; i < checks.length; i += 4) {
  const results = await Promise.allSettled(checks.slice(i, i + 4).map(async ([path, check]) => { await check(); return path; }));
  results.forEach((result, index) => {
    const path = checks[i + index][0];
    if (result.status === 'fulfilled') console.log(`PASS ${path}`);
    else { failures++; console.error(`FAIL ${path}: ${result.reason.message}`); }
  });
}
console.log(`${checks.length - failures}/${checks.length} indexing checks passed. Search Console coverage is a separate Google status.`);
process.exitCode = failures ? 1 : 0;
