import { useEffect, useRef, useState } from 'react';

export default function CinematicFilm() {
  const root = useRef(null), video = useRef(null);
  const [paused, setPaused] = useState(false), [playing, setPlaying] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false, disposed = false;
    const update = () => {
      const reduce = preference.matches || document.documentElement.classList.contains('access-reduced-motion');
      if (paused || reduce || !visible || document.hidden) { element.pause(); return; }
      element.muted = true;
      element.play().catch(() => { if (!disposed) setPlaying(false); });
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(root.current);
    const accessibility = new MutationObserver(update);
    accessibility.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    preference.addEventListener('change', update); document.addEventListener('visibilitychange', update);
    return () => { disposed = true; element.pause(); observer.disconnect(); accessibility.disconnect(); preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); };
  }, [paused]);
  return <div ref={root} className="cinema-film">
    <video ref={video} className={playing ? 'is-playing' : ''} data-site-media-key="video-asset-bravo-real-world.mp4" poster="/images/bravo-film-poster.webp" muted loop playsInline preload="metadata" aria-label="Bravo dog practicing recall outdoors in Aberdeen" onPlaying={() => { setPlaying(true); setFailed(false); }} onPause={() => setPlaying(false)} onError={() => { setFailed(true); setPlaying(false); }}><source src="/videos/bravo-real-world.mp4" type="video/mp4"/><source src="/videos/bravo-real-world.webm" type="video/webm"/></video>
    {!failed && <button className="cinema-film-control" type="button" aria-label={playing ? 'Pause training film' : 'Play training film'} onClick={() => { if (playing) setPaused(true); else { setPaused(false); video.current?.play().catch(() => setPlaying(false)); } }}><span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span><span>{playing ? 'Pause film' : 'Play film'}</span></button>}
  </div>;
}
