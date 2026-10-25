import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import { CLIENT_STORIES, clientStory, featuredClientReviews } from '../shared/client-stories.js';
import { recommendationMarkup } from '../shared/review-markup.js';
import { workshopMarkup, DEFAULT_WORKSHOP } from '../shared/workshops.js';

test('three case summaries stay attached to published source reviews, without duplicating them', () => {
  const { featured, more } = featuredClientReviews(DEFAULT_REVIEWS);
  assert.equal(featured.length, 3);
  assert.deepEqual(featured.map(r => r.id), CLIENT_STORIES.map(s => s.reviewId));
  for (const review of featured) assert.ok(review.body.includes(clientStory(review).outcome));
  assert.equal(new Set([...featured, ...more].map(r => r.id)).size, DEFAULT_REVIEWS.length);
  const markup = recommendationMarkup(DEFAULT_REVIEWS);
  assert.equal((markup.match(/class="panel client-story-card"/g) || []).length, 3);
  assert.match(markup, /Their owner reported/);
  assert.match(markup, /Benny &amp; Huck/);
});
test('editing, removing or unpublishing a source never leaves a stale outcome on the page', () => {
  const source = DEFAULT_REVIEWS.find(r => r.id === CLIENT_STORIES[0].reviewId);
  for (const patch of [{ body: 'Updated feedback with no previous claims.' }, { deleted: true }, { enabled: false }]) {
    const review = { ...source, ...patch };
    assert.equal(clientStory(review), null);
    assert.doesNotMatch(recommendationMarkup([review]), /Their owner reported|Benny &amp; Huck/);
  }
  assert.equal(featuredClientReviews(DEFAULT_REVIEWS.filter(r => r.id !== source.id)).featured.some(r => r.id === source.id), false);
  assert.doesNotMatch(recommendationMarkup([{ ...source, body: '<img src=x onerror=alert(1)>' }]), /<img/);
});
test('compact workshop keeps the next decision while full page keeps the complete details', () => {
  const event = { ...DEFAULT_WORKSHOP, date: '2030-10-05', scheduleMode: 'weekly' };
  const compact = workshopMarkup(event, true, new Date('2030-10-01'));
  assert.match(compact, /<dt>Date<|<dt>Time<|<dt>Price</);
  assert.match(compact, /Workshop details/);
  assert.doesNotMatch(compact, /<dt>Location<|<dt>Duration<|workshop-description/);
  assert.match(workshopMarkup(event, false), /<dt>Location<.*<dt>Duration</);
  assert.match(workshopMarkup({ ...event, date: null }, true), /Date to be announced/);
  assert.match(workshopMarkup({ ...event, date: '2020-10-05' }, true), /PREVIOUS WORKSHOP/);
});
