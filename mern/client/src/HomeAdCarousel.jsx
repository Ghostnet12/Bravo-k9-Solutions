import { useEffect, useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { isImageEditor } from '../../shared/site-images.js';
import { cloneDefaultAds, DEFAULT_AD_CAROUSEL } from '../../shared/site-ads.js';
import { optimizeSitePhoto } from './site-image-editor.js';
import './home-ad-carousel.css';

const initialCollection = () => ({ revision: 0, settings: { ...DEFAULT_AD_CAROUSEL }, ads: cloneDefaultAds().map(ad => ({ ...ad, src: ad.image })) });

function AdRow({ ad, first, last, collection, publish, move, remove }) {
  const [draft, setDraft] = useState(() => ({ title: ad.title, alt: ad.alt, link: ad.link || '', enabled: ad.enabled !== false }));
  const [file, setFile] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setDraft({ title: ad.title, alt: ad.alt, link: ad.link || '', enabled: ad.enabled !== false }); setFile(null); }, [ad.id, ad.title, ad.alt, ad.link, ad.enabled]);
  const changed = file || draft.title !== ad.title || draft.alt !== ad.alt || draft.link !== (ad.link || '') || draft.enabled !== (ad.enabled !== false);
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
    <img src={ad.src} alt="" width="330" height="128"/>
    <div className="ad-editor-fields">
      <label>Ad name<input value={draft.title} maxLength={120} onChange={e => setDraft(old => ({ ...old, title: e.target.value }))}/></label>
      <label>Image description<input value={draft.alt} maxLength={240} onChange={e => setDraft(old => ({ ...old, alt: e.target.value }))}/></label>
      <label>Click destination<input value={draft.link} maxLength={1000} placeholder="/contact or https://…" onChange={e => setDraft(old => ({ ...old, link: e.target.value }))}/></label>
      <label className="ad-editor-check"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft(old => ({ ...old, enabled: e.target.checked }))}/> Show this ad publicly</label>
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
  const [file, setFile] = useState(null), [title, setTitle] = useState(''), [alt, setAlt] = useState(''), [link, setLink] = useState('/contact');
  const [seconds, setSeconds] = useState(collection.settings?.autoplaySeconds || DEFAULT_AD_CAROUSEL.autoplaySeconds);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const previous = document.activeElement; dialog.current?.showModal(); return () => previous?.focus?.(); }, []);
  async function add() {
    if (!file || !title.trim() || !alt.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const image = await optimizeSitePhoto(file);
      const next = await api('/site-ads', { method: 'POST', body: { expectedRevision: collection.revision, title: title.trim(), alt: alt.trim(), link: link.trim(), enabled: true, image: { filename: image.filename, contentType: image.contentType, data: image.data } } });
      publish(next); setFile(null); setTitle(''); setAlt('');
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
  return <dialog ref={dialog} className="ad-editor-dialog" aria-labelledby="ad-editor-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <div className="ad-editor-heading"><div><p>BRAVO · HOMEPAGE ADVERTISING</p><h2 id="ad-editor-title">Manage homepage ads</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Close ad editor">×</button></div>
    <p>These banners fade automatically below the homepage status banner. Add, reorder, hide, replace or delete them here.</p>
    <section className="ad-editor-settings" aria-label="Ad rotation settings">
      <label>Seconds between ads<input type="range" min="3" max="20" step="1" value={seconds} onChange={e => setSeconds(Number(e.target.value))}/><output>{seconds}s</output></label>
      <button type="button" disabled={busy || seconds === collection.settings?.autoplaySeconds} onClick={saveTiming}>Save timing</button>
    </section>
    <section className="ad-editor-list" aria-label="Published ads">
      {collection.ads.length ? collection.ads.map((ad, index) => <AdRow key={ad.id} ad={ad} first={index === 0} last={index === collection.ads.length - 1} collection={collection} publish={publish} move={move} remove={remove}/>) : <p>No ads are published. Add one below.</p>}
    </section>
    <section className="ad-editor-add">
      <h3>Add advertisement</h3>
      <label>Banner artwork<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)}/></label>
      <label>Ad name<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)}/></label>
      <label>Image description<input value={alt} maxLength={240} onChange={e => setAlt(e.target.value)}/></label>
      <label>Click destination<input value={link} maxLength={1000} placeholder="/contact or https://…" onChange={e => setLink(e.target.value)}/></label>
      <button type="button" disabled={busy || !file || !title.trim() || !alt.trim()} onClick={add}>{busy ? 'Publishing…' : '+ Add ad'}</button>
    </section>
    {error && <p className="ad-editor-error" role="alert">{error}</p>}
    <div className="ad-editor-footer"><button type="button" disabled={busy} onClick={close}>Done</button></div>
  </dialog>;
}

