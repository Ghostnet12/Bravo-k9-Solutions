import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { api } from '../client/src/api.js';

function requests(t) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException('Aborted', 'AbortError'));
    options.signal.addEventListener('abort', cancel, { once: true });
    calls.push({ url, options,
      finish: (status = 200) => {
        options.signal.removeEventListener('abort', cancel);
        resolve(new Response(JSON.stringify(status === 200 ? { url } : { error: 'Unavailable' }), { status }));
      },
    });
  }));
  return calls;
}

test('public content concurrency is bounded while booking, sign-in, live and writes start immediately', async t => {
  const calls = requests(t);
  const paths = ['/team', '/reviews', '/site-images', '/proof-videos', '/hero-videos?after=page2', '/config'];
  const content = paths.map(path => api(path));
  await turn(); assert.equal(calls.length, 2);
  const immediate = ['/availability', '/auth/me', '/live', '/site-images/asset/video'].map(path => api(path));
  immediate.push(api('/workshops', { method: 'PUT', body: { title: 'Unsent fixture' } }));
  immediate.push(api('/team', { foreground: true }));
  await turn(); assert.equal(calls.length, 8);
  assert.deepEqual(calls.slice(2).map(call => call.url), ['/api/availability', '/api/auth/me', '/api/live', '/api/site-images/asset/video', '/api/workshops', '/api/team']);
  assert.equal('foreground' in calls.at(-1).options, false, 'internal priority is not sent to fetch');
  for (const call of calls) { assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.cache, 'no-store'); call.finish(); }
  await Promise.all(immediate); await turn(); assert.equal(calls.length, 10);
  calls.slice(8).forEach(call => call.finish()); await turn(); assert.equal(calls.length, 12);
  calls.slice(10).forEach(call => call.finish());
  assert.deepEqual(await Promise.all(content), paths.map(path => ({ url: `/api${path}` })));
});

test('cancelled and timed-out queued reads never start; failures release capacity', async t => {
  const calls = requests(t);
  const first = api('/team'), second = api('/reviews');
  const controller = new AbortController();
  const cancelled = assert.rejects(api('/site-images', { signal: controller.signal }), { name: 'AbortError' });
  const timedOut = assert.rejects(api('/site-content', { timeoutMs: 10 }), { code: 'request_timeout' });
  controller.abort(); await cancelled; await timedOut;
  assert.equal(calls.length, 2);
  const failure = assert.rejects(first, { message: 'Unavailable', status: 503 });
  const next = api('/config');
  calls[0].finish(503);
  await new Promise(resolve => setTimeout(resolve, 230));
  assert.equal(calls.length, 3, 'transient public request retries only once before releasing its queue slot');
  assert.equal(calls[2].url, '/api/team');
  calls[2].finish(503); await failure; await turn(); assert.equal(calls.length, 4);
  assert.equal(calls[3].url, '/api/config');
  calls[1].finish(); calls[3].finish(); await Promise.all([second, next]);
});

test('active cancellation releases capacity and later reads get fresh responses', async t => {
  const calls = requests(t), controller = new AbortController();
  const aborted = assert.rejects(api('/team', { signal: controller.signal }), { name: 'AbortError' });
  const second = api('/reviews'), next = api('/config');
  await turn(); controller.abort(); await aborted; await turn();
  assert.deepEqual(calls.map(call => call.url), ['/api/team', '/api/reviews', '/api/config']);
  calls.slice(1).forEach(call => call.finish()); await Promise.all([second, next]);
  const fresh = api('/reviews'); await turn(); assert.equal(calls.length, 4);
  calls[3].finish(); await fresh;
});

test('only public content retries a temporary server error, not availability or account requests', async t => {
  const calls = requests(t);
  const publicRequest = api('/reviews');
  const bookingRequest = assert.rejects(api('/availability'), { status: 503 });
  await turn();
  calls[0].finish(503); calls[1].finish(503);
  await bookingRequest;
  await new Promise(resolve => setTimeout(resolve, 230));
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url, '/api/reviews');
  calls[2].finish();
  await publicRequest;
});
