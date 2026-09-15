import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { isImageEditor } from '../../shared/site-images.js';
import { compareProofVideos } from '../../shared/proof-videos.js';
import './proof-videos.css';

const Editor = lazy(() => import('./ProofVideoEditor'));
export type ProofClip = { id: string; title: string; description: string; order: number; revision: number; src: string | null; poster?: string | null; facebookUrl?: string | null; fit?: 'contain' | 'cover' };

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
  const [editing, setEditing] = useState<ProofClip | null>(null), [editMode, setEditMode] = useState(false);
  const root = useRef<HTMLDivElement>(null), mounted = useRef(true), inFlight = useRef(false);
  const gesture = useRef<{ x: number; y: number; pointer: number; timer: ReturnType<typeof setTimeout> } | null>(null), suppressUntil = useRef(0);
  const cancelHold = useCallback(() => { if (gesture.current) clearTimeout(gesture.current.timer); gesture.current = null; }, []);
  const load = useCallback(async (after: string | null = null) => {
    if (inFlight.current) return;
    inFlight.current = true; setLoading(true); setError('');
    try {
      const data = await api(`/proof-videos${after ? `?after=${encodeURIComponent(after)}` : ''}`);
      if (!mounted.current) return;
      setClips(old => [...new Map([...(after ? old : []), ...data.clips].map(clip => [clip.id, clip])).values()].sort(compareProofVideos));
      setCursor(data.nextCursor); setLoaded(true);
    } catch (cause: any) { if (mounted.current) setError(cause.message); }
    finally { inFlight.current = false; if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; cancelHold(); }; }, [load, cancelHold]);
  useEffect(() => {
    const mode = (event: Event) => setEditMode(!!(event as CustomEvent).detail?.active);
    window.addEventListener('bravo-media-edit-mode', mode);
    window.addEventListener('scroll', cancelHold, true); window.addEventListener('blur', cancelHold);
    return () => { window.removeEventListener('bravo-media-edit-mode', mode); window.removeEventListener('scroll', cancelHold, true); window.removeEventListener('blur', cancelHold); };
  }, [cancelHold]);
  function open(clip: ProofClip) { if (canEdit) { cancelHold(); root.current?.querySelectorAll('video').forEach(video => video.pause()); setEditing(clip); } }
  function beginHold(event: React.PointerEvent, clip: ProofClip) {
    cancelHold();
    if (!canEdit || event.button !== 0 || event.isPrimary === false || editing || (event.target as Element).closest('[data-proof-action]')) return;
    const video = (event.target as Element).closest('video');
    if (video && event.clientY > video.getBoundingClientRect().bottom - 48) return;
    gesture.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId, timer: setTimeout(() => { suppressUntil.current = Date.now() + 1000; open(clip); }, 600) };
  }
  return <div ref={root} className="home-work-proof" aria-labelledby="work-proof-title" data-site-image-ignore="">
    <div className="home-work-proof-heading"><div><p className="eyebrow">WATCH THE WORK</p><h3 id="work-proof-title">Training you can actually see.</h3></div><p>Real Bravo training sessions and progress. Play a video here, or follow a card marked “Watch on Facebook.”</p></div>
    {canEdit && <div className="proof-video-tools"><button type="button" className="button" disabled={!loaded} onClick={() => open({ id: crypto.randomUUID(), title: '', description: '', order: Date.now(), revision: 0, src: null })}>Add video <span aria-hidden="true">＋</span></button><p>Press and hold a card to change its video or description. You can also use Edit video or focus a card and press F2.</p></div>}
    {(!loaded && loading) && <p role="status">Loading videos…</p>}
    {error && <p role="alert">{error} <button type="button" disabled={loading} onClick={() => load(loaded ? cursor : null)}>Retry loading videos</button></p>}
    {loaded && !clips.length && <p>No training videos published yet.</p>}
    <div className="home-work-proof-grid proof-video-carousel" role="region" aria-label="Training video carousel" tabIndex={0} onScroll={cancelHold}>
      {clips.map(clip => <article key={clip.id} data-proof-video={clip.id} data-facebook-reel={clip.facebookUrl ? clip.id : undefined} data-proof-editable={canEdit || undefined} tabIndex={canEdit ? 0 : undefined} aria-keyshortcuts={canEdit ? 'F2' : undefined}
        onPointerDownCapture={event => beginHold(event, clip)} onPointerUpCapture={cancelHold} onPointerCancelCapture={cancelHold}
        onPointerMoveCapture={event => { const hold = gesture.current; if (hold && (event.pointerId !== hold.pointer || Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 12)) cancelHold(); }}
        onContextMenu={event => { if (canEdit && !(event.target as Element).closest('[data-proof-action]')) { event.preventDefault(); suppressUntil.current = Date.now() + 1000; open(clip); } }}
        onClickCapture={event => { if (!canEdit || (event.target as Element).closest('[data-proof-action]')) return; if (Date.now() < suppressUntil.current || editMode) { event.preventDefault(); event.stopPropagation(); if (editMode) open(clip); } }}
        onKeyDown={event => { if (canEdit && event.key === 'F2') { event.preventDefault(); open(clip); } }}>
        <div className="home-work-proof-media">{clip.src ? <VideoPlayer key={clip.src} clip={clip} onPlay={playing => root.current?.querySelectorAll('video').forEach(video => { if (video !== playing) video.pause(); })}/> : <a className="home-work-proof-play" href={clip.facebookUrl!} aria-label={`Watch ${clip.title} on Facebook`}>{clip.poster ? <img src={clip.poster} width="475" height="844" loading="lazy" alt={clip.title}/> : <span className="proof-reel-placeholder" aria-hidden="true"><span>BRAVO K9</span><strong>Facebook Reel</strong></span>}<span className="home-work-proof-play-icon" aria-hidden="true">▶</span><span className="home-work-proof-destination" aria-hidden="true">Watch on Facebook →</span></a>}</div>
        <div className="home-work-proof-copy"><h4>{clip.title}</h4><p id={`proof-description-${clip.id}`}>{clip.description}</p>{clip.facebookUrl && <a href={clip.facebookUrl} aria-label={`View original ${clip.title} video on Facebook`}>View original on Facebook <span aria-hidden="true">→</span></a>}{canEdit && <button type="button" className="proof-edit-button" data-proof-action="" onClick={() => open(clip)} aria-label={`Edit video: ${clip.title}`}>Edit video</button>}</div>
      </article>)}
    </div>
    {(clips.length > 1 || cursor) && <div className="proof-carousel-navigation"><p>Swipe or scroll to see more videos.</p>{cursor && <button type="button" disabled={loading} onClick={() => load(cursor)}>{loading ? 'Loading…' : 'Load more videos'}</button>}</div>}
    <p className="proof-video-status" role="status" aria-live="polite">{status}</p>
    {editing && canEdit && <Suspense fallback={<p role="status">Opening video editor…</p>}><Editor key={editing.id} clip={editing} onClose={() => setEditing(null)} onSaved={clip => { setClips(old => [...old.filter(item => item.id !== clip.id), clip].sort(compareProofVideos)); setStatus('Video and description published.'); setEditing(null); }} onRemoved={id => { setClips(old => old.filter(clip => clip.id !== id)); setStatus('Video removed from the carousel.'); setEditing(null); }}/></Suspense>}
  </div>;
}
