// A cold homepage can request many independent content snapshots at once.
// Bound only these reads so they do not all start database initialization in
// separate serverless instances. Never cache responses or queue account,
// booking availability, streaming, uploads, or writes. Callers can mark
// interactive reads (such as the booking trainer list) as foreground in api().
const contentPaths = new Set([
  '/config', '/team', '/reviews', '/site-images', '/site-content', '/site-music',
  '/site-banner', '/site-banner/weather', '/workshops', '/program-videos',
  '/hero-videos', '/hero-carousel', '/proof-videos',
]);
let active = 0;
const waiting = [];
const abortError = () => new DOMException('The request was aborted.', 'AbortError');

function drain() {
  while (active < 2 && waiting.length) {
    const item = waiting.shift();
    item.signal.removeEventListener('abort', item.cancel);
    if (item.signal.aborted) { item.reject(abortError()); continue; }
    active += 1;
    const finish = () => { active -= 1; drain(); };
    Promise.resolve().then(item.read).then(
      value => { finish(); item.resolve(value); },
      error => { finish(); item.reject(error); },
    );
  }
}

export function publicRead(path, options, read, signal) {
  if ((options.method || 'GET').toUpperCase() !== 'GET' || !contentPaths.has(path.split('?')[0])) return read();
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const item = { read, signal, resolve, reject, cancel: null };
    item.cancel = () => {
      const index = waiting.indexOf(item);
      if (index !== -1) { waiting.splice(index, 1); reject(abortError()); }
    };
    signal.addEventListener('abort', item.cancel, { once: true });
    waiting.push(item);
    drain();
  });
}
