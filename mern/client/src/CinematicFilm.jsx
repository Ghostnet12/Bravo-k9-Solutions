import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useBravo } from './context';
import { isImageEditor } from '../../shared/site-images.js';
import { DEFAULT_HERO_FILM, heroFilmSnapshot, readHeroFilm } from '../../shared/hero-film.js';

const VideoEditor = lazy(() => import('./ProofVideoEditor'));
let publishedFilm = readHeroFilm(typeof document === 'undefined' ? null : document);

export default function CinematicFilm({ children }) {
  const root = useRef(null), video = useRef(null);
  const { user } = useBravo(), canEdit = isImageEditor(user);
  const [clip, setClip] = useState(() => publishedFilm), [editing, setEditing] = useState(null);
  const rememberFilm = value => {
    const next = heroFilmSnapshot(value);
    if (next.revision < publishedFilm.revision) return;
    publishedFilm = next; setClip(next);
  };
  const [opening, setOpening] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const hold = useRef(null), suppressUntil = useRef(0), alive = useRef(false), requesting = useRef(false);
  const cancelHold = () => { clearTimeout(hold.current?.timer); hold.current = null; };
  useEffect(() => {
    alive.current = true;
    api('/hero-film').then(data => { if (alive.current && data.clips?.[0]) rememberFilm(data.clips[0]); }).catch(() => {});
    window.addEventListener('scroll', cancelHold, true); window.addEventListener('blur', cancelHold);
    return () => { alive.current = false; cancelHold(); window.removeEventListener('scroll', cancelHold, true); window.removeEventListener('blur', cancelHold); };
  }, []);
  useEffect(() => { if (!canEdit) { cancelHold(); setEditing(null); } }, [canEdit]);
  const allowed = useRef(canEdit); allowed.current = canEdit;
  async function editFilm() {
    if (!allowed.current || requesting.current) return;
    cancelHold(); requesting.current = true; setOpening(true); setError(''); setMessage('');
    try {
      // Read the latest revision before editing; never overwrite another admin.
      const data = await api('/hero-film');
      if (alive.current && allowed.current) setEditing(data.clips?.[0] || DEFAULT_HERO_FILM);
    } catch (cause) { if (alive.current) setError(cause.message); }
    finally { requesting.current = false; if (alive.current) setOpening(false); }
  }
  const isFilmTarget = target => !target.closest('dialog,button,a,input,textarea,select,[data-site-content-key]');
  const [paused, setPaused] = useState(false), [playing, setPlaying] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false, disposed = false;
    // Safari requires a muted inline element before the first play attempt.
    element.defaultMuted = true;
    element.muted = true;
    const update = () => {
      const reduce = preference.matches || document.documentElement.classList.contains('access-reduced-motion');
      element.autoplay = !paused && !editing && !reduce && visible && !document.hidden;
      if (!element.autoplay) { element.pause(); return; }
      element.muted = true;
      element.play().catch(() => { if (!disposed) setPlaying(false); });
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(root.current);
    const accessibility = new MutationObserver(update);
    accessibility.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    preference.addEventListener('change', update); document.addEventListener('visibilitychange', update);
    // Retry delayed media and browser-blocked autoplay without undoing Pause.
    element.addEventListener('canplay', update);
    document.addEventListener('pointerdown', update);
    document.addEventListener('keydown', update);
    return () => {
      disposed = true; element.pause(); observer.disconnect(); accessibility.disconnect();
      preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', update);
      element.removeEventListener('canplay', update);
      document.removeEventListener('pointerdown', update); document.removeEventListener('keydown', update);
    };
  }, [paused, editing, clip.src]);
  return <section ref={root} className="home-hero cinema-hero" aria-labelledby="home-title"
    onPointerDown={event => {
      cancelHold();
      if (!canEdit || event.button !== 0 || event.isPrimary === false || !isFilmTarget(event.target)) return;
      hold.current = { x: event.clientX, y: event.clientY, timer: setTimeout(() => { suppressUntil.current = Date.now() + 1200; editFilm(); }, 650) };
    }}
    onPointerMove={event => { if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 12) cancelHold(); }}
    onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
    onClickCapture={event => { if (!event.target.closest('dialog') && Date.now() < suppressUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
    onContextMenu={event => { if (canEdit && isFilmTarget(event.target)) event.preventDefault(); }}>
    <div className="cinema-hero-media" data-site-image-ignore=""><div className="cinema-film">
    <video data-hero-film="" key={clip.src} ref={video} className={playing ? 'is-playing' : ''} poster={clip.poster || undefined} autoPlay muted loop playsInline preload="auto" style={{ objectFit: clip.fit }} aria-label={clip.description || clip.title} onPlaying={() => { setPlaying(true); setFailed(false); }} onPause={() => setPlaying(false)} onError={() => { setFailed(true); setPlaying(false); }}><source src={clip.src} type={clip.revision === 0 ? 'video/mp4' : undefined}/>{clip.src === DEFAULT_HERO_FILM.src && <source src="/videos/bravo-real-world.webm" type="video/webm"/>}</video>
    <div className="cinema-hero-shade" aria-hidden="true"/>
    {!failed && <button className="cinema-film-control" type="button" aria-label={playing ? 'Pause training film' : 'Play training film'} onClick={() => { if (playing) setPaused(true); else { setPaused(false); video.current?.play().catch(() => setPlaying(false)); } }}><span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span><span>{playing ? 'Pause film' : 'Play film'}</span></button>}
    </div></div>
    {children}
    {canEdit && <div className="cinema-film-edit" data-site-image-ignore=""><button type="button" disabled={opening} onClick={editFilm}>{opening ? 'Opening editor…' : 'Edit hero video'}</button><span role="status">{message}</span>{error && <span role="alert">{error}</span>}</div>}
    {editing && canEdit && <Suspense fallback={<p role="status" className="cinema-film-edit">Opening video editor…</p>}><VideoEditor apiBase="/hero-film" clip={editing} onClose={() => setEditing(null)} onSaved={saved => { rememberFilm(saved); setEditing(null); setFailed(false); setPlaying(false); setMessage('Hero video published.'); }}/></Suspense>}
  </section>;
}
