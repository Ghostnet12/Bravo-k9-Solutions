import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { DEFAULT_HERO_CAROUSEL, HERO_PHOTO_DEFAULTS, heroVideoId } from '../../shared/hero-carousel.js';
import { HOME_HERO_KEY, HOME_HERO_SOURCE, HOME_HERO_ALT } from '../../shared/home-hero.js';
import { isImageEditor, framingStyle } from '../../shared/site-images.js';
import { getSiteImages, setSiteImages } from './site-image-state.js';
import { optimizeSitePhoto } from './site-image-editor.js';
import HeroVideo from './HeroVideo';
import './hero-carousel.css';
const VideoEditor = lazy(() => import('./ProofVideoEditor'));
async function loadVideos() {
  const clips = []; let after = null;
  do { const data = await api(`/hero-videos${after ? `?after=${encodeURIComponent(after)}` : ''}`); clips.push(...(data.clips || [])); after = data.nextCursor; } while (after && clips.length < 2000);
  return Object.fromEntries(clips.map(clip => [clip.id, clip]));
}

export default function HeroPhotoCarousel({ children }) {
  const { user } = useBravo(), canEdit = isImageEditor(user) && !user?.mustChangePassword;
  const [settings, setSettings] = useState(DEFAULT_HERO_CAROUSEL), [images, setImages] = useState(getSiteImages);
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false), [reduced, setReduced] = useState(false), [inView, setInView] = useState(true);
  const [open, setOpen] = useState(false), [seconds, setSeconds] = useState('5'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [ready, setReady] = useState(false);
  const root = useRef(null), dialog = useRef(null), files = useRef(null), hold = useRef(null), held = useRef(false), editingPhoto = useRef(false), keyboardFocus = useRef(false), suppressUntil = useRef(0);
  const swipe = useRef(null);
  const [touching, setTouching] = useState(false), [interaction, setInteraction] = useState(0);
  const [videos, setVideos] = useState({}), [editingVideo, setEditingVideo] = useState(null);
  const keys = [HOME_HERO_KEY, ...settings.photos];
  const pendingSlide = useRef(null), slideGeneration = useRef(0);
  useEffect(() => { slideGeneration.current += 1; pendingSlide.current = null; return () => { slideGeneration.current += 1; }; }, [index, settings.photos, paused, reduced, open, editingVideo, inView]);
  async function advance(direction = 1) {
    if (pendingSlide.current !== null) return;
    const generation = slideGeneration.current; pendingSlide.current = generation;
    try {
      for (let offset = 1; offset < keys.length; offset += 1) {
        if (generation !== slideGeneration.current) return;
        const next = (index + direction * offset + keys.length) % keys.length;
        const slide = root.current?.querySelectorAll('.hero-photo-slide')[next];
        if (!slide) return;
        const image = slide.querySelector('img');
        if (image) {
          // Safari can defer lazy images inside a translated, clipped track.
          // Start the request explicitly and retain the current slide until decoded.
          image.loading = 'eager';
          let timeout;
          try {
            await Promise.race([image.decode(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Photo timed out')), 15000); })]);
          } catch { continue; } finally { clearTimeout(timeout); }
          if (!image.naturalWidth) continue;
        }
        if (generation === slideGeneration.current && !document.hidden && !editingPhoto.current) setIndex(next);
        return;
      }
    } finally { if (pendingSlide.current === generation) pendingSlide.current = null; }
  }
  const photo = key => ({ ...(key === HOME_HERO_KEY ? { src: HOME_HERO_SOURCE, alt: HOME_HERO_ALT } : HERO_PHOTO_DEFAULTS[key] || { src: '/images/bravo-client-training.jpeg', alt: 'Training photo' }), ...(images[key]?.src ? { src: images[key].src, alt: images[key].alt } : {}) });
  function cancelHold() { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; held.current = false; }
  useEffect(() => {
    const release = () => { swipe.current = null; cancelHold(); setTouching(false); setInteraction(value => value + 1); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => { window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release); };
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all([api('/hero-carousel'), api('/site-images'), loadVideos()]).then(([data, media, videoData]) => {
      if (!live) return; setVideos(videoData);
      if (data.carousel?.photos) { setSettings(data.carousel); setSeconds(String(data.carousel.intervalSeconds)); setReady(true); }
      if (media.images) { setImages(media.images); setSiteImages(media.images); }
    }).catch(() => { if (live) setError('Could not load carousel settings. Reload before editing.'); });
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches || document.documentElement.classList.contains('access-reduced-motion'));
    changed(); media.addEventListener('change', changed);
    const observer = new MutationObserver(changed); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const visible = new IntersectionObserver(entries => setInView(entries[0].isIntersecting)); if (root.current) visible.observe(root.current);
    const mode = event => { editingPhoto.current = !!event.detail?.active; };
    window.addEventListener('bravo-media-edit-mode', mode); window.addEventListener('blur', cancelHold); window.addEventListener('scroll', cancelHold, true);
    return () => { live = false; cancelHold(); media.removeEventListener('change', changed); observer.disconnect(); visible.disconnect(); window.removeEventListener('bravo-media-edit-mode', mode); window.removeEventListener('blur', cancelHold); window.removeEventListener('scroll', cancelHold, true); };
  }, []);
  useEffect(() => {
    if (paused || reduced || touching || open || editingVideo || !inView || keys.length < 2) return;
    const timer = setInterval(() => {
      if (!document.hidden && !swipe.current && !held.current && !editingPhoto.current && !(keyboardFocus.current && root.current?.contains(document.activeElement)) && !document.querySelector('[data-site-image-editor][open]') && ![...(root.current?.querySelectorAll('video') || [])].some(video => !video.paused && !video.ended)) advance();
    }, settings.intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [paused, reduced, touching, interaction, open, editingVideo, inView, index, keys.length, settings.intervalSeconds]);
  useEffect(() => { if (open && canEdit) dialog.current?.showModal(); }, [open, canEdit]);
  useEffect(() => { if (!canEdit) { setOpen(false); setEditingVideo(null); } }, [canEdit]);
  async function showEditor() {
    if (!canEdit) return;
    suppressUntil.current = Date.now() + 1000; cancelHold(); setOpen(true); setStatus('');
    try { const [data, media, videoData] = await Promise.all([api('/hero-carousel'), api('/site-images'), loadVideos()]); setVideos(videoData); if (data.carousel?.photos) { setSettings(data.carousel); setSeconds(String(data.carousel.intervalSeconds)); setReady(true); setIndex(0); } if (media.images) { setImages(media.images); setSiteImages(media.images); } } catch { setError('Could not refresh settings. Reload before saving.'); setReady(false); }
  }
  async function save(photos = settings.photos, intervalSeconds = Number(seconds)) {
    if (!canEdit || busy || !ready || !Number.isInteger(intervalSeconds) || intervalSeconds < 2 || intervalSeconds > 60) return;
    setBusy(true); setError(''); setStatus('');
    try { const data = await api('/hero-carousel', { method: 'PUT', body: { expectedRevision: settings.revision, intervalSeconds, photos } }); setSettings(data.carousel); setIndex(0); setStatus('Hero carousel saved.'); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function addPhotos(event) {
    const selected = [...event.target.files]; event.target.value = ''; if (!selected.length || busy || !ready) return;
    if (settings.photos.length + selected.length > 100) { setError('This carousel supports 100 additional photos and videos. Remove a photo first.'); return; }
    setBusy(true); setError(''); setStatus('');
    try {
      const additions = [], updated = { ...images };
      for (const [i, file] of selected.entries()) {
        setStatus(`Uploading photo ${i + 1} of ${selected.length}…`);
        const key = `hero-photo-${crypto.randomUUID()}`, { data, contentType, filename } = await optimizeSitePhoto(file);
        const result = await api(`/site-images/${key}`, { method: 'PUT', body: { expectedRevision: 0, filename, contentType, data, alt: 'Bravo training photo', x: 50, y: 50, zoom: 1, fit: 'contain' } });
        updated[key] = result.image; additions.push(key);
      }
      const result = await api('/hero-carousel', { method: 'PUT', body: { expectedRevision: settings.revision, intervalSeconds: settings.intervalSeconds, photos: [...settings.photos, ...additions] } });
      setImages(updated); setSiteImages(updated); setSettings(result.carousel); setIndex(0); setStatus(`${additions.length} photo${additions.length === 1 ? '' : 's'} added.`);
    } catch (cause) { setStatus(''); setError(cause.message); }
    finally { setBusy(false); }
  }
  async function videoSaved(clip) {
    setVideos(old => ({...old, [clip.id]:clip})); setEditingVideo(null); setOpen(true);
    const key = `hero-video-${clip.id}`;
    if (!settings.photos.includes(key)) await save([...settings.photos,key],settings.intervalSeconds);
    else setStatus('Video changes saved.');
  }
  async function videoRemoved(id) {
    setEditingVideo(null); setOpen(true); setVideos(old => { const next={...old}; delete next[id]; return next; });
    await save(settings.photos.filter(key=>key!==`hero-video-${id}`),settings.intervalSeconds);
  }
  function openVideo(clip = { id:crypto.randomUUID(), title:'', description:'', revision:0, order:Date.now(), src:null }) { if (canEdit) { setOpen(false); setEditingVideo(clip); } }
  function editPhoto(key) { if (heroVideoId(key)) { openVideo(videos[heroVideoId(key)]); return; } setOpen(false); setIndex(keys.indexOf(key)); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('bravo-edit-photo', { detail: { key } }))); }
  return <div ref={root} className="home-hero-gallery" role="region" aria-label="Trainer photos" tabIndex={canEdit ? 0 : undefined}
    onClickCapture={event => { if (!event.target.closest('dialog') && Date.now() < suppressUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
    onClick={event => { if (!event.target.closest('dialog,button,a,input') && Date.now() > suppressUntil.current) setPaused(value => !value); }}
    onKeyDownCapture={() => { keyboardFocus.current = true; }}
    onKeyDown={event => { if (canEdit && event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); showEditor(); } }}
    onPointerDownCapture={event => {
      keyboardFocus.current = false;
      if (event.button !== 0 || event.isPrimary === false || event.target.closest('dialog,button,input') || editingPhoto.current) return;
      // Invalidate any in-flight automatic photo decode before the finger takes over.
      slideGeneration.current += 1; pendingSlide.current = null;
      swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
      setTouching(true); held.current = true;
      if (!canEdit) return;
      event.stopPropagation(); cancelHold(); held.current = true;
      hold.current = { x: event.clientX, y: event.clientY, timer: setTimeout(() => { swipe.current = null; setTouching(false); showEditor(); }, 650) };
    }}
    onPointerMove={event => {
      const gesture = swipe.current;
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (Math.hypot(dx, dy) > 12) cancelHold();
      if (!gesture.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        gesture.horizontal = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (gesture.horizontal) { event.preventDefault(); suppressUntil.current = Date.now() + 1000; }
    }}
    onPointerUp={event => {
      const gesture = swipe.current;
      swipe.current = null; cancelHold(); setTouching(false); setInteraction(value => value + 1);
      if (gesture?.id === event.pointerId && gesture.horizontal) {
        suppressUntil.current = Date.now() + 1000;
        if (Math.abs(event.clientX - gesture.x) >= 40) advance(event.clientX < gesture.x ? 1 : -1);
      }
    }}
    onPointerCancel={() => { swipe.current = null; cancelHold(); setTouching(false); setInteraction(value => value + 1); }}
    onLostPointerCapture={() => { swipe.current = null; cancelHold(); setTouching(false); }}
    onPointerLeave={() => { if (!swipe.current?.horizontal) { swipe.current = null; cancelHold(); setTouching(false); } }} onContextMenu={event => { if (canEdit) event.preventDefault(); }}>
    <div className="hero-photo-window"><div className="hero-photo-track" style={{ transform: `translateX(-${index * 100}%)`, transition: reduced || index === 0 ? 'none' : undefined }}>
      <div className="hero-photo-slide" aria-hidden={index !== 0} inert={index !== 0}>{children}</div>
      {settings.photos.map((key, i) => { const item = photo(key); return <div key={key} className="hero-photo-slide" aria-hidden={index !== i + 1} inert={index !== i + 1}>{heroVideoId(key) ? <HeroVideo clip={videos[heroVideoId(key)]} active={index === i + 1 && inView && !open && !editingVideo} paused={paused || reduced || touching} onEnded={() => { if (!swipe.current) advance(); }}/> : <img className="hero-carousel-image" src={item.src} alt={item.alt} width="828" height="1121" loading={i + 1 === index || i + 1 === (index + 1) % keys.length ? "eager" : "lazy"} data-site-image-key={key} data-site-image-original={HERO_PHOTO_DEFAULTS[key]?.src || item.src} style={images[key]?.framed ? framingStyle(images[key]) : undefined}/>}</div>; })}
    </div></div>
    {keys.length > 1 && <div className="hero-photo-controls"><button type="button" aria-label="Previous trainer photo" onClick={() => advance(-1)}>←</button><button type="button" aria-label={paused ? 'Resume trainer photos' : 'Pause trainer photos'} onClick={() => setPaused(value => !value)}>{paused ? '▶' : 'Ⅱ'}</button><button type="button" aria-label="Next trainer photo" onClick={() => advance()}>→</button></div>}
    {open && canEdit && <dialog ref={dialog} className="banner-editor hero-photo-editor" data-site-image-ignore="" aria-label="Edit hero carousel" onCancel={() => setOpen(false)}>
      <div className="banner-editor-heading"><h2>Hero carousel</h2><button type="button" aria-label="Close hero carousel editor" onClick={() => setOpen(false)}>×</button></div>
      <p>Add photos or videos from your device. Choose an item below to replace it or edit its description and appearance.</p>
      <div className="carousel-editor-actions"><button type="button" disabled={busy || !ready} onClick={() => files.current.click()}>Add photos</button><button type="button" disabled={busy || !ready || settings.photos.length >= 100} onClick={() => openVideo()}>Add video</button></div><input ref={files} type="file" accept="image/*" multiple hidden onChange={addPhotos}/>
      <form onSubmit={event => { event.preventDefault(); save(); }} className="proof-carousel-settings"><label htmlFor="hero-photo-speed">Time between slides (seconds)</label><input id="hero-photo-speed" type="number" min="2" max="60" step="1" required value={seconds} disabled={busy || !ready} onChange={event => setSeconds(event.target.value)}/><small>Choose 2–60 seconds. Uploaded videos play to the end before advancing.</small><button disabled={busy || !ready || Number(seconds) === settings.intervalSeconds}>Save carousel timing</button></form>
      <p role="alert">{error}</p><p role="status">{status}</p>
      <div className="carousel-editor-list">{keys.map((key, i) => <div className="hero-photo-editor-row" key={key}>{heroVideoId(key) ? <span className="hero-video-badge">Video</span> : <img src={photo(key).src} alt=""/>}<button type="button" disabled={busy || !ready} onClick={() => editPhoto(key)}>{i === 0 ? 'Main training photo' : heroVideoId(key) ? videos[heroVideoId(key)]?.title || 'Video' : photo(key).alt || `Photo ${i + 1}`}<small>{heroVideoId(key) ? 'Replace · description · cover →' : 'Replace · description · framing →'}</small></button>{i > 0 && <div className="carousel-editor-actions"><button type="button" disabled={busy || !ready || i === 1} onClick={() => { const photos = [...settings.photos]; [photos[i - 2], photos[i - 1]] = [photos[i - 1], photos[i - 2]]; save(photos,settings.intervalSeconds); }}>Move earlier</button><button type="button" disabled={busy || !ready} onClick={() => save(settings.photos.filter(item => item !== key),settings.intervalSeconds)}>Remove</button></div>}</div>)}</div>
      {Object.values(videos).some(clip=>!settings.photos.includes(`hero-video-${clip.id}`)) && <><h3>Saved videos</h3><p>Add a previously uploaded video without uploading again.</p>{Object.values(videos).filter(clip=>!settings.photos.includes(`hero-video-${clip.id}`)).map(clip=><button type="button" disabled={busy || !ready || settings.photos.length >= 100} key={clip.id} onClick={()=>save([...settings.photos,`hero-video-${clip.id}`],settings.intervalSeconds)}>Add {clip.title}</button>)}</>}
    </dialog>}
    {editingVideo && canEdit && <Suspense fallback={<p role="status">Opening video editor…</p>}><VideoEditor apiBase="/hero-videos" clip={editingVideo} onClose={()=>{setEditingVideo(null);setOpen(true);}} onSaved={videoSaved} onRemoved={videoRemoved}/></Suspense>}
  </div>;
}
