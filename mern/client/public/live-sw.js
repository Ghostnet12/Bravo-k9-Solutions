// Network-only: never cache private pages, API responses, credentials or media.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// No fetch listener: requests go directly to the browser network stack. Even
// an empty handler adds interception without providing offline functionality.
