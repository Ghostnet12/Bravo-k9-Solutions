import { Editable } from './SiteContent';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { isImageEditor } from '../../shared/site-images.js';
import { compareProofVideos } from '../../shared/proof-videos.js';
import './proof-videos.css';

const Editor = lazy(() => import('./ProofVideoEditor'));
export type ProofClip = { id: string; title: string; description: string; order: number; revision: number; src: string | null; poster?: string | null; facebookUrl?: string | null; fit?: 'contain' | 'cover' };

type CarouselSettings = { intervalSeconds: number; revision: number };
function CarouselTiming({ saved, onSaved }: { saved: CarouselSettings; onSaved: (value: CarouselSettings) => void }) {
  const [seconds, setSeconds] = useState(String(saved.intervalSeconds)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const valid = Number.isInteger(Number(seconds)) && Number(seconds) >= 2 && Number(seconds) <= 60;
  async function publish(event: React.FormEvent) {
    event.preventDefault(); if (busy || !valid) return;
    setBusy(true); setError('');
    try { const data = await api('/proof-videos/settings', { method: 'PUT', body: { expectedRevision: saved.revision, intervalSeconds: Number(seconds) } }); onSaved(data.carousel); }
    catch (cause: any) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <form className="proof-carousel-settings" onSubmit={publish}>
    <label htmlFor="proof-carousel-seconds">Time between videos (seconds)</label>
    <input id="proof-carousel-seconds" type="number" inputMode="numeric" min="2" max="60" step="1" required value={seconds} disabled={busy} onChange={event => setSeconds(event.target.value)}/>
    <small>Choose 2–60 seconds. Videos pause the carousel while playing.</small>
    {!valid && <p role="alert">Enter a whole number from 2 to 60.</p>}
    <button type="submit" disabled={busy || !valid || Number(seconds) === saved.intervalSeconds}>{busy ? 'Publishing…' : 'Publish carousel timing'}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

function VideoPlayer({ clip, onPlay }: { clip: ProofClip; onPlay: (video: HTMLVideoElement) => void }) {
  const video = useRef<HTMLVideoElement>(null), [started, setStarted] = useState(false), [error, setError] = useState(false);
  function play() {
    if (!video.current) return;
    setError(false); setStarted(true);
    if (video.current.error) video.current.load();
    video.current.play().catch(() => { setStarted(false); setError(true); });
  }
  return <><video ref={video} src={clip.src!} poster={clip.poster || undefined} controls playsInline preload="none" style={{ objectFit: clip.fit || 'contain' }} aria-label={clip.title} aria-describedby={`proof-description-${clip.id}`} onPlay={event => { setStarted(true); onPlay(event.currentTarget); }} onError={() => { setStarted(false); setError(true); }}/>
    {!started && <button type="button" className="proof-native-play" onClick={play} aria-label={`Play ${clip.title} video`}><span aria-hidden="true">▶</span></button>}
    {error && <p className="proof-play-error" role="status">Couldn’t play this video. Tap play to retry.</p>}
  </>;
}
export default function ProofVideoCarousel() {
  const { user } = useBravo(), canEdit = isImageEditor(user) && !user?.mustChangePassword;
  const [clips, setClips] = useState<ProofClip[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [editing, setEditing] = useState<ProofClip | null>(null), [editMode, setEditMode] = useState(false), [toolsOpen, setToolsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), mounted = useRef(true), inFlight = useRef(false);
  const rail = useRef<HTMLDivElement>(null), pointerHeld = useRef(false), keyboardFocus = useRef(false);
  const [interaction, setInteraction] = useState(0);
  const toolsDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (toolsOpen && canEdit) toolsDialog.current?.showModal(); }, [toolsOpen, canEdit]);
  const [paused, setPaused] = useState(false), [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
  const [carousel, setCarousel] = useState<CarouselSettings>({ intervalSeconds: 8, revision: 0 });
  const advance = useCallback((direction = 1) => {
    const node = rail.current;
    if (!node) return;
    const cards = [...node.querySelectorAll<HTMLElement>('article[data-proof-video]')];
    const max = node.scrollWidth - node.clientWidth;
    if (max < 2 || cards.length < 2) return;
    const positions = [...new Set(cards.map(card => Math.min(max, card.offsetLeft - cards[0].offsetLeft)))];
    const next = direction > 0 ? positions.find(x => x > node.scrollLeft + 8) : [...positions].reverse().find(x => x < node.scrollLeft - 8);
    node.scrollTo({ left: next ?? (direction > 0 ? 0 : max), behavior: next === undefined || reduced ? 'instant' : 'smooth' });
  }, [reduced]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches); changed(); media.addEventListener('change', changed);
    const observer = new IntersectionObserver(entries => setInView(entries[0].isIntersecting), { threshold: .2 });
    if (rail.current) observer.observe(rail.current);
    return () => { media.removeEventListener('change', changed); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (paused || reduced || !inView || editing || toolsOpen || editMode || clips.length < 2) return;
    const timer = setInterval(() => {
      if (document.hidden || pointerHeld.current || (keyboardFocus.current && root.current?.contains(document.activeElement)) || gesture.current || [...(root.current?.querySelectorAll('video') || [])].some(video => !video.paused && !video.ended)) return;
      advance();
    }, carousel.intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [paused, reduced, inView, editing, toolsOpen, editMode, interaction, clips.length, advance, carousel.intervalSeconds]);
  const gesture = useRef<{ x: number; y: number; pointer: number; timer: ReturnType<typeof setTimeout> } | null>(null), suppressUntil = useRef(0);
  const cancelHold = useCallback(() => { if (gesture.current) clearTimeout(gesture.current.timer); gesture.current = null; }, []);
  const load = useCallback(async (after: string | null = null) => {
    if (inFlight.current) return;
    inFlight.current = true; setLoading(true); setError('');
    try {
      const data = await api(`/proof-videos${after ? `?after=${encodeURIComponent(after)}` : ''}`);
      if (!mounted.current) return;
      setClips(old => [...new Map([...(after ? old : []), ...data.clips].map(clip => [clip.id, clip])).values()].sort(compareProofVideos));
      setCursor(data.nextCursor); if (!after && data.carousel) setCarousel(data.carousel); setLoaded(true);
    } catch (cause: any) { if (mounted.current) setError(cause.message); }
    finally { inFlight.current = false; if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; cancelHold(); }; }, [load, cancelHold]);
  useEffect(() => {
    const mode = (event: Event) => setEditMode(!!(event as CustomEvent).detail?.active);
    window.addEventListener('bravo-media-edit-mode', mode);
    const release = () => { pointerHeld.current = false; cancelHold(); setInteraction(value => value + 1); };
    window.addEventListener('scroll', cancelHold, true); window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => { window.removeEventListener('bravo-media-edit-mode', mode); window.removeEventListener('scroll', cancelHold, true); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release); };
  }, [cancelHold]);
  // The opening hold must suppress its release click, not a new action after
  // the modal has been dismissed or its changes have been published.
  function closeEditor() { suppressUntil.current = 0; setEditing(null); }
  function open(clip: ProofClip) { if (canEdit) { cancelHold(); root.current?.querySelectorAll('video').forEach(video => video.pause()); setEditing(clip); } }
  function beginHold(event: React.PointerEvent, clip: ProofClip | null) {
    cancelHold();
    if (!canEdit || event.button !== 0 || event.isPrimary === false || editing || (event.target as Element).closest('[data-proof-action]')) return;
    const video = (event.target as Element).closest('video');
    if (video && event.clientY > video.getBoundingClientRect().bottom - 48) return;
    gesture.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId, timer: setTimeout(() => { suppressUntil.current = Date.now() + 1000; if (clip) open(clip); else { cancelHold(); setToolsOpen(true); } }, 600) };
  }
  return <Editable as="div" contentKey="proof-section" ref={root} className="home-work-proof" aria-labelledby="work-proof-title" data-site-image-ignore="" onPointerDown={event => { if ((event.target as Element).closest("dialog")) return; keyboardFocus.current = false; pointerHeld.current = true; if (!(event.target as Element).closest("[data-proof-video],button,a,input")) beginHold(event, null); }} onPointerUp={() => { pointerHeld.current = false; cancelHold(); setInteraction(value => value + 1); }} onPointerCancel={() => { pointerHeld.current = false; cancelHold(); setInteraction(value => value + 1); }} onPointerLeave={() => { pointerHeld.current = false; cancelHold(); }} onPointerMove={event => { if (gesture.current && Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 12) cancelHold(); }} onWheel={() => setInteraction(value => value + 1)} onKeyDownCapture={() => { keyboardFocus.current = true; }}>
    <div className="home-work-proof-heading"><div><p className="eyebrow">WATCH THE WORK</p><Editable as="h3" contentKey="proof-title" canEditText id="work-proof-title">Training you can actually see.</Editable></div><Editable as="p" contentKey="proof-intro" canEditText>Watch Bravo working with dogs in real situations. Each video includes its own context.</Editable></div>
    {(!loaded && loading) && <p role="status">Loading videos…</p>}
    {error && <p role="alert">{error} <button type="button" disabled={loading} onClick={() => load(loaded ? cursor : null)}>Retry loading videos</button></p>}
    {loaded && !clips.length && <p>No training videos published yet.</p>}
    <div ref={rail} className="home-work-proof-grid proof-video-carousel" role="region" aria-roledescription="carousel" aria-label="Training video carousel" tabIndex={0} onScroll={() => {
      cancelHold();
      // Restart the full interval after every movement, including touch momentum
      // and the browser's snap, so cycling continues from the settled card.
      setInteraction(value => value + 1);
      const node = rail.current;
      if (!node) return;
      const bounds = node.getBoundingClientRect();
      node.querySelectorAll('video').forEach(video => {
        const box = video.getBoundingClientRect();
        if (box.right <= bounds.left + 8 || box.left >= bounds.right - 8) video.pause();
      });
    }}>
      {clips.map(clip => <article key={clip.id} data-proof-video={clip.id} data-facebook-reel={clip.facebookUrl ? clip.id : undefined} data-proof-editable={canEdit || undefined} tabIndex={canEdit ? 0 : undefined} aria-keyshortcuts={canEdit ? 'F2' : undefined}
        onPointerDownCapture={event => beginHold(event, clip)} onPointerUpCapture={cancelHold} onPointerCancelCapture={cancelHold}
        onPointerMoveCapture={event => { const hold = gesture.current; if (hold && (event.pointerId !== hold.pointer || Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 12)) cancelHold(); }}
        onContextMenu={event => { if (canEdit && !(event.target as Element).closest('[data-proof-action]')) { event.preventDefault(); suppressUntil.current = Date.now() + 1000; open(clip); } }}
        onClickCapture={event => { if (!canEdit || (event.target as Element).closest('[data-proof-action]')) return; if (Date.now() < suppressUntil.current || editMode) { event.preventDefault(); event.stopPropagation(); if (editMode) open(clip); } }}
        onKeyDown={event => { if (canEdit && event.key === 'F2') { event.preventDefault(); open(clip); } }}>
        <div className="home-work-proof-media">{clip.src ? <VideoPlayer key={clip.src} clip={clip} onPlay={playing => root.current?.querySelectorAll('video').forEach(video => { if (video !== playing) video.pause(); })}/> : <a className="home-work-proof-play" href={clip.facebookUrl!} aria-label={`Watch ${clip.title} on Facebook`}>{clip.poster ? <img src={clip.poster} width="475" height="844" loading="lazy" alt={clip.title}/> : <span className="proof-reel-placeholder" aria-hidden="true"><span>BRAVO K9</span><strong>Facebook Reel</strong></span>}<span className="home-work-proof-play-icon" aria-hidden="true">▶</span><span className="home-work-proof-destination" aria-hidden="true">Watch on Facebook →</span></a>}</div>
        <div className="home-work-proof-copy"><h4>{clip.title}</h4><p id={`proof-description-${clip.id}`}>{clip.description}</p>{clip.facebookUrl && <a href={clip.facebookUrl} aria-label={`View original ${clip.title} video on Facebook`}>View original on Facebook <span aria-hidden="true">→</span></a>}</div>
      </article>)}
    </div>
    {(clips.length > 1 || cursor) && <div className="proof-carousel-navigation"><p>{reduced ? 'Swipe or use the arrows to see more videos.' : 'Swipe to explore. Pause to take a closer look.'}</p><div className="proof-carousel-buttons"><button type="button" aria-label="Previous video" onClick={() => advance(-1)}>←</button>{!reduced && <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Resume videos' : 'Pause videos'}</button>}<button type="button" aria-label="Next video" onClick={() => advance(1)}>→</button>{cursor && <button type="button" disabled={loading} onClick={() => load(cursor)}>{loading ? 'Loading…' : 'Load more videos'}</button>}</div></div>}
    <p className="proof-video-status" role="status" aria-live="polite">{toolsOpen ? '' : status}</p>
    {toolsOpen && canEdit && <dialog ref={toolsDialog} className="proof-section-editor banner-editor" data-site-image-ignore="" aria-label="Edit video section" onCancel={() => setToolsOpen(false)}><div className="banner-editor-heading"><h2>Video carousel</h2><button type="button" onClick={() => setToolsOpen(false)} aria-label="Close video section editor">×</button></div><p>Add a video, adjust the speed, or choose a video below to edit.</p><div className="carousel-editor-actions"><button type="button" disabled={!loaded} onClick={() => { setToolsOpen(false); open({ id: crypto.randomUUID(), title: '', description: '', order: Date.now(), revision: 0, src: null }); }}>Add video</button><button type="button" onClick={() => { setToolsOpen(false); window.dispatchEvent(new CustomEvent('bravo-content-edit', { detail: { key: 'proof-section' } })); }}>Text &amp; design</button></div><h3>Playback speed</h3><CarouselTiming key={carousel.revision} saved={carousel} onSaved={value => { setCarousel(value); setStatus(`Carousel timing published: ${value.intervalSeconds} seconds.`); }}/><h3>Your videos</h3><div className="carousel-editor-list">{clips.map((clip, index) => <p key={clip.id}><button type="button" aria-label={`Edit video: ${clip.title}`} onClick={() => { setToolsOpen(false); open(clip); }}><span>{index + 1}. {clip.title}</span><small>Edit video, cover &amp; description →</small></button></p>)}</div><p role="status">{status}</p></dialog>}
    {editing && canEdit && <Suspense fallback={<p role="status">Opening video editor…</p>}><Editor key={editing.id} clip={editing} onClose={closeEditor} onSaved={clip => { setClips(old => [...old.filter(item => item.id !== clip.id), clip].sort(compareProofVideos)); setStatus('Video and description published.'); closeEditor(); }} onRemoved={id => { setClips(old => old.filter(clip => clip.id !== id)); setStatus('Video removed from the carousel.'); closeEditor(); }}/></Suspense>}
  </Editable>;
}
