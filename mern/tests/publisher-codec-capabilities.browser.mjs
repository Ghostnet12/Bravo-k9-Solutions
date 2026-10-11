// Isolated synthetic-pixel diagnostics; the actual startup assertions run next.
import { chromium, webkit } from 'playwright';
import { once } from 'node:events';
import { createServer } from 'node:http';
const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<title>Codec diagnostics</title>'); }).listen(0, '127.0.0.1');
await once(server, 'listening');
async function diagnose() {
  const results = [];
  for (const config of [
    { codec: 'avc1.42001e', height: 90, avc: { format: 'annexb' } },
    { codec: 'avc1.42001e', height: 96, avc: { format: 'annexb' } },
    { codec: 'avc1.42001e', height: 96, hardwareAcceleration: 'prefer-software' },
    { codec: 'vp8', height: 96 },
  ]) for (const source of ['canvas', 'rgba']) {
    const candidate = { ...config, width: 160, bitrate: 80000, framerate: 4, latencyMode: 'realtime' };
    const result = { scope: typeof document === 'undefined' ? 'worker' : 'window', source, config: candidate, outputs: 0, errors: [] };
    let encoder;
    try {
      if (typeof VideoEncoder !== 'function') { result.supported = false; continue; }
      result.supported = (await VideoEncoder.isConfigSupported(candidate)).supported;
      if (!result.supported) continue;
      encoder = new VideoEncoder({ output(chunk) { result.outputs++; result.lastTimestamp = chunk.timestamp; }, error(e) { result.errors.push(e.message); } });
      encoder.configure(candidate);
      const canvas = new OffscreenCanvas(160, config.height), ctx = canvas.getContext('2d');
      for (let index = 1; index <= 4; index++) {
        ctx.fillStyle = `rgb(${index * 40},80,120)`; ctx.fillRect(0, 0, 160, config.height);
        const input = source === 'canvas' ? new VideoFrame(canvas, { timestamp: index * 250000, duration: 250000 }) : new VideoFrame(ctx.getImageData(0, 0, 160, config.height).data, { format: 'RGBA', codedWidth: 160, codedHeight: config.height, timestamp: index * 250000, duration: 250000 });
        encoder.encode(input, { keyFrame: true }); input.close();
      }
      await Promise.race([encoder.flush(), new Promise((_resolve, reject) => setTimeout(() => reject(new Error('flush timeout')), 2500))]);
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch(e) { result.errors.push(e.message); }
    finally { if (encoder && encoder.state !== 'closed') encoder.close(); results.push(result); }
  }
  return results;
}
try {
  const engine = process.env.BRAVO_BROWSER_ENGINES === 'webkit' ? webkit : chromium;
  const browser = await engine.launch();
  try {
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
    const windowResults = await page.evaluate(diagnose);
    const workerResults = await page.evaluate(async source => {
      const url = URL.createObjectURL(new Blob([`(${source})().then(data=>postMessage(data)).catch(e=>postMessage({error:e.message}));`], { type: 'text/javascript' }));
      const worker = new Worker(url);
      try { return await new Promise((resolve, reject) => { worker.onmessage = e => resolve(e.data); worker.onerror = () => reject(new Error('worker diagnostic failed')); }); }
      finally { worker.terminate(); URL.revokeObjectURL(url); }
    }, diagnose.toString());
    for (const row of [...windowResults, ...workerResults]) console.log('CODEC_DIAGNOSTIC', JSON.stringify(row));
  } finally { await browser.close(); }
} finally { await new Promise(resolve => server.close(resolve)); }
