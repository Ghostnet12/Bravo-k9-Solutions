import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CONTENT_KEYS } from '../shared/site-content-keys.js';

test('every literal editable field has a server publishing key', async () => {
  const directory = new URL('../client/src/', import.meta.url);
  let checked = 0;
  for (const file of await readdir(directory)) {
    if (!/\.[jt]sx$/.test(file)) continue;
    const source = await readFile(new URL(file, directory), 'utf8');
    for (const match of source.matchAll(/contentKey="([^"]+)"/g)) {
      assert.ok(Object.hasOwn(CONTENT_KEYS, match[1]), `${file}: ${match[1]} must be publishable`);
      checked++;
    }
    // The cinematic homepage and navigation use literal keys and capabilities.
    if (!['Home.tsx', 'ui.jsx'].includes(file)) continue;
    for (const match of source.matchAll(/<Editable\b[^>]*?contentKey="(cinema-[^"]+)"[^>]*>/g)) {
      assert.equal(CONTENT_KEYS[match[1]].text, match[0].includes('canEditText'));
      assert.equal(!!CONTENT_KEYS[match[1]].link, match[0].includes('canEditLink'));
    }
  }
  assert.ok(checked > 100, 'check the real application, not a fixture');
});
