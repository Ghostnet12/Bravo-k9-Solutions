import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveSessions } from './live-state';
import { useBravo } from './context';
import { api } from './api';
import { isImageEditor } from '../../shared/site-images.js';
import { DEFAULT_AD_CAROUSEL } from '../../shared/site-ads.js';
import { optimizeSitePhoto } from './site-image-editor.js';
import './home-ad-carousel.css';

const initialCollection = () => ({ revision: 0, settings: { ...DEFAULT_AD_CAROUSEL }, ads: [] });

function AdRow({ ad, first, last, collection, publish, move, remove, videos }) {
  const [draft, setDraft] = useState(() => ({ title: ad.title, alt: ad.alt, link: ad.link || '', enabled: ad.enabled !== false, videoId: ad.videoId || '' }));
  const [file, setFile] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setDraft({ title: ad.title, alt: ad.alt, link: ad.link || '', enabled: ad.enabled !== false, videoId: ad.videoId || '' }); setFile(null); }, [ad.id, ad.title, ad.alt, ad.link, ad.enabled, ad.videoId]);
  const changed = file || draft.title !== ad.title || draft.alt !== ad.alt || draft.link !== (ad.link || '') || draft.enabled !== (ad.enabled !== false) || draft.videoId !== (ad.videoId || '');
  async function save() {
    if (!changed || busy) return;
    setBusy(true); setError('');
    try {
      const image = file ? await optimizeSitePhoto(file) : null;
      const next = await api(`/site-ads/${ad.id}`, { method: 'PUT', body: { expectedRevision: collection.revision, ...draft, ...(image ? { image: { filename: image.filename, contentType: image.contentType, data: image.data } } : {}) } });
      publish(next);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <article className="ad-editor-card">
    {ad.src ? <img src={ad.src} alt="" width="330" height="128"/> : <video src={ad.videoSrc} muted playsInline preload="metadata" aria-label={ad.title}/>}
    <div className="ad-editor-fields">
      <label>Ad name<input value={draft.title} maxLength={120} onChange={e => setDraft(old => ({ ...old, title: e.target.value }))}/></label>
      <label>Image description<input value={draft.alt} maxLength={240} onChange={e => setDraft(old => ({ ...old, alt: e.target.value }))}/></label>
      <label>Click destination<input value={draft.link} maxLength={1000} placeholder="/contact or https://…" onChange={e => setDraft(old => ({ ...old, link: e.target.value }))}/></label>
      <label className="ad-editor-check"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft(old => ({ ...old, enabled: e.target.checked }))}/> Show this ad publicly</label>
      <label>Published training video<select value={draft.videoId} onChange={e => setDraft(old => ({ ...old, videoId: e.target.value }))}><option value="">Use artwork only</option>{videos.map(clip => <option key={clip.id} value={clip.id}>{clip.title}</option>)}</select></label>
      <label>Replace artwork<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)}/></label>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="ad-editor-row-actions">
      <button type="button" disabled={first || busy} onClick={() => move(ad.id, -1)}>Move up</button>
      <button type="button" disabled={last || busy} onClick={() => move(ad.id, 1)}>Move down</button>
      <button type="button" disabled={!changed || busy || !draft.title.trim() || !draft.alt.trim()} onClick={save}>{busy ? 'Saving…' : 'Save ad'}</button>
      <button type="button" className="ad-delete" disabled={busy} onClick={() => remove(ad.id, ad.title)}>Delete</button>
    </div>
  </article>;
}

