import { useEffect, useRef, useState } from 'react';

export default function HeroVideo({ clip, active, paused, onEnded }) {
  const video = useRef(null), [blocked, setBlocked] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false); setBlocked(false);
    const element = video.current; if (!element) return;
    const update = () => {
      if (!active || paused || document.hidden) { element.pause(); return; }
      element.muted = true;
      element.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    };
    if (!active) element.currentTime = 0;
    update(); document.addEventListener('visibilitychange', update);
    return () => { element.pause(); document.removeEventListener('visibilitychange', update); };
  }, [active, paused, clip?.src]);
  if (!clip) return <p className="hero-video-message">Video unavailable.</p>;
  if (clip.facebookUrl) return <a className="hero-reel" href={clip.facebookUrl} aria-label={`Watch ${clip.title} on Facebook`}><span>▶</span><strong>{clip.title}</strong><span>Watch on Facebook</span></a>;
  return <div className="hero-video" data-site-image-ignore="">
    <video ref={video} src={clip.src} poster={clip.poster || undefined} muted playsInline preload={active ? 'metadata' : 'none'} aria-label={clip.title} style={{objectFit:clip.fit || 'contain'}} onEnded={onEnded} onError={()=>setFailed(true)}/>
    <div className="hero-video-swipe-surface" aria-hidden="true"/>
    {blocked && active && !failed && <button type="button" className="hero-video-play" onClick={()=>video.current?.play().then(()=>setBlocked(false)).catch(()=>setFailed(true))}>Play video</button>}
    {failed && <p className="hero-video-message">This video couldn’t play. Please try another clip.</p>}
    <span className="sr-only">{clip.description}</span>
  </div>;
}
