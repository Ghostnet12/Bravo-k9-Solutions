import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useBravo } from './context';
import { isImageEditor } from '../../shared/site-images.js';
import { DEFAULT_HERO_FILM, heroFilmPlaylistSnapshot, readHeroFilms } from '../../shared/hero-film.js';

const VideoEditor = lazy(() => import('./ProofVideoEditor'));
let publishedFilms = readHeroFilms(typeof document === 'undefined' ? null : document);

async function loadHeroFilms() {
  const all = []; let after = null;
  do {
    const data = await api(`/hero-film${after ? `?after=${encodeURIComponent(after)}` : ''}`);
    all.push(...(Array.isArray(data.clips) ? data.clips : [])); after = data.nextCursor;
  } while (after && all.length < 100);
  return all;
}

export default function CinematicFilm({ children }) {
  const root = useRef(null), video = useRef(null), managerDialog = useRef(null);
  const { user } = useBravo(), canEdit = isImageEditor(user) && !user?.mustChangePassword;
  const [clips, setClips] = useState(() => publishedFilms), [index, setIndex] = useState(0);
  const clip = clips[index] || clips[0] || DEFAULT_HERO_FILM;
  const [editing, setEditing] = useState(null), [managerOpen, setManagerOpen] = useState(false), [managerBusy, setManagerBusy] = useState(false);
  const [opening, setOpening] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [playing, setPlaying] = useState(false);
  const hold = useRef(null), suppressUntil = useRef(0), alive = useRef(false), requesting = useRef(false);
  const cancelHold = () => { clearTimeout(hold.current?.timer); hold.current = null; };
  const rememberFilms = value => {
    const next = heroFilmPlaylistSnapshot(value);
    publishedFilms = next; setClips(next);
    setIndex(current => Math.min(current, Math.max(0, next.length - 1)));
    return next;
  };

  useEffect(() => {
    alive.current = true;
    loadHeroFilms().then(data => { if (alive.current) rememberFilms(data); }).catch(() => {});
    window.addEventListener('scroll', cancelHold, true); window.addEventListener('blur', cancelHold);
    return () => { alive.current = false; cancelHold(); window.removeEventListener('scroll', cancelHold, true); window.removeEventListener('blur', cancelHold); };
  }, []);
  useEffect(() => {
    if (managerOpen && canEdit && !managerDialog.current?.open) managerDialog.current?.showModal();
    if ((!managerOpen || !canEdit) && managerDialog.current?.open) managerDialog.current.close();
  }, [managerOpen, canEdit]);
  useEffect(() => { if (!canEdit) { cancelHold(); setEditing(null); setManagerOpen(false); } }, [canEdit]);

  const allowed = useRef(canEdit); allowed.current = canEdit;
  async function refreshFilms() { return rememberFilms(await loadHeroFilms()); }
  async function openManager() {
    if (!allowed.current || requesting.current) return;
    cancelHold(); requesting.current = true; setOpening(true); setError(''); setMessage('');
    try { await refreshFilms(); if (alive.current && allowed.current) setManagerOpen(true); }
    catch (cause) { if (alive.current) setError(cause.message); }
    finally { requesting.current = false; if (alive.current) setOpening(false); }
  }
  function editFilm(target) { if (allowed.current) { setManagerOpen(false); setEditing(target); } }
  function addFilm() { editFilm({ id: crypto.randomUUID(), title: '', description: '', revision: 0, order: Date.now(), fit: 'cover', sound: false, src: null, poster: null }); }
  async function reorderFilm(id, position) {
    if (!allowed.current || managerBusy) return;
    const ids = clips.map(item => item.id), from = ids.indexOf(id), to = Math.max(0, Math.min(ids.length - 1, Number(position) - 1));
    if (from < 0 || from === to) return;
    const [moved] = ids.splice(from, 1); ids.splice(to, 0, moved);
    setManagerBusy(true); setError(''); setMessage('');
    try {
      const data = await api('/hero-film/order', { method: 'PUT', body: { ids } });
      rememberFilms(data.clips); setIndex(0); setMessage(`Moved video to position ${to + 1}.`);
    } catch (cause) { setError(cause.message); }
    finally { setManagerBusy(false); }
  }
  async function afterSaved(saved) {
    setEditing(null); setMessage(`“${saved.title}” published.`); setError('');
    try { await refreshFilms(); setManagerOpen(true); } catch (cause) { setError(cause.message); }
  }
  async function afterRemoved() {
    setEditing(null); setMessage('Hero video removed.'); setError('');
    try { await refreshFilms(); setIndex(0); setManagerOpen(true); } catch (cause) { setError(cause.message); }
  }
  async function removeFilm(item) {
    if (!allowed.current || managerBusy || clips.length < 2 || !window.confirm(`Remove “${item.title}” from the hero playlist?`)) return;
    setManagerBusy(true); setError('');
    try {
      await api(`/hero-film/${item.id}`, { method: 'DELETE', body: { expectedRevision: item.revision } });
      await afterRemoved();
    } catch (cause) { setError(cause.message); }
    finally { setManagerBusy(false); }
  }

  useEffect(() => {
    const element = video.current; if (!element) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const bounds = root.current.getBoundingClientRect();
    let visible = bounds.bottom > 0 && bounds.top < window.innerHeight, disposed = false;
    element.defaultMuted = true; element.muted = true;
    const update = () => {
      const reduce = preference.matches || document.documentElement.classList.contains('access-reduced-motion');
      const autoplay = !editing && !managerOpen && !reduce && visible && !document.hidden;
      if (!autoplay) { element.pause(); return; }
      element.muted = true;
      element.play().catch(() => { if (!disposed) setPlaying(false); });
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(root.current); update();
    const accessibility = new MutationObserver(update);
    accessibility.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    preference.addEventListener('change', update); document.addEventListener('visibilitychange', update);
    element.addEventListener('canplay', update);
    document.addEventListener('pointerdown', update); document.addEventListener('keydown', update);
    return () => {
      disposed = true; element.pause(); observer.disconnect(); accessibility.disconnect();
      preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', update);
      element.removeEventListener('canplay', update);
      document.removeEventListener('pointerdown', update); document.removeEventListener('keydown', update);
    };
  }, [editing, managerOpen, clip.src]);

  function nextFilm() {
    if (clips.length < 2) return;
    setIndex(current => (current + 1) % clips.length); setPlaying(false);
  }

  const isFilmTarget = target => !target.closest('dialog,button,a,input,textarea,select,[data-site-content-text=true]');
  return <section ref={root} className="home-hero cinema-hero" aria-labelledby="home-title"
    onPointerDown={event => {
      cancelHold();
      if (!canEdit || event.button !== 0 || event.isPrimary === false || !isFilmTarget(event.target)) return;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers have no active capture. */ }
      hold.current = { x: event.clientX, y: event.clientY, timer: setTimeout(() => { suppressUntil.current = Date.now() + 1200; openManager(); }, 650) };
    }}
    onPointerMove={event => { if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 12) cancelHold(); }}
    onPointerUp={cancelHold} onPointerCancel={cancelHold}
    onPointerLeave={event => {
      const box = event.currentTarget.getBoundingClientRect();
      const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
      if (outside && !event.currentTarget.hasPointerCapture(event.pointerId)) cancelHold();
    }}
    onClickCapture={event => { if (!event.target.closest('dialog') && Date.now() < suppressUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
    onContextMenu={event => { if (canEdit && isFilmTarget(event.target)) event.preventDefault(); }}>
    <div className="cinema-hero-media" data-site-image-ignore=""><div className="cinema-film">
      <video data-hero-film="" key={`${clip.id}:${clip.revision}:${clip.src}`} ref={video} className={playing ? 'is-playing' : ''} poster={clip.poster || undefined} autoPlay muted loop={clips.length === 1} playsInline preload="auto" style={{ objectFit: clip.fit }} aria-label={clip.description || clip.title}
        onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={nextFilm} onError={() => setPlaying(false)}>
        <source src={clip.src} type={clip.revision === 0 && clip.id === DEFAULT_HERO_FILM.id ? 'video/mp4' : undefined}/>
        {clip.src === DEFAULT_HERO_FILM.src && <source src="/videos/bravo-real-world.webm" type="video/webm"/>}
      </video>
      <span className="sr-only" aria-live="polite">Hero video {index + 1} of {clips.length}: {clip.title}</span>
      <div className="cinema-hero-shade" aria-hidden="true"/>
    </div></div>
    {children}
    {canEdit && <div className="cinema-film-edit" data-site-image-ignore=""><button type="button" disabled={opening} onClick={openManager}>{opening ? 'Opening playlist…' : 'Manage hero videos'}</button><span role="status">{message}</span>{error && <span role="alert">{error}</span>}</div>}
    {managerOpen && canEdit && <dialog ref={managerDialog} className="banner-editor hero-film-manager" data-site-image-ignore="" aria-label="Manage hero videos" onCancel={event => { event.preventDefault(); setManagerOpen(false); }}>
      <div className="banner-editor-heading"><div><p>BRAVO · HERO</p><h2>Hero video playlist</h2></div><button type="button" aria-label="Close hero video playlist" onClick={() => setManagerOpen(false)}>×</button></div>
      <p>Videos play automatically in this order. Each clip runs to the end before the next video begins. Hero videos stay muted while the site soundtrack plays.</p>
      <div className="carousel-editor-actions"><button type="button" disabled={managerBusy} onClick={addFilm}>Add hero video</button></div>
      {error && <p role="alert">{error}</p>}<p role="status">{message}</p>
      <div className="hero-film-manager-list">
        {clips.map((item, itemIndex) => <div className="hero-film-manager-row" key={item.id}>
          <span className="hero-video-badge">Video {itemIndex + 1}</span>
          <button type="button" className="hero-film-manager-edit" disabled={managerBusy} onClick={() => editFilm(item)}><strong>{item.title || `Video ${itemIndex + 1}`}</strong><small>{item.fit === 'contain' ? 'Show whole video' : 'Fill frame'}</small></button>
          <label>Position<select aria-label={`Position for ${item.title || `Video ${itemIndex + 1}`}`} value={itemIndex + 1} disabled={managerBusy || clips.length < 2} onChange={event => reorderFilm(item.id, event.target.value)}>{clips.map((_, optionIndex) => <option key={optionIndex} value={optionIndex + 1}>{optionIndex + 1}</option>)}</select></label>
          {clips.length > 1 && <button type="button" className="hero-film-remove" disabled={managerBusy} aria-label={`Remove ${item.title || `Video ${itemIndex + 1}`}`} onClick={() => removeFilm(item)}>Remove video</button>}
        </div>)}
      </div>
    </dialog>}
    {editing && canEdit && <Suspense fallback={<p role="status" className="cinema-film-edit">Opening video editor…</p>}><VideoEditor apiBase="/hero-film" clip={editing} allowRemove={clips.length > 1} onClose={() => { setEditing(null); setManagerOpen(true); }} onSaved={afterSaved} onRemoved={afterRemoved}/></Suspense>}
  </section>;
}