export default function HomeAdCarousel() {
  const { user } = useBravo();
  const canEdit = isImageEditor(user) && !user?.mustChangePassword;
  const [collection, setCollection] = useState(initialCollection), [active, setActive] = useState(0), [editing, setEditing] = useState(false), [reduced, setReduced] = useState(false), [focused, setFocused] = useState(false);
  const hold = useRef(null), origin = useRef(null), suppressUntil = useRef(0);
  const cancelHold = () => { clearTimeout(hold.current); hold.current = null; };
  useEffect(() => {
    let live = true;
    api('/site-ads').then(data => { if (live && Array.isArray(data.ads)) setCollection(data); }).catch(() => {});
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches || document.documentElement.classList.contains('access-reduced-motion')); changed(); media.addEventListener('change', changed);
    const observer = new MutationObserver(changed); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { live = false; cancelHold(); observer.disconnect(); media.removeEventListener('change', changed); };
  }, []);
  const slides = collection.ads.filter(ad => ad.enabled !== false && ad.src);
  useEffect(() => { if (active >= slides.length) setActive(0); }, [active, slides.length]);
  useEffect(() => {
    if (slides.length < 2 || reduced || editing || focused) return;
    const timer = setInterval(() => setActive(index => (index + 1) % slides.length), Math.max(3, collection.settings?.autoplaySeconds || 7) * 1000);
    return () => clearInterval(timer);
  }, [slides.length, reduced, editing, focused, collection.settings?.autoplaySeconds]);
  async function openEditor() {
    if (!canEdit) return;
    cancelHold(); suppressUntil.current = Date.now() + 1200;
    try { setCollection(await api('/site-ads')); } catch { /* keep current snapshot */ }
    setEditing(true);
  }
  if (!slides.length && !canEdit) return null;
  return <>
    <section className="home-ad-carousel" aria-label="Bravo announcements and promotions" data-ad-editable={canEdit || undefined}
      onPointerDown={event => { if (!canEdit || event.button !== 0 || event.isPrimary === false) return; origin.current = { x: event.clientX, y: event.clientY }; cancelHold(); hold.current = setTimeout(openEditor, 650); }}
      onPointerMove={event => { if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 12) cancelHold(); }}
      onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
      onContextMenu={event => { if (canEdit) event.preventDefault(); }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onClickCapture={event => { if (Date.now() < suppressUntil.current) { event.preventDefault(); event.stopPropagation(); } }}>
      {slides.length ? <div className="home-ad-frame">
        <div className="home-ad-track">
          {slides.map((ad, index) => { const current = index === active; return <article className={`home-ad-slide${current ? ' is-active' : ''}`} key={ad.id} aria-hidden={current ? undefined : true}>
            <div className="home-ad-fallback" aria-hidden="true"><strong>BRAVO K9 SOLUTIONS</strong><b>SATURDAY</b><span>DOG TRAINING WORKSHOP</span><small>Hands-on training · Real-world skills · A safer community</small></div>
            {ad.link ? <a href={ad.link} aria-label={ad.title} tabIndex={current ? undefined : -1}><img src={ad.src} width="1320" height="510" loading={index === 0 ? 'eager' : 'lazy'} draggable="false" alt={ad.alt} onError={e => e.currentTarget.closest('.home-ad-slide')?.classList.add('is-image-missing')}/></a> : <img src={ad.src} width="1320" height="510" loading={index === 0 ? 'eager' : 'lazy'} draggable="false" alt={ad.alt} onError={e => e.currentTarget.closest('.home-ad-slide')?.classList.add('is-image-missing')}/>}
          </article>; })}
        </div>
        {canEdit && <span className="home-ad-admin-hint">Press and hold to manage ads</span>}
      </div> : <button type="button" className="home-ad-empty" onClick={openEditor}>Add homepage advertisement</button>}
    </section>
    {editing && canEdit && <AdEditor collection={collection} publish={setCollection} close={() => setEditing(false)}/>}
  </>;
}
