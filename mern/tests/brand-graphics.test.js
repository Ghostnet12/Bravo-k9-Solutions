import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const css = readFileSync(new URL('client/src/brand-graphics.css', root), 'utf8');
const directory = new URL('client/public/graphics/', root);
test('original graphics are small self-contained SVGs with no executable or external content', () => {
  const assets = readdirSync(directory).filter(file => file.endsWith('.svg'));
  assert.equal(assets.length, 8);
  let bytes = 0;
  for (const file of assets) {
    const path = new URL(file, directory), svg = readFileSync(path, 'utf8');
    bytes += statSync(path).size;
    assert.match(svg, /viewBox=/);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|<animate|onload=|href=|@import/);
  }
  assert.ok(bytes < 8000, `SVG budget exceeded: ${bytes} bytes`);
});
test('every decorative asset is local, present and referenced by the stylesheet', () => {
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map(match => match[1]);
  for (const url of urls) { assert.ok(url.startsWith('/')); assert.ok(statSync(new URL(`client/public${url}`, root)).isFile()); }
  for (const file of readdirSync(directory)) assert.ok(urls.includes(`/graphics/${file}`));
  assert.ok(css.length < 14000);
});
test('graphics do not create text labels, hide functional content or require continuous motion', () => {
  assert.doesNotMatch(css, /content:\s*['"][^'"]+['"]|@keyframes|animation:|position:\s*fixed|!important/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /access-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.match(css, /access-high-contrast/);
  assert.match(readFileSync(new URL('client/src/home-polish.css', root), 'utf8'), /^@import '\.\/brand-graphics\.css';/);
});
