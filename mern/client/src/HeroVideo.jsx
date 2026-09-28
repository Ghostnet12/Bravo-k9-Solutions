import { useEffect, useRef, useState } from 'react';

export default function HeroVideo({ clip, active, paused, onEnded }) {
  const video = useRef(null), gestureSeen = useRef(false);
  const [blocked, setBlocked] = useState(false), [failed, setFailed] = useState(false), [muted, setMuted] = useState(true);
  useEffect(() => {
    setFailed(false); setBlocked(false);
    const element = video.current; if (!element) return;
    let disposed = false;
    const applyPreferredSound = () => {
      element.muted = !(clip?.sound === true && gestureSeen.current);
      if (!disposed) setMuted(element.muted);
    };
    const update = async () => {
      if (!active || paused || document.hidden) { element.pause(); return; }
      applyPreferredSound();
      try { await element.play(); if (!disposed) setBlocked(false); }
      catch {
        if (!element.muted) {
          element.muted = true; if (!disposed) setMuted(true);
          try { await element.play(); if (!disposed) setBlocked(false); }
          catch { if (!disposed) setBlocked(true); }
        } else if (!disposed) setBlocked(true);
      }
    };
    const interacted = () => {
      gestureSeen.current = true;
      if (active && !paused && clip?.sound === true) {
        element.muted = false; setMuted(false);
        element.play().catch(() => { element.muted = true; if (!disposed) setMuted(true); });
      }
    };
    if (!active) element.currentTime = 0;
    update(); document.addEventListener('visibilitychange', update);
    document.addEventListener('pointerdown', interacted); document.addEventListener('keydown', interacted);
    return () => {
      disposed = true; element.pause();
      document.removeEventListener('visibilitychange', update);
      document.removeEventListener('pointerdown', interacted); document.removeEventListener('keydown', interacted);
    };
  }, [active, paused, clip?.src, clip?.sound]);
  if (!clip) return <p className="hero-video-message">Video unavailable.</p>;
  if (clip.facebookUrl) return <a className="hero-reel" href={clip.facebookUrl} aria-label={`Watch ${clip.title} on Facebook`}><span>▶</span><strong>{clip.title}</strong><span>Watch on Facebook</span></a>;
  function toggleSound() {
    const element = video.current; if (!element) return;
    gestureSeen.current = true;
    element.muted = !element.muted; setMuted(element.muted);
    if (!element.muted && active && !paused) element.play().catch(() => { element.muted = true; setMuted(true); });
  }
  return <div className="hero-video" data-site-image-ignore="">
    <video ref={video} src={clip.src} poster={clip.poster || undefined} muted={muted} playsInline preload={active ? 'metadata' : 'none'} aria-label={clip.title} style={{objectFit:clip.fit || 'contain'}} onEnded={onEnded} onVolumeChange={event=>setMuted(event.currentTarget.muted)} onError={()=>setFailed(true)}/>
    <div className="hero-video-swipe-surface" aria-hidden="true"/>
    {!failed && <button type="button" className="hero-video-sound" aria-label={muted ? `Turn sound on for ${clip.title}` : `Mute ${clip.title}`} onClick={toggleSound}>{muted ? 'Sound' : 'Mute'}</button>}
    {blocked && active && !failed && <button type="button" className="hero-video-play" onClick={()=>video.current?.play().then(()=>setBlocked(false)).catch(()=>setFailed(true))}>Play video</button>}
    {failed && <p className="hero-video-message">This video couldn’t play. Please try another clip.</p>}
    <span className="sr-only">{clip.description}</span>
  </div>;
}
