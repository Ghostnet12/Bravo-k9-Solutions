import { codecProbeSupported, startCodecProbe } from './publisher-codec.js';
const abortError = () => Object.assign(new Error('Broadcast cancelled.'), { name: 'AbortError' });
const unsupported = () => Object.assign(new Error('This browser needs the compatible camera check.'), { name: 'NotSupportedError' });
function workerProbe(track, signal) {
  return new Promise((resolve, reject) => {
    let worker, clone, latest, failure, ready = false, stopped = false, stopTimer, startupTimer;
    let resolveStopped;
    const stoppedPromise = new Promise(done => { resolveStopped = done; });
    const finish = () => { clearTimeout(stopTimer); worker?.terminate(); resolveStopped(); };
    const disconnect = () => {
      if (stopped) return stoppedPromise;
      stopped = true; clearTimeout(startupTimer); clone?.stop();
      signal?.removeEventListener('abort', abort);
      // Let the worker close its transferred clone before terminating; force
      // termination if the worker fails to acknowledge within a bounded time.
      try { worker?.postMessage({ type: 'stop' }); stopTimer = setTimeout(finish, 500); } catch { finish(); }
      if (!ready) reject(abortError());
      return stoppedPromise;
    };
    const abort = () => { failure = abortError(); reject(failure); void disconnect(); };
    const fail = error => { failure = error; if (!ready) reject(error); void disconnect(); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try {
      worker = new Worker(new URL('./publisher-health.worker.js', import.meta.url), { type: 'module' });
      startupTimer = setTimeout(() => fail(new Error('The camera check timed out. Keep this tab open and try Start live again.')), 11000);
      worker.onerror = () => fail(unsupported());
      worker.onmessage = ({ data }) => {
        if (data.type === 'stopped') { finish(); return; }
        if (stopped) return;
        if (data.type === 'capabilities') {
          if (!data.supported) { fail(unsupported()); return; }
          try { clone = track.clone(); worker.postMessage({ type: 'start', track: clone }, [clone]); clone = null; }
          catch { fail(unsupported()); }
        } else if (data.type === 'sample' || data.type === 'ready') {
          latest = data.publication;
          if (data.type === 'ready') {
            ready = true; clearTimeout(startupTimer);
            resolve({ sample: () => { if (failure) throw failure; if (stopped || !latest) throw abortError(); return { ...latest }; }, disconnect });
          }
        } else if (data.type === 'error') fail(Object.assign(new Error(data.message), { name: data.name }));
      };
    } catch { fail(unsupported()); }
  });
}
export async function createLocalPublisherHealth(getStream, { signal } = {}) {
  const track = getStream()?.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') throw new Error('Enable camera preview first.');
  if (signal?.aborted) throw abortError();
  if (!codecProbeSupported()) return workerProbe(track, signal);
  const clone = track.clone();
  let probe;
  const abort = () => { clone.stop(); void probe?.disconnect(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    probe = await startCodecProbe(clone);
    if (signal?.aborted) { await probe.disconnect(); throw abortError(); }
    return { sample: probe.sample, disconnect: () => { signal?.removeEventListener('abort', abort); return probe.disconnect(); } };
  } catch (error) { signal?.removeEventListener('abort', abort); clone.stop(); if (signal?.aborted) throw abortError(); throw error; }
}
