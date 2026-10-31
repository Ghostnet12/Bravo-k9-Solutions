import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GOALS, goalBookingPath, goalDetailsPath } from '../shared/discovery.js';
const source = name => readFileSync(new URL(`../client/src/${name}`, import.meta.url), 'utf8');

test('working-dog inquiries never inherit ordinary monthly booking', () => {
  const goal = GOALS.find(item => item.id === 'specialist');
  assert.equal(goalBookingPath(goal), '/contact?interest=job-specific');
  assert.equal(goalDetailsPath(goal), '/#specialist-training');
  assert.match(goal.description, /hunting/);
});
test('aggression keeps its own assessment and booking paths', () => {
  const goal = GOALS.find(item => item.id === 'handling');
  assert.equal(goalDetailsPath(goal), '/behavior-assessment');
  assert.equal(goalBookingPath(goal), '/portal?program=aggression');
});
test('everyday goals retain the correct training focus', () => {
  const goal = GOALS.find(item => item.id === 'manners');
  assert.match(goal.label, /Pulling, jumping & puppy manners/);
  assert.equal(goalBookingPath(goal), '/portal?program=training&focus=basic-obedience');
});
test('focused homepage links to independent training, team and proof pages', () => {
  const read = page => readFileSync(new URL(`../client/dist/${page}.html`, import.meta.url), 'utf8');
  const home = read('bravo-shell');
  for (const route of ['training','our-approach','team','results','reviews']) assert.ok(home.includes(`href="/${route}"`));
  for (const section of ['training-programs','reviews','team','method','dogs']) assert.ok(!home.includes(`id="${section}"`), `${section} belongs on its own page`);
  const training = read('training');
  assert.match(training, /id="specialist-training"[^>]*open/);
  assert.match(training, /Hunting Dog Training/);
  assert.match(training, /data-site-price="training"/);
  assert.match(read('our-approach'), /id="method"/);
  assert.match(read('results'), /id="dogs"/);
});
test('full-month and returning-client entry points are outside disclosures', () => {
  const intro = source('FirstVisitIntro.jsx');
  assert.ok(intro.indexOf('<details') === -1 || intro.indexOf('</details>') < intro.indexOf('Plan my entire month'));
  assert.ok(intro.indexOf('Already training with Bravo?') < intro.indexOf('<form'));
  assert.match(intro, /type="button"[^>]+onClick=\{onFullSchedule\}/);
  assert.match(intro, /Bravo confirms visits separately/);
});
test('navigation keeps operational paths and only one member lesson link', () => {
  const header = source('ui.jsx').split('export function Footer()')[0];
  assert.equal((header.match(/to="\/learn"/g) || []).length, 1);
  assert.match(header, /header-quick-action/);
  assert.match(header, /People & access/);
  assert.match(header, /aria-controls="bravo-navigation"/);
  assert.match(header, /pathname, search, hash/);
});
