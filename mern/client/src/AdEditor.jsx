import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { DEFAULT_AD_CAROUSEL } from '../../shared/site-ads.js';
import { optimizeSitePhoto } from './site-image-editor.js';
import './home-ad-carousel.css';

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
    <div className="ad-editor-fields">{ad.scheduleHidden && <p role="status">This workshop ad is paused for the current schedule. Publish the workshop and replace dated artwork with date-free artwork to display it.</p>}
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

export default function AdEditor({ collection, publish, close }) {
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
    if (!window.confirm(`Delete “${name}” from the website ad rotation?`)) return;
    setBusy(true); setError('');
    try { publish(await api(`/site-ads/${id}`, { method: 'DELETE', body: { expectedRevision: collection.revision } })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function saveTiming() { await order(collection.ads.map(ad => ad.id), seconds); }
  return <dialog ref={dialog} className="ad-editor-dialog" data-site-image-ignore="" aria-labelledby="ad-editor-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <div className="ad-editor-heading"><div><p>BRAVO · SITE ADVERTISING</p><h2 id="ad-editor-title">Manage advertisements</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Close ad editor">×</button></div>
    <p>These ads rotate across the website, including Bravo Live. Videos play muted. Add as many ads as you need, then reorder, hide, replace or delete them here.</p>
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

