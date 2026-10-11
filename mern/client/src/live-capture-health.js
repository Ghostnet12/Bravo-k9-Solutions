// Camera evidence is separate from network reachability. Do not encode/decode
// a second hidden self-call just to let the first viewer join on a phone.
export const cameraReady = stream => !!stream?.getVideoTracks().some(track => track.readyState === 'live' && track.enabled && !track.muted);
export const PHONE_VIDEO = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } };
const failure = (code, message) => Object.assign(new Error(`${message} [${code}]`), { code });
const decodedFrames = video => {
  const quality = video.getVideoPlaybackQuality?.();
  const count = quality ? quality.totalVideoFrames - (quality.droppedVideoFrames || 0) : video.webkitDecodedFrameCount;
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
};
export async function createPublisherHealth(getStream, video, { signal, timeoutMs = 10000 } = {}) {
  if (!video || !cameraReady(getStream())) throw failure('CAMERA_NOT_READY', 'Enable the camera preview, then try Start live again.');
  const id = crypto.randomUUID();
  let closed = false, frameRequest, framesCaptured = 0, previousCount = decodedFrames(video);
  let track = getStream().getVideoTracks()[0];
  const ready = () => !closed && !signal?.aborted && document.visibilityState !== 'hidden' && cameraReady(getStream()) &&
    getStream()?.getVideoTracks().includes(track) && video.srcObject?.getVideoTracks().includes(track) && !video.paused && video.readyState >= 2 && video.videoWidth > 0;
  const callbacks = typeof video.requestVideoFrameCallback === 'function';
  function observeFrame() {
    if (closed) return;
    // Each callback observes a newly presented source frame. This is NOT an
    // encoded/decoded RTP counter and is never reported as network delivery.
    if (ready()) framesCaptured++;
    frameRequest = video.requestVideoFrameCallback(observeFrame);
  }
  function disconnect() {
    if (closed) return;
    closed = true;
    if (frameRequest !== undefined) video.cancelVideoFrameCallback?.(frameRequest);
    signal?.removeEventListener('abort', disconnect);
  }
  const sample = async () => {
    if (closed || signal?.aborted) throw failure('CAMERA_CANCELLED', 'Camera check stopped.');
    if (!callbacks) {
      const count = decodedFrames(video);
      if (ready() && count !== null && previousCount !== null && count > previousCount) framesCaptured += count - previousCount;
      previousCount = count;
    }
    return { id, kind: 'camera', framesCaptured };
  };
  const replaceTrack = async next => {
    if (closed) throw failure('CAMERA_CANCELLED', 'Camera check stopped.');
    track = next; previousCount = decodedFrames(video);
  };
  try {
    if (signal?.aborted) throw failure('CAMERA_CANCELLED', 'Camera check stopped.');
    signal?.addEventListener('abort', disconnect, { once: true });
    if (!callbacks && previousCount === null) throw failure('CAMERA_METRICS_UNAVAILABLE', 'This browser cannot verify live camera frames. Open Bravo directly in an updated Safari or Chrome browser.');
    if (callbacks) frameRequest = video.requestVideoFrameCallback(observeFrame);
    let playError;
    // Do not await a potentially unresolved play() promise forever. The frame
    // deadline below bounds startup and handles denied playback explicitly.
    video.play().catch(error => { playError = error; });
    const deadline = Date.now() + timeoutMs;
    while (!closed && !signal?.aborted && Date.now() < deadline) {
      if (playError?.name === 'NotAllowedError') throw failure('CAMERA_PLAYBACK_BLOCKED', 'Press Resume preview, then tap Start live again.');
      if (!cameraReady(getStream())) throw failure('CAMERA_INTERRUPTED', 'The camera was interrupted. Close other camera apps, enable the preview and try again.');
      const result = await sample();
      if (ready() && result.framesCaptured >= 2) return { sample, disconnect, replaceTrack };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (closed || signal?.aborted) throw failure('CAMERA_CANCELLED', 'Camera check stopped.');
    throw failure('CAMERA_NO_FRAMES', 'The camera preview is not advancing. Keep Bravo visible, press Resume preview, then try Start live again.');
  } catch (error) { disconnect(); throw error; }
}