function AdEditor({ collection, publish, close }) {
  const dialog = useRef(null);
  const [videos, setVideos] = useState([]), [videoId, setVideoId] = useState('');
  useEffect(() => { let active = true; api('/proof-videos').then(data => { if (active) setVideos((data.clips || []).filter(clip => clip.src)); }).catch(() => {}); return () => { active = false; }; }, []);
  const [file, setFile] = useState(null), [title, setTitle] = useState(''), [alt, setAlt] = useState(''), [link, setLink] = useState('/contact');
  const [seconds, setSeconds] = useState(collection.settings?.autoplaySeconds || DEFAULT_AD_CAROUSEL.autoplaySeconds);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const previous = document.activeElement; dialog.current?.showModal(); return () => previous?.focus?.(); }, []);
  async function add() {
    if ((!file && !videoId) || !title.trim() || !alt.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const image = file ? await optimizeSitePhoto(file) : null;
      const next = await api('/site-ads', { method: 'POST', body: { expectedRevision: collection.revision, title: title.trim(), alt: alt.trim(), link: link.trim(), enabled: true, videoId, ...(image ? { image: { filename: image.filename, contentType: image.contentType, data: image.data } } : {}) } });
      publish(next); setFile(null); setTitle(''); setAlt(''); setVideoId('');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function order(ids, autoplaySeconds = seconds) {
    setBusy(true); setError('');
    try { publish(await api('/site-ads', { method: 'PUT', body: { expectedRevision: collection.revision, ids, settings: { autoplaySeconds: Number(autoplaySeconds) } } })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function move(id, delta) {
    const ids = collection.ads.map(ad => ad.id), index = ids.indexOf(id), target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await order(ids);
  }
  async function remove(id, name) {
    if (!window.confirm(`Delete “${name}” from the homepage ad rotation?`)) return;
    setBusy(true); setError('');
    try { publish(await api(`/site-ads/${id}`, { method: 'DELETE', body: { expectedRevision: collection.revision } })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function saveTiming() { await order(collection.ads.map(ad => ad.id), seconds); }
  return <dialog ref={dialog} className="ad-editor-dialog" data-site-image-ignore="" aria-labelledby="ad-editor-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <div className="ad-editor-heading"><div><p>BRAVO · HOMEPAGE ADVERTISING</p><h2 id="ad-editor-title">Manage homepage ads</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Close ad editor">×</button></div>
    <p>These ads rotate in the homepage bottom dock. Videos play muted; visitors can expand artwork. Add, reorder, hide, replace or delete them here.</p>
    <section className="ad-editor-settings" aria-label="Ad rotation settings">
      <label>Seconds between ads<input type="range" min="3" max="20" step="1" value={seconds} onChange={e => setSeconds(Number(e.target.value))}/><output>{seconds}s</output></label>
      <button type="button" disabled={busy || seconds === collection.settings?.autoplaySeconds} onClick={saveTiming}>Save timing</button>
    </section>
    <section className="ad-editor-list" aria-label="Published ads">
      {collection.ads.length ? collection.ads.map((ad, index) => <AdRow key={ad.id} ad={ad} first={index === 0} last={index === collection.ads.length - 1} collection={collection} publish={publish} move={move} remove={remove} videos={videos}/>) : <p>No ads are published. Add one below.</p>}
    </section>
    <section className="ad-editor-add">
      <h3>Add advertisement</h3>
      <label>Published training video<select value={videoId} onChange={e => setVideoId(e.target.value)}><option value="">Use artwork only</option>{videos.map(clip => <option key={clip.id} value={clip.id}>{clip.title}</option>)}</select></label>
      <label>Banner artwork<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)}/></label>
      <label>Ad name<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)}/></label>
      <label>Image description<input value={alt} maxLength={240} onChange={e => setAlt(e.target.value)}/></label>
      <label>Click destination<input value={link} maxLength={1000} placeholder="/contact or https://…" onChange={e => setLink(e.target.value)}/></label>
      <button type="button" disabled={busy || (!file && !videoId) || !title.trim() || !alt.trim()} onClick={add}>{busy ? 'Publishing…' : '+ Add ad'}</button>
    </section>
    {error && <p className="ad-editor-error" role="alert">{error}</p>}
    <div className="ad-editor-footer"><button type="button" disabled={busy} onClick={close}>Done</button></div>
  </dialog>;
}

function AdMedia({ ad, playing }) {
  const video = useRef(null);
  useEffect(() => { const element = video.current; if (!element) return; if (playing) element.play().catch(() => {}); else element.pause(); }, [playing, ad.videoSrc]);
  return ad.videoSrc ? <video ref={video} src={ad.videoSrc} poster={ad.src || undefined} muted loop playsInline preload="none" aria-label={ad.alt || ad.title}/> : <img src={ad.src} width="1320" height="510" loading="eager" draggable="false" alt={ad.alt || ad.title}/>;
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
  const hold = useRef(null), origin = useRef(null), suppressUntil = useRef(0), dock = useRef(null);
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
  const slides = [...collection.ads.filter(ad => ad.enabled !== false && (ad.src || ad.videoSrc)), ...promotions];
  const current = slides.find(ad => ad.id === activeId) || slides[0];
  const currentId = current?.id;
  useEffect(() => { if (currentId && currentId !== activeId) setActiveId(currentId); }, [currentId, activeId]);
  const rotationKey = slides.map(ad => ad.id).join('|');
  const stopped = paused || reduced || editing || !!expanded || focused || obscured || keyboard;
  useEffect(() => {
    if (slides.length < 2 || stopped) return;
    const ids = rotationKey.split('|');
    const timer = setInterval(() => setActiveId(id => ids[(Math.max(0, ids.indexOf(id)) + 1) % ids.length]), Math.max(3, collection.settings?.autoplaySeconds || 7) * 1000);
    return () => clearInterval(timer);
  }, [rotationKey, slides.length, stopped, collection.settings?.autoplaySeconds]);
  useLayoutEffect(() => {
    if (!current || !dock.current) { document.documentElement.style.removeProperty('--ad-dock-height'); return; }
    const measure = () => document.documentElement.style.setProperty('--ad-dock-height', `${Math.ceil(dock.current.getBoundingClientRect().height)}px`);
    measure(); const observer = new ResizeObserver(measure); observer.observe(dock.current);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--ad-dock-height'); };
  }, [!!current]);
  async function openEditor() {
    if (!canEdit) return;
    cancelHold(); suppressUntil.current = Date.now() + 1200;
    try { setCollection(await api('/site-ads')); } catch { /* Keep the current snapshot. */ }
    setEditing(true);
  }
  const publish = data => { setCollection(data); window.dispatchEvent(new Event('bravo-ads-changed')); };
  if (typeof document === 'undefined') return null;
  return <>
    {canEdit && <button type="button" className="section-edit-button ad-management-entry" onClick={openEditor}>Manage advertisements</button>}
    {current && createPortal(<aside ref={dock} className="home-ad-dock" data-keyboard={keyboard || undefined} data-obscured={obscured || undefined} aria-label="Bravo announcements and promotions">
      <section className="home-ad-carousel" data-site-image-ignore="" data-ad-editable={canEdit || undefined}
        onPointerDown={event => { if (!canEdit || event.button !== 0 || event.isPrimary === false || event.target.closest('button')) return; origin.current = { x: event.clientX, y: event.clientY }; cancelHold(); hold.current = setTimeout(openEditor, 650); }}
        onPointerMove={event => { if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 12) cancelHold(); }}
        onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
        onContextMenu={event => { if (canEdit) event.preventDefault(); }}
        onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
        onClickCapture={event => { if (Date.now() < suppressUntil.current) { event.preventDefault(); event.stopPropagation(); } }}>
        <div className="home-ad-frame"><div className="home-ad-track">{slides.map(ad => {
          const selected = ad.id === current.id;
          const art = ad.live ? <span className="ad-live-creative"><span className="live-badge"><i aria-hidden="true"/>LIVE</span><strong>BRAVO LIVE</strong><small>{ad.audience === 'client' ? 'Client session' : 'Real training. Right now.'}</small></span> : <AdMedia ad={ad} playing={selected && !stopped}/>;
          return <article className={`home-ad-slide${selected ? ' is-active' : ''}`} key={ad.id} aria-hidden={!selected || undefined} inert={!selected}>
            {ad.link ? <a href={ad.link} aria-label={ad.title}>{art}</a> : <button type="button" className="ad-art-button" onClick={() => setExpanded(ad)} aria-label={`View advertisement: ${ad.title}`}>{art}</button>}
          </article>;
        })}</div></div>
        <div className="ad-dock-copy"><span>{current.live ? 'ON AIR' : 'BRAVO · IN THE FIELD'}</span><a href={current.link || '#'} onClick={event => { if (!current.link) { event.preventDefault(); setExpanded(current); } }}>{current.title}</a>{current.live && <small>{current.audience === 'client' ? 'Sign in to check access' : 'Watch live →'}</small>}</div>
        <div className="ad-dock-controls"><button type="button" aria-label={paused || reduced ? 'Resume advertisements' : 'Pause advertisements'} aria-pressed={paused || reduced} onClick={() => { setPaused(!(paused || reduced)); if (reduced) setReduced(false); setFocused(false); }}>{paused || reduced ? '▶' : 'Ⅱ'}</button>{!current.live && <button type="button" aria-label="Expand advertisement" onClick={() => setExpanded(current)}>⤢</button>}{canEdit && <button type="button" aria-label="Edit dock advertisements" onClick={openEditor}>✎</button>}</div>
      </section>
    </aside>, document.body)}
    {editing && canEdit && createPortal(<AdEditor collection={collection} publish={publish} close={() => setEditing(false)}/>, document.body)}
    {expanded && createPortal(<ExpandedAd ad={expanded} close={() => setExpanded(null)}/>, document.body)}
  </>;
}
