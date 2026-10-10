import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdDestination } from '../shared/site-ads.js';

const campaigns = [
  ['saturday-workshop-october-3', 'Saturday Dog Training Workshop', '/workshops'],
  ['ad-b3df1e50-01ff-498b-8ddf-e6c3271a125a', 'Online courses', '/learn'],
  ['ad-2b5c8355-930e-40dc-b036-4c99a92cf18c', 'Gunner', '/#specialist-training'],
  ['ad-84622f25-49c4-46b4-9fab-f48956a8988e', 'Saturday workshops', '/workshops'],
  ['ad-25871280-b5a3-430c-bac6-22da0edc2009', 'No treats or toys', '/dog-training'],
  ['ad-10a0021e-75de-42e1-9944-2f89ebdea4f3', 'Live', '/live'],
];

test('each published legacy advertisement opens its matching page without changing its record', () => {
  for (const [id, title, expected] of campaigns) {
    const ad = Object.freeze({ id, title, link: '/contact', enabled: true, imageRevision: 1 });
    assert.equal(resolveAdDestination(ad), expected, title);
    assert.equal(ad.link, '/contact', 'reads do not mutate stored advertising data');
  }
});

test('future explicit destinations, empty choices and custom links override campaign defaults', () => {
  for (const [id, title] of campaigns) {
    for (const link of ['/contact', '', '/portal?program=training', 'https://example.com/event']) {
      assert.equal(resolveAdDestination({ id, title, link, destinationConfigured: true }), link);
    }
    assert.equal(resolveAdDestination({ id, title, link: '/learn?course=custom' }), '/learn?course=custom');
    assert.equal(resolveAdDestination({ id, title, link: '' }), '', 'an intentionally unlinked ad remains unlinked');
  }
});

test('new ads and repurposed campaigns never inherit an unrelated destination', () => {
  for (const [id, title] of campaigns) {
    assert.equal(resolveAdDestination({ id: 'new-ad', title, link: '/contact' }), '/contact');
    assert.equal(resolveAdDestination({ id, title: 'Different campaign', link: '/contact' }), '/contact');
  }
  assert.equal(resolveAdDestination(), '');
});

test('destination resolution retains link validation rather than accepting unsafe targets', () => {
  const [id, title] = campaigns[1];
  for (const link of ['javascript:alert(1)', 'data:text/html,x', '//other.example', 'http://example.com']) {
    assert.equal(resolveAdDestination({ id, title, link }), '');
    assert.equal(resolveAdDestination({ id, title, link, destinationConfigured: true }), '');
  }
});
