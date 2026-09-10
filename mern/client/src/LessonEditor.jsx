import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';

const emptyLesson = () => ({ _id: '', title: '', category: 'Foundations', instructor: 'David Northrop', image: '/images/training-education.webp', videoFile: '', captionFile: '', transcript: '', published: false });
const images = ['training-education', 'hero-bravo-k9', 'obedience-real-world', 'dog-sitting-care', 'tracking-training', 'service-dog-training'];

export default function LessonEditor() {
  const [lessons, setLessons] = useState([]), [draft, setDraft] = useState(null), [isNew, setNew] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const load = () => api('/admin/lessons').then(data => setLessons(data.lessons));
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function choose(lesson, fresh = false) {
    if (dirty && !window.confirm('Discard the unsaved lesson changes?')) return;
    setDraft({ ...emptyLesson(), ...lesson }); setNew(fresh); setDirty(false); setError(''); setNotice('');
  }
  function field(name, value) { setDraft(d => ({ ...d, [name]: value })); setDirty(true); }
  async function save(published) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (isNew && lessons.some(l => l._id === draft._id)) throw new Error('That lesson ID is already in use. Choose another ID.');
      const { _id, ...body } = draft;
      await api(`/admin/lessons/${encodeURIComponent(_id)}`, { method: 'PUT', body: { ...body, published } });
      setDraft(d => ({ ...d, published })); setNew(false); setDirty(false);
      setNotice(published ? 'Lesson published for online members.' : 'Draft saved. This lesson is not playable by members.');
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section id="lesson-editor" className="panel">
    <div className="section-label"><h2>Lesson studio.</h2><button className="button button-small button-ghost" disabled={busy} onClick={() => choose(emptyLesson(), true)}>New lesson</button></div>
    <p>Prepare lesson details and transcripts here. Save drafts while your recordings and captions are being prepared.</p>
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    <label>Choose a lesson<select value={draft?._id || ''} disabled={busy} onChange={e => { const lesson = lessons.find(l => l._id === e.target.value); if (lesson) choose(lesson); }}><option value="">Select a lesson to edit</option>{lessons.map(l => <option key={l._id} value={l._id}>{l.title} — {l.published ? 'Published' : 'Draft'}</option>)}</select></label>
    {draft && <form onSubmit={e => { e.preventDefault(); save(false); }}>
      <div className="form-grid">
        <label>Lesson ID<input value={draft._id} disabled={!isNew || busy} onChange={e => field('_id', e.target.value)} pattern="[a-z0-9-]{1,80}" maxLength="80" required placeholder="loose-leash-basics"/><span className="helper">Lowercase letters, numbers, and hyphens.</span></label>
        <label>Title<input value={draft.title} onChange={e => field('title', e.target.value)} maxLength="120" required/></label>
        <label>Topic<input value={draft.category} onChange={e => field('category', e.target.value)} maxLength="40" required/></label>
        <label>Instructor<input value={draft.instructor} onChange={e => field('instructor', e.target.value)} maxLength="80" required/></label>
        <label>Cover image<select value={draft.image} onChange={e => field('image', e.target.value)}>{images.map(i => <option key={i} value={`/images/${i}.webp`}>{i.replaceAll('-', ' ')}</option>)}</select></label>
      </div>
      <img className="lesson-cover-preview" src={draft.image} alt="Selected lesson cover" width="320" height="180"/>
      <label>Written transcript<textarea rows="12" value={draft.transcript} maxLength="20000" onChange={e => field('transcript', e.target.value)} placeholder="Add the complete lesson transcript. Drafts can be saved before the transcript is finished."/></label>
      <details><summary>Private media & publishing</summary><p className="helper">Publishing requires a video and English captions installed in private media storage. These fields reference existing files; they do not upload recordings. Public video links are not accepted.</p><div className="form-grid"><label>Video filename<input value={draft.videoFile} maxLength="160" onChange={e => field('videoFile', e.target.value)} placeholder="lesson.mp4"/></label><label>Caption filename<input value={draft.captionFile} maxLength="160" onChange={e => field('captionFile', e.target.value)} placeholder="lesson.vtt"/></label></div><button type="button" className="button button-ghost" disabled={busy || !draft._id || !draft.title || !draft.transcript.trim()} onClick={() => { if (window.confirm('Publish this lesson for members? The video and captions must be ready.')) save(true); }}>Publish lesson</button></details>
      <div className="record-actions"><button className="button" disabled={busy}>{busy ? 'Saving…' : draft.published ? 'Save as unpublished draft' : 'Save draft'}</button><span className="helper">{dirty ? 'Unsaved changes' : draft.published ? 'Published' : 'Draft'}</span></div>
    </form>}
  </section>;
}
