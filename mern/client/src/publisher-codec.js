// Network-independent camera health. Count only actual codec output from new
// source frames, never elapsed time, preview dimensions, RTP bytes or readiness.
export const codecProbeSupported = () => ['MediaStreamTrackProcessor', 'VideoEncoder', 'VideoDecoder', 'VideoFrame', 'OffscreenCanvas'].every(name => typeof globalThis[name] === 'function');
const unsupported = () => Object.assign(new Error('This browser needs the compatible camera check.'), { name: 'NotSupportedError' });
export async function startCodecProbe(track, onSample = () => {}) {
  if (!codecProbeSupported()) { track.stop(); throw unsupported(); }
  let stopped = false, failure, reader, encoder, decoder, readyTimer;
  let framesEncoded = 0, framesDecoded = 0, lastTimestamp = -Infinity;
  let captured = 0, submitted = 0, firstSourceTimestamp = null, lastSourceTimestamp = null;
  const pending = new Set(), id = crypto.randomUUID();
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // A reader can fail before the caller begins awaiting readiness.
  void ready.catch(() => {});
  const sample = () => {
    if (failure) throw failure;
    if (stopped) throw new Error('Camera check stopped.');
    return { id, framesEncoded, framesDecoded };
  };
  const disconnect = async () => {
    if (stopped) return;
    stopped = true; clearTimeout(readyTimer); pending.clear();
    track.stop();
    if (encoder && encoder.state !== 'closed') encoder.close();
    if (decoder && decoder.state !== 'closed') decoder.close();
    await reader?.cancel().catch(() => {});
    rejectReady(Object.assign(new Error('Camera check cancelled.'), { name: 'AbortError' }));
  };
  const fail = message => {
    if (stopped) return;
    failure = message instanceof Error ? message : new Error(message);
    rejectReady(failure); void disconnect();
  };
  try {
    let config;
    for (const codec of ['avc1.42001e', 'vp8']) {
      const candidate = { codec, width: 160, height: 90, bitrate: 80000, framerate: 4, latencyMode: 'realtime', ...(codec.startsWith('avc1') ? { avc: { format: 'annexb' } } : {}) };
      const supported = await Promise.all([VideoEncoder.isConfigSupported(candidate), VideoDecoder.isConfigSupported({ codec, codedWidth: 160, codedHeight: 90 })]).catch(() => []);
      if (supported.length === 2 && supported.every(result => result.supported)) { config = candidate; break; }
    }
    if (!config) throw unsupported();
    const canvas = new OffscreenCanvas(160, 90), context = canvas.getContext('2d', { alpha: false });
    if (!context) throw unsupported();
    decoder = new VideoDecoder({
      output(frame) {
        const timestamp = frame.timestamp; frame.close();
        if (stopped || !pending.delete(timestamp)) return;
        framesDecoded++; onSample(sample());
        if (framesEncoded >= 2 && framesDecoded >= 2) { clearTimeout(readyTimer); resolveReady(); }
      },
      error() { fail('The camera video could not be decoded. Try Start live again.'); },
    });
    encoder = new VideoEncoder({
      output(chunk, metadata) {
        if (stopped || !pending.has(chunk.timestamp)) return;
        try {
          if (decoder.state === 'unconfigured') decoder.configure({ ...(metadata.decoderConfig || { codec: config.codec, codedWidth: 160, codedHeight: 90 }), optimizeForLatency: true });
          framesEncoded++; decoder.decode(chunk);
          // Every probe frame is an independent keyframe. Explicitly drain the
          // tiny batch; hardware codecs may otherwise buffer more frames than
          // this health probe intentionally allows outstanding.
          void decoder.flush().catch(() => { if (!stopped) fail('The camera video could not be decoded. Try Start live again.'); });
        } catch { fail('The camera video could not be decoded. Try Start live again.'); }
      },
      error() { fail('The camera video could not be encoded. Try Start live again.'); },
    });
    encoder.configure(config);
    reader = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 }).readable.getReader();
    readyTimer = setTimeout(() => fail(Object.assign(new Error('No fresh camera frames arrived. Keep this tab open, check the camera preview, then try Start live again.'), { diagnostic: { captured, submitted, framesEncoded, framesDecoded, firstSourceTimestamp, lastSourceTimestamp, muted: track.muted, enabled: track.enabled, readyState: track.readyState } })), 8000);
    void (async () => {
      try {
        while (!stopped) {
          const { value: frame, done } = await reader.read();
          if (done) { if (!stopped) fail('The camera stopped. Enable camera preview and try again.'); return; }
          captured++; firstSourceTimestamp ??= frame.timestamp; lastSourceTimestamp = frame.timestamp;
          try {
            // Source timestamps advance only for new camera frames. Limit work
            // to four tiny frames/sec; queues and retained frames stay bounded.
            if (stopped || track.muted || !track.enabled || !Number.isFinite(frame.timestamp) || frame.timestamp - lastTimestamp < 250000 || pending.size >= 2 || encoder.encodeQueueSize > 1 || decoder.decodeQueueSize > 1) continue;
            lastTimestamp = frame.timestamp;
            context.drawImage(frame, 0, 0, 160, 90);
            const input = new VideoFrame(canvas, { timestamp: frame.timestamp });
            try { submitted++; pending.add(input.timestamp); encoder.encode(input, { keyFrame: true }); }
            finally { input.close(); }
            await encoder.flush();
          } finally { frame.close(); }
        }
      } catch { if (!stopped) fail('Camera frame processing stopped. Try Start live again.'); }
    })();
    await ready;
    return { sample, disconnect };
  } catch (error) { await disconnect(); throw error; }
}
