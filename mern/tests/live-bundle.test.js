import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// Loading a live route on a fresh document must not re-import the application
// entry while that entry is importing the route (WebKit can stall on this).
test('lazy live routes have no static dependency on the app bootstrap', async () => {
  const dist = new URL('../client/dist/', import.meta.url);
  const html = await readFile(new URL('bravo-shell.html', dist), 'utf8');
  const entry = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)[1].split('/').pop();
  const assets = new URL('assets/', dist);
  const files = (await readdir(assets)).filter(name => /^Live(?:Page|Studio)-.*\.js$/.test(name));
  assert.equal(files.length, 2);
  async function check(name, visited = new Set()) {
    assert.notEqual(name, entry, 'live route statically depends on bootstrap');
    if (visited.has(name)) return;
    visited.add(name);
    const source = await readFile(new URL(name, assets), 'utf8');
    for (const [, dependency] of source.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) await check(dependency, visited);
  }
  for (const name of files) await check(name);
});
