import test from 'node:test';
import assert from 'node:assert/strict';
import { observation, createWeatherReader } from '../server/banner-weather.js';
const now = Date.parse('2026-09-19T18:00:00Z');
const fixture = { properties: { timestamp: new Date(now).toISOString(), temperature: { value: 17, unitCode: 'wmoUnit:degC' }, textDescription: 'Cloudy' } };
test('weather rejects missing, stale and future observations instead of inventing current conditions', () => {
  assert.equal(observation(fixture, now).temperature, 63);
  assert.equal(observation(fixture, now + 7200001), null);
  assert.equal(observation(fixture, now - 300001), null);
  assert.equal(observation({ properties: { ...fixture.properties, temperature: { value: null } } }, now), null);
});
test('weather coalesces concurrent requests, caches successes, and expires failure fallback', async () => {
  let time = now, requests = 0, fails = false;
  const read = createWeatherReader(async url => { requests++; assert.equal(url, 'https://api.weather.gov/stations/KABR/observations/latest'); if (fails) throw Error('offline'); return { ok: true, json: async () => fixture }; }, () => time);
  const results = await Promise.all([read(), read(), read()]); assert.equal(requests, 1); assert.equal(results[0].temperature, 63);
  await read(); assert.equal(requests, 1);
  time += 300001; fails = true; assert.equal(await read(), null); assert.equal(requests, 2);
  await read(); assert.equal(requests, 2);
  time += 60001; fails = false; assert.equal((await read()).temperature, 63); assert.equal(requests, 3);
});
