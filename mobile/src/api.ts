import { SITE_ORIGIN } from './domain';

export async function publicRead(path: '/api/config' | '/api/live', signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${SITE_ORIGIN}${path}`, {
      method: 'GET', credentials: 'omit', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Bravo could not be reached.');
    return await response.json();
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
