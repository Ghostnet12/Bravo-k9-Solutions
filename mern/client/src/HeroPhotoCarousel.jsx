import { useEffect, useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { DEFAULT_HERO_CAROUSEL, HERO_PHOTO_DEFAULTS } from '../../shared/hero-carousel.js';
import { HOME_HERO_KEY, HOME_HERO_SOURCE, HOME_HERO_ALT } from '../../shared/home-hero.js';
import { isImageEditor, framingStyle } from '../../shared/site-images.js';
import { getSiteImages, setSiteImages } from './site-image-state.js';
import { optimizeSitePhoto } from './site-image-editor.js';
import './hero-carousel.css';

export default function HeroPhotoCarousel({ children }) {
  const { user } = useBravo(), canEdit = isImageEditor(user) && !user?.mustChangePassword;
  const [settings, setSettings] = useState(DEFAULT_HERO_CAROUSEL), [images, setImages] = useState(getSiteImages);
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false), [reduced, setReduced] = useState(false), [inView, setInView] = useState(true);
  const [open, setOpen] = useState(false), [seconds, setSeconds] = useState('5'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [ready, setReady] = useState(false);
  const root = useRef(null), dialog = useRef(null), files = useRef(null), hold = useRef(null), held = useRef(false), editingPhoto = useRef(false), keyboardFocus = useRef(false);
  const keys = [HOME_HERO_KEY, ...settings.photos];
  const photo = key => ({ ...(key === HOME_HERO_KEY ? { src: HOME_HERO_SOURCE, alt: HOME_HERO_ALT } : HERO_PHOTO_DEFAULTS[key] || { src: '/images/bravo-client-training.jpeg', alt: 'Training photo' }), ...(images[key]?.src ? { src: images[key].src, alt: images[key].alt } : {}) });
  function cancelHold() { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; held.current = false; }
  useEffect(() => {
    let live = true;
    Promise.all([api('/hero-carousel'), api('/site-images')]).then(([data, media]) => {
      if (!live) return;
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
    if (paused || reduced || open || !inView || keys.length < 2) return;
    const timer = setInterval(() => {
      if (!document.hidden && !held.current && !editingPhoto.current && !(keyboardFocus.current && root.current?.contains(document.activeElement)) && !document.querySelector('[data-site-image-editor][open]')) setIndex(value => (value + 1) % keys.length);
    }, settings.intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [paused, reduced, open, inView, keys.length, settings.intervalSeconds]);
  useEffect(() => { if (open && canEdit) dialog.current?.showModal(); }, [open, canEdit]);
  useEffect(() => { if (!canEdit) setOpen(false); }, [canEdit]);
  async function showEditor() {
    if (!canEdit) return;
    cancelHold(); setOpen(true); setStatus('');
    try { const [data, media] = await Promise.all([api('/hero-carousel'), api('/site-images')]); if (data.carousel?.photos) { setSettings(data.carousel); setSeconds(String(data.carousel.intervalSeconds)); setReady(true); setIndex(0); } if (media.images) { setImages(media.images); setSiteImages(media.images); } } catch { setError('Could not refresh settings. Reload before saving.'); setReady(false); }
  }
  async function save(photos = settings.photos) {
    const intervalSeconds = Number(seconds);
    if (!canEdit || busy || !ready || !Number.isInteger(intervalSeconds) || intervalSeconds < 2 || intervalSeconds > 60) return;
    setBusy(true); setError(''); setStatus('');
    try { const data = await api('/hero-carousel', { method: 'PUT', body: { expectedRevision: settings.revision, intervalSeconds, photos } }); setSettings(data.carousel); setIndex(0); setStatus('Photo carousel saved.'); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function addPhotos(event) {
    const selected = [...event.target.files]; event.target.value = ''; if (!selected.length || busy || !ready) return;
    if (settings.photos.length + selected.length > 100) { setError('This carousel supports 100 additional photos. Remove a photo first.'); return; }
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
  function editPhoto(key) { setOpen(false); setIndex(keys.indexOf(key)); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('bravo-edit-photo', { detail: { key } }))); }
  return <div ref={root} className="home-hero-gallery" role="region" aria-label="Trainer photos" tabIndex={canEdit ? 0 : undefined}
    onKeyDownCapture={() => { keyboardFocus.current = true; }}
    onKeyDown={event => { if (canEdit && event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); showEditor(); } }}
    onPointerDownCapture={event => { keyboardFocus.current = false; if (event.target.closest('dialog,button,input,a')) return; held.current = true; if (!canEdit || event.button !== 0) return; event.stopPropagation(); cancelHold(); held.current = true; hold.current = { x: event.clientX, y: event.clientY, timer: setTimeout(showEditor, 650) }; }}
    onPointerMove={event => { if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 12) cancelHold(); }}
    onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold} onContextMenu={event => { if (canEdit) event.preventDefault(); }}>
    <div className="hero-photo-window"><div className="hero-photo-track" style={{ transform: `translateX(-${index * 100}%)`, transition: reduced || index === 0 ? 'none' : undefined }}>
      <div className="hero-photo-slide" aria-hidden={index !== 0}>{children}</div>
      {settings.photos.map((key, i) => { const item = photo(key); return <div key={key} className="hero-photo-slide" aria-hidden={index !== i + 1}><img className="hero-carousel-image" src={item.src} alt={item.alt} width="828" height="1121" loading="lazy" data-site-image-key={key} data-site-image-original={HERO_PHOTO_DEFAULTS[key]?.src || item.src} style={images[key]?.framed ? framingStyle(images[key]) : undefined}/></div>; })}
    </div></div>
    {keys.length > 1 && <div className="hero-photo-controls"><button type="button" aria-label="Previous trainer photo" onClick={() => setIndex(value => (value - 1 + keys.length) % keys.length)}>←</button><span>{index + 1} / {keys.length}</span><button type="button" aria-label={paused ? 'Resume trainer photos' : 'Pause trainer photos'} onClick={() => setPaused(value => !value)}>{paused ? '▶' : 'Ⅱ'}</button><button type="button" aria-label="Next trainer photo" onClick={() => setIndex(value => (value + 1) % keys.length)}>→</button></div>}
    {open && canEdit && <dialog ref={dialog} className="banner-editor hero-photo-editor" data-site-image-ignore="" aria-label="Edit photo carousel" onCancel={() => setOpen(false)}>
      <div className="banner-editor-heading"><h2>Photo carousel</h2><button type="button" aria-label="Close photo carousel editor" onClick={() => setOpen(false)}>×</button></div>
      <p>Add photos from your device, or choose a photo to replace it, edit its description, or adjust framing and zoom.</p>
      <button type="button" disabled={busy || !ready} onClick={() => files.current.click()}>Add photos</button><input ref={files} type="file" accept="image/*" multiple hidden onChange={addPhotos}/>
      <form onSubmit={event => { event.preventDefault(); save(); }} className="proof-carousel-settings"><label htmlFor="hero-photo-speed">Time between photos (seconds)</label><input id="hero-photo-speed" type="number" min="2" max="60" step="1" required value={seconds} disabled={busy || !ready} onChange={event => setSeconds(event.target.value)}/><small>Choose 2–60 seconds.</small><button disabled={busy || !ready || Number(seconds) === settings.intervalSeconds}>Save photo timing</button></form>
      <p role="alert">{error}</p><p role="status">{status}</p>
      <div className="carousel-editor-list">{keys.map((key, i) => <div className="hero-photo-editor-row" key={key}><img src={photo(key).src} alt=""/><button type="button" disabled={busy || !ready} onClick={() => editPhoto(key)}>{i === 0 ? 'Main training photo' : photo(key).alt || `Photo ${i + 1}`}<small>Replace · description · framing →</small></button>{i > 0 && <div className="carousel-editor-actions"><button type="button" disabled={busy || !ready || i === 1} onClick={() => { const photos = [...settings.photos]; [photos[i - 2], photos[i - 1]] = [photos[i - 1], photos[i - 2]]; save(photos); }}>Move earlier</button><button type="button" disabled={busy || !ready} onClick={() => save(settings.photos.filter(item => item !== key))}>Remove</button></div>}</div>)}</div>
    </dialog>}
  </div>;
}
