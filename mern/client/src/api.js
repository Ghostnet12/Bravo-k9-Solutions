import { reportBrowserError } from './telemetry.js';
export async function api(path, options = {}) {
  const { timeoutMs = path.endsWith('/checkout') ? 50000 : 20000, signal, ...fetchOptions } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...fetchOptions, cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...fetchOptions.headers }, body: fetchOptions.body === undefined ? undefined : JSON.stringify(fetchOptions.body) });
    const data = await res.json().catch(() => null);
    if (!data) throw Object.assign(new Error('The service returned an unexpected response. Please try again or contact Bravo.'), { status: res.status });
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status, code: data.code });
    return data;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error.name === 'AbortError') reportBrowserError('request_timeout', `/api${path}`);
    else if (error instanceof TypeError && !error.status) reportBrowserError('network_error', `/api${path}`);
    if (error.name === 'AbortError') throw Object.assign(new Error('This is taking longer than expected. Your input is still here; please try again.'), { code: 'request_timeout' });
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}
