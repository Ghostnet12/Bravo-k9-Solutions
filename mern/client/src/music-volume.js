const clamp = value => Math.max(0, Math.min(1, value));

// Some mobile platforms keep media volume under hardware control. Probe the
// element as well as iOS/iPadOS, where a writable property need not be audible.
export function createMusicVolume(element, preferences = {}, device = navigator) {
  const ios = /iPad|iPhone|iPod/.test(device.userAgent || '') || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
  const original = element.volume;
  let supported = false;
  if (!ios) {
    try { element.volume = .5; supported = Math.abs(element.volume - .5) < .001; } catch { /* Device-controlled volume. */ }
    finally { try { element.volume = original; } catch { supported = false; } }
  }
  let volume = Number.isFinite(preferences.volume) ? clamp(preferences.volume) : .72;
  let lastAudibleVolume = volume > 0 ? volume : .72;
  if (supported) element.volume = volume;
  element.muted = preferences.muted === true || volume === 0;
  return {
    supported,
    snapshot: () => ({ volume, muted: element.muted }),
    set(value) {
      if (!supported || !Number.isFinite(value)) return;
      volume = clamp(value);
      if (volume > 0) lastAudibleVolume = volume;
      element.volume = volume;
      element.muted = volume === 0;
    },
    toggleMute() {
      if (element.muted) {
        if (volume === 0) { volume = lastAudibleVolume; if (supported) element.volume = volume; }
        element.muted = false;
      } else element.muted = true;
    },
  };
}
