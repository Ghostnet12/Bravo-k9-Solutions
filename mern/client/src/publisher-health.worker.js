import { codecProbeSupported, startCodecProbe } from './publisher-codec.js';
let probe, source, active = true;
self.postMessage({ type: 'capabilities', supported: codecProbeSupported() });
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { active = false; source?.stop(); await probe?.disconnect(); self.postMessage({ type: 'stopped' }); self.close(); return; }
  if (data.type !== 'start') return;
  try {
    source = data.track;
    const result = await startCodecProbe(data.track, publication => { if (active) self.postMessage({ type: 'sample', publication }); });
    if (!active) { await result.disconnect(); return; }
    probe = result; self.postMessage({ type: 'ready', publication: probe.sample() });
  } catch (error) { if (active) self.postMessage({ type: 'error', name: error.name, message: error.message }); }
};
