import assert from 'node:assert/strict';

// WebKit can report a handled old-document live poll cancellation as pageerror
// during a hard navigation. Keep that narrow diagnostic separately; native
// uncaught errors and failed reads in the new document remain test failures.
export async function observeDocumentNavigation(page, { engine, origin, errors }) {
  const navigationDiagnostics = [];
  let navigating = false;
  page.on('pageerror', error => {
    if (engine === 'webkit' && navigating && error.message.endsWith(`${new URL(origin).host}/api/live due to access control checks.`)) {
      navigationDiagnostics.push({ message: error.message, url: page.url() });
    } else errors.push(error.message);
  });
  await page.exposeFunction('recordNavigationRuntimeError', message => errors.push(message));
  await page.addInitScript(() => {
    window.addEventListener('error', event => {
      if (event instanceof ErrorEvent) void window.recordNavigationRuntimeError(event.error?.stack || event.message).catch(() => {});
    });
    window.addEventListener('unhandledrejection', event => {
      void window.recordNavigationRuntimeError(event.reason?.stack || event.reason?.message || String(event.reason)).catch(() => {});
    });
  });
  async function navigate(url) {
    await page.waitForLoadState('networkidle');
    navigating = true;
    try { if (url) await page.goto(url); else await page.reload(); }
    finally { navigating = false; }
    const live = await page.evaluate(async () => {
      const response = await fetch('/api/live', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      return { status: response.status, sessions: Array.isArray(data.sessions), announcements: Array.isArray(data.announcements) };
    });
    assert.deepEqual(live, { status: 200, sessions: true, announcements: true });
    await page.waitForLoadState('networkidle');
  }
  return { navigate, navigationDiagnostics };
}
