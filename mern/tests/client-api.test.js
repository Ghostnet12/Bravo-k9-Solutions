import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../client/src/api.js';

test('leaving a page cancels its status request without turning cancellation into a timeout', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
  });
  try {
    const controller = new AbortController();
    const pending = api('/live', { signal: controller.signal, timeoutMs: 1000 });
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError' && !error.code?.startsWith?.('request_'));
    await assert.rejects(api('/live', { timeoutMs: 5 }), error => error.code === 'request_timeout');
  } finally { globalThis.fetch = original; }
});
