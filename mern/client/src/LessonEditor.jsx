import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';

const emptyLesson = () => ({ _id: '', title: '', category: 'Foundations', instructor: 'David Northrop', image: '/images/training-education.webp', videoFile: '', captionFile: '', transcript: '', published: false, media: {} });
const images = ['training-education', 'hero-bravo-k9', 'obedience-real-world', 'tracking-training', 'service-dog-training'];
const mediaRules = { video: { accept: 'video/mp4,video/webm', label: 'Lesson video', max: 80 * 1024 * 1024 }, captions: { accept: '.vtt,text/vtt', label: 'English captions (.vtt)', max: 1024 * 1024 }, image: { accept: 'image/jpeg,image/png,image/webp', label: 'Cover photo', max: 3 * 1024 * 1024 } };

function base64(bytes) { let value = ''; const view = new Uint8Array(bytes); for (let index = 0; index < view.length; index += 8192) value += String.fromCharCode(...view.subarray(index, index + 8192)); return btoa(value); }

export default function LessonEditor() {
  const [lessons, setLessons] = useState([]), [draft, setDraft] = useState(null), [isNew, setNew] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [progress, setProgress] = useState('');
  const load = () => api('/admin/lessons').then(data => { setLessons(data.lessons); return data.lessons; });
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  useEffect(() => { if (!dirty) return; const warn = e => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  function choose(lesson, fresh = false) { if (dirty && !window.confirm('Discard the unsaved lesson changes?')) return; setDraft({ ...emptyLesson(), ...lesson }); setNew(fresh); setDirty(false); setError(''); setNotice(''); }
  function field(name, value) { setDraft(current => ({ ...current, [name]: value })); setDirty(true); }
  async function save(published) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (isNew && lessons.some(l => l._id === draft._id)) throw new Error('That lesson ID is already in use. Choose another ID.');
      const { _id, media, ...body } = draft;
      await api(`/admin/lessons/${encodeURIComponent(_id)}`, { method: 'PUT', body: { ...body, published } });
      const next = await load(); const saved = next.find(lesson => lesson._id === _id); setDraft({ ...emptyLesson(), ...saved }); setNew(false); setDirty(false);
      setNotice(published ? 'Lesson published for online members.' : 'Draft saved. You can now upload its private media.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function upload(kind, file) {
    if (!file) return; if (dirty) return setError('Save the lesson changes before uploading.'); const rule = mediaRules[kind];
    if (file.size > rule.max) return setError(`${rule.label} is too large.`);
    setBusy(true); setError(''); setNotice('');
    try {
      const chunkSize = 400 * 1024, chunks = Math.ceil(file.size / chunkSize);
      const start = await api('/admin/media/start', { method: 'POST', body: { lessonId: draft._id, kind, filename: file.name, contentType: file.type || (kind === 'captions' ? 'text/vtt' : 'application/octet-stream'), size: file.size, chunks } });
      for (let index = 0; index < chunks; index++) { const bytes = await file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)).arrayBuffer(); await api(`/admin/media/${start.uploadId}/chunks/${index}`, { method: 'PUT', body: { data: base64(bytes) } }); setProgress(`${rule.label}: ${Math.round(((index + 1) / chunks) * 100)}%`); }
      await api(`/admin/media/${start.uploadId}/complete`, { method: 'POST', body: {} });
      const next = await load(); setDraft({ ...emptyLesson(), ...next.find(lesson => lesson._id === draft._id) }); setNotice(`${rule.label} uploaded. Review the lesson and publish when ready.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); setProgress(''); }
  }
  async function removeMedia(kind) { if (dirty) return setError('Save your lesson changes before removing media.'); if (!window.confirm(`Permanently remove this ${mediaRules[kind].label.toLowerCase()}? Keep a copy of your original file.`)) return; setBusy(true); try { await api(`/admin/lessons/${draft._id}/media/${kind}`, { method: 'DELETE', body: {} }); const next = await load(); setDraft({ ...emptyLesson(), ...next.find(lesson => lesson._id === draft._id) }); setNotice('Media removed.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <section id="lesson-editor" className="panel lesson-studio">
    <div className="section-label"><div><p className="kicker gold">STAFF CONTENT TOOLS</p><h2>Lesson studio.</h2></div><button className="button button-small button-ghost" disabled={busy} onClick={() => choose(emptyLesson(), true)}>New lesson</button></div>
    <p>Create the lesson first, then upload its cover, video, and captions. New lesson videos stay private until you publish. Replacing a video or captions returns that lesson to draft.</p><Notice error>{error}</Notice><Notice>{notice || progress}</Notice>
    <label>Choose a lesson<select value={draft?._id || ''} disabled={busy} onChange={e => { const lesson = lessons.find(l => l._id === e.target.value); if (lesson) choose(lesson); }}><option value="">Select a lesson to edit</option>{lessons.map(l => <option key={l._id} value={l._id}>{l.title} — {l.published ? 'Published' : 'Draft'}</option>)}</select></label>
    {draft && <form onSubmit={e => { e.preventDefault(); save(false); }}><fieldset disabled={busy} className="editor-fields"><div className="form-grid"><label>Lesson ID<input value={draft._id} disabled={!isNew || busy} onChange={e => field('_id', e.target.value)} pattern="[a-z0-9-]{1,80}" maxLength="80" required placeholder="loose-leash-basics"/></label><label>Title<input value={draft.title} onChange={e => field('title', e.target.value)} maxLength="120" required/></label><label>Topic<input value={draft.category} onChange={e => field('category', e.target.value)} maxLength="40" required/></label><label>Instructor<input value={draft.instructor} onChange={e => field('instructor', e.target.value)} maxLength="80" required/></label><label>Built-in cover<select value={draft.image.startsWith('/images/') ? draft.image : '/images/training-education.webp'} onChange={e => field('image', e.target.value)}>{images.map(i => <option key={i} value={`/images/${i}.webp`}>{i.replaceAll('-', ' ')}</option>)}</select></label></div>
      <div className="lesson-cover-wrap"><img className="lesson-cover-preview" src={draft.image} alt="Selected lesson cover" width="640" height="360"/></div>
      <label>Written transcript<textarea rows="10" value={draft.transcript} maxLength="20000" onChange={e => field('transcript', e.target.value)} placeholder="Add the complete lesson transcript for accessible reading."/></label>
      {!isNew && <section className="media-uploader" aria-label="Lesson media uploads">{Object.entries(mediaRules).map(([kind, rule]) => <div className="media-upload-row" key={kind}><div><strong>{rule.label}</strong><small>{draft.media?.[kind]?.filename || 'Not uploaded yet'}</small></div><label className="button button-small button-ghost">{draft.media?.[kind] ? 'Replace' : 'Upload'}<input className="sr-only" type="file" accept={rule.accept} disabled={busy || dirty} onChange={e => { upload(kind, e.target.files?.[0]); e.target.value = ''; }}/></label>{draft.media?.[kind] && <button type="button" className="quiet-button" disabled={busy} onClick={() => removeMedia(kind)}>Remove</button>}</div>)}</section>}
      <p className="helper">MP4/WebM video: up to 80 MB · JPEG/PNG/WebP photo: 3 MB · VTT captions: 1 MB. Keep your originals; replacing or removing a file deletes the stored copy.</p>{isNew && <Notice>Save this lesson as a draft to unlock media uploads.</Notice>}
      {!isNew && draft.media?.video && <video className="staff-video-preview" controls preload="none" src={`/api/lessons/${draft._id}/video`}><track kind="captions" src={`/api/lessons/${draft._id}/captions`} srcLang="en" label="English" default/></video>}<div className="record-actions"><button className="button" disabled={busy}>{busy ? 'Working…' : 'Save draft'}</button><button type="button" className="button button-ghost" disabled={busy || isNew || !draft.transcript.trim() || !draft.media?.video || !draft.media?.captions} onClick={() => save(true)}>Publish lesson</button><span className="helper">{dirty ? 'Unsaved changes' : draft.published ? 'Published' : 'Draft'}</span></div>
    </fieldset></form>}
  </section>;
}
