import './bravo-motion.css';
import { horizontalSwipe } from '../../shared/bravo-motion';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from './Link';
import Accessibility from './Accessibility';
import { useLiveSessions } from './live-state';
import { useBravo } from './context';
import { api } from './api';
import { isImageEditor } from '../../shared/site-images.js';
import { DEFAULT_AD_CAROUSEL } from '../../shared/site-ads.js';
const AdEditor = lazy(() => import('./AdEditor'));
import './home-ad-carousel.css';
import './fci-support.css';
import FCIPromotion from './FCIPromotion';

const initialCollection = () => ({ revision: 0, settings: { ...DEFAULT_AD_CAROUSEL }, ads: [] });

function AdMedia({ ad, playing }) {
  const video = useRef(null), shouldPlay = useRef(playing);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const resume = () => {
      if (element.getAttribute('src') !== ad.videoSrc) element.setAttribute('src', ad.videoSrc);
      if (shouldPlay.current) element.play().catch(() => {});
    };
    const release = () => { element.pause(); element.removeAttribute('src'); element.load(); };
    resume();
    // SPA navigation keeps this element mounted. A document departure must
    // release the old media loader; a back/forward-cache restore reopens it.
    window.addEventListener('pagehide', release); window.addEventListener('pageshow', resume);
    return () => { window.removeEventListener('pagehide', release); window.removeEventListener('pageshow', resume); release(); };
  }, [ad.videoSrc]);
  useEffect(() => { shouldPlay.current = playing; const element = video.current; if (!element) return; if (playing) element.play().catch(() => {}); else element.pause(); }, [playing, ad.videoSrc]);
  return ad.creative === 'fci' ? <FCIPromotion/> : ad.videoSrc ? <video ref={video} src={ad.videoSrc} poster={ad.src || undefined} muted loop playsInline preload="none" aria-label={ad.alt || ad.title}/> : <span className="ad-compact-art"><span className="ad-ambient" style={{ backgroundImage: `url(${JSON.stringify(ad.src)})` }} aria-hidden="true"/><img className="ad-complete-art" src={ad.src} width="1320" height="510" loading="eager" draggable="false" alt={ad.alt || ad.title}/><span className="ad-compact-title">{ad.title}<small>Explore Bravo →</small></span></span>;
}
function ExpandedAd({ ad, close }) {
  const dialog = useRef(null);
  useEffect(() => { const previous = document.activeElement; dialog.current?.showModal(); return () => previous?.focus?.(); }, []);
  return <dialog ref={dialog} className="ad-expanded" aria-label={ad.title} onCancel={close}><button type="button" className="ad-expanded-close" onClick={close}>Close advertisement ×</button>
    {ad.videoSrc ? <video src={ad.videoSrc} poster={ad.src || undefined} controls muted playsInline/> : <img src={ad.src} alt={ad.alt || ad.title}/>}
    <h2>{ad.title}</h2>{ad.link && <a className="button" href={ad.link}>Open advertisement →</a>}
  </dialog>;
}
export default function HomeAdCarousel() {
  const { user } = useBravo(), { announcements } = useLiveSessions();
  const canEdit = isImageEditor(user) && !user?.mustChangePassword;
  const [collection, setCollection] = useState(initialCollection), [activeId, setActiveId] = useState(''), [editing, setEditing] = useState(false), [expanded, setExpanded] = useState(null);
  const [paused, setPaused] = useState(false), [reduced, setReduced] = useState(false), [focused, setFocused] = useState(false), [obscured, setObscured] = useState(false), [keyboard, setKeyboard] = useState(false);
  const hold = useRef(null), origin = useRef(null), suppressUntil = useRef(0), dock = useRef(null), tapTarget = useRef(null);
  const [gesturing, setGesturing] = useState(false);
  const cancelHold = () => { clearTimeout(hold.current); hold.current = null; };
  useEffect(() => {
    let live = true, loading = false;
    const refresh = async () => { if (loading || document.hidden) return; loading = true; try { const data = await api('/site-ads'); if (live && Array.isArray(data.ads)) setCollection(data); } catch { /* Retain the verified collection during a temporary refresh failure. */ } finally { loading = false; } };
    void refresh(); const timer = setInterval(refresh, 15000);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches || document.documentElement.classList.contains('access-reduced-motion')); changed(); media.addEventListener('change', changed);
    const observer = new MutationObserver(changed); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const visibility = () => { setObscured(document.hidden || !!document.fullscreenElement || !!document.querySelector('dialog[open]')); };
    const dialogs = new MutationObserver(visibility); dialogs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    const viewport = () => { const vv = window.visualViewport; setKeyboard(!!vv && vv.scale === 1 && innerHeight - vv.height > 160); };
    window.visualViewport?.addEventListener('resize', viewport); viewport();
    document.addEventListener('visibilitychange', visibility); document.addEventListener('fullscreenchange', visibility); window.addEventListener('bravo-ads-changed', refresh);
    return () => { live = false; clearInterval(timer); cancelHold(); observer.disconnect(); dialogs.disconnect(); media.removeEventListener('change', changed); window.visualViewport?.removeEventListener('resize', viewport); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', visibility); window.removeEventListener('bravo-ads-changed', refresh); };
  }, []);
  const promotions = announcements.filter(item => item.status === 'live').map(item => ({ id: `live-${item.trainerId}`, title: `${item.trainerName} · ${item.audience === 'client' ? 'Client session' : 'Training live'}`, link: item.href, live: true, audience: item.audience }));
  const slides = [...collection.ads.filter(ad => ad.enabled !== false && !ad.scheduleHidden && (ad.src || ad.videoSrc)), ...promotions];
  const current = slides.find(ad => ad.id === activeId) || slides[0];
  const currentId = current?.id;
  const activeIndex = slides.findIndex(ad => ad.id === currentId);
  // Keep the fading previous slide and preload the next, without mounting the
  // whole collection. Stable IDs preserve the current video across routes/polls.
  const visibleSlides = slides.filter((_ad, index) => index === activeIndex || index === (activeIndex + 1) % slides.length || index === (activeIndex + slides.length - 1) % slides.length);
  useEffect(() => { if (currentId && currentId !== activeId) setActiveId(currentId); }, [currentId, activeId]);
  const rotationKey = slides.map(ad => ad.id).join('|');
  const stopped = paused || reduced || editing || !!expanded || focused || obscured || keyboard || gesturing;
  useEffect(() => {
    if (slides.length < 2 || stopped) return;
    const ids = rotationKey.split('|');
    const timer = setInterval(() => { if (!origin.current) setActiveId(id => ids[(Math.max(0, ids.indexOf(id)) + 1) % ids.length]); }, Math.max(3, collection.settings?.autoplaySeconds || 7) * 1000);
    return () => clearInterval(timer);
  }, [rotationKey, slides.length, stopped, collection.settings?.autoplaySeconds, activeId]);
  useLayoutEffect(() => {
    if (!current || !dock.current) { document.documentElement.style.removeProperty('--ad-dock-height'); return; }
    const measure = () => document.documentElement.style.setProperty('--ad-dock-height', `${Math.ceil(dock.current.getBoundingClientRect().height)}px`);
    measure(); const observer = new ResizeObserver(measure); observer.observe(dock.current);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--ad-dock-height'); };
  }, [!!current]);
  async function openEditor() {
    if (!canEdit) return;
    // The modal may receive pointerup instead of the ad that started the hold.
    // Release both gesture guards before handing control to the editor.
    releaseGesture(true); tapTarget.current = null; suppressUntil.current = Date.now() + 1200;
    try { setCollection(await api('/site-ads')); } catch { /* Keep the current snapshot. */ }
    setEditing(true);
  }
  function moveAd(direction) {
    const ids = slides.map(ad => ad.id);
    if (ids.length > 1) setActiveId(id => ids[(Math.max(0, ids.indexOf(id)) + direction + ids.length) % ids.length]);
  }
  function releaseGesture(cancelled = false) {
    cancelHold();
    if (origin.current && cancelled) suppressUntil.current = Math.max(suppressUntil.current, Date.now() + 500);
    origin.current = null; setGesturing(false);
  }
  function beginGesture(event) {
    if (event.isPrimary === false) { releaseGesture(true); return; }
    if (event.button !== 0) return;
    cancelHold(); tapTarget.current = null; suppressUntil.current = 0;
    origin.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId, id: currentId, moved: false, held: false };
    setGesturing(true);
    if (canEdit) hold.current = setTimeout(() => {
      const start = origin.current;
      if (!start || start.moved) return;
      start.held = true; void openEditor();
    }, 650);
  }
  function moveGesture(event) {
    const start = origin.current;
    if (!start) return;
    if (event.pointerId !== start.pointer) { releaseGesture(true); return; }
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) { start.moved = true; cancelHold(); }
  }
  function endGesture(event) {
    const start = origin.current;
    if (start && event.pointerId === start.pointer) {
      const direction = horizontalSwipe(event.clientX - start.x, event.clientY - start.y);
      const moved = start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12;
      if (moved && !start.held && start.id === currentId && direction) moveAd(direction);
      if (moved || start.held || start.id !== currentId) suppressUntil.current = Math.max(suppressUntil.current, Date.now() + 500);
      else tapTarget.current = { id: start.id, at: Date.now() };
    }
    releaseGesture();
  }
  useEffect(() => {
    const cancel = () => releaseGesture(true);
    window.addEventListener('blur', cancel); window.addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('pagehide', cancel); document.removeEventListener('visibilitychange', cancel); };
  }, []);
  const publish = data => { setCollection(data); window.dispatchEvent(new Event('bravo-ads-changed')); };
  if (typeof document === 'undefined') return null;
  return <>
    <Accessibility>
      {slides.length > 1 && <><button type="button" onClick={() => moveAd(-1)}>Previous advertisement</button><button type="button" onClick={() => moveAd(1)}>Next advertisement</button></>}
      {current && <button type="button" aria-pressed={paused || reduced} onClick={() => { setPaused(!(paused || reduced)); if (reduced) setReduced(false); }}>{paused || reduced ? 'Resume advertisements' : 'Pause advertisements'}</button>}
      {current && !current.live && <button type="button" onClick={() => setExpanded(current)}>Expand advertisement</button>}
      {canEdit && <button type="button" onClick={openEditor}>Manage advertisements</button>}
    </Accessibility>
    {current && createPortal(<aside ref={dock} className="home-ad-dock" data-keyboard={keyboard || undefined} data-obscured={obscured || undefined} aria-label="Bravo announcements and promotions">
      <section className="home-ad-carousel" data-site-image-ignore="" data-ad-editable={canEdit || undefined}
        onPointerDown={beginGesture} onPointerMove={moveGesture} onPointerUp={endGesture}
        onPointerCancel={() => releaseGesture(true)} onPointerLeave={event => { if (event.pointerType === 'mouse') releaseGesture(true); }}
        onDragStart={event => event.preventDefault()}
        onContextMenu={event => { if (canEdit) event.preventDefault(); }}
        onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
        onClickCapture={event => { const intent = tapTarget.current; tapTarget.current = null; const changed = event.detail !== 0 && intent && Date.now() - intent.at < 1000 && intent.id !== currentId; if (Date.now() < suppressUntil.current || changed) { event.preventDefault(); event.stopPropagation(); } }}>
        <div className="home-ad-frame"><div className="home-ad-track">{visibleSlides.map(ad => {
          const selected = ad.id === current.id;
          const art = ad.live ? <span className="ad-live-creative"><span className="live-badge"><i aria-hidden="true"/>LIVE</span><strong>BRAVO LIVE</strong><span className="ad-live-trainer">{ad.title}</span><small>{ad.audience === 'client' ? 'Client session' : 'Real training. Right now.'}</small></span> : ad.workshop ? <span className="ad-workshop-creative"><AdMedia ad={ad} playing={selected && !stopped}/><span className="ad-workshop-schedule">{ad.workshop.dateLabel || 'Workshop announcement'}{ad.workshop.date && ad.workshop.time && <small>{ad.workshop.time} · Central</small>}</span></span> : <AdMedia ad={ad} playing={selected && !stopped}/>;
          return <article className={`home-ad-slide${selected ? ' is-active' : ''}`} key={ad.id} data-ad-id={ad.id} aria-hidden={!selected || undefined} inert={!selected}>
            {ad.link ? <Link href={ad.link} aria-label={ad.title}>{art}</Link> : <button type="button" className="ad-art-button" onClick={() => setExpanded(ad)} aria-label={`View advertisement: ${ad.title}`}>{art}</button>}
          </article>;
        })}</div></div>
      </section>
    </aside>, document.body)}
    {editing && canEdit && createPortal(<Suspense fallback={<p role="status">Opening advertisements…</p>}><AdEditor collection={collection} publish={publish} close={() => setEditing(false)}/></Suspense>, document.body)}
    {expanded && createPortal(<ExpandedAd ad={expanded} close={() => setExpanded(null)}/>, document.body)}
  </>;
}
export { default as AdvertisementManagement } from './AdvertisementManagement';
