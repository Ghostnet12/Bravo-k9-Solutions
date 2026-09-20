import { useEffect, useState } from 'react';
import { api } from './api';
import { useBravo } from './context';
import { Notice } from './ui';
import { money } from '../../shared/catalog';
export default function LessonLibraryControls({ onChange }) {
  const { refreshConfig } = useBravo();
  const [library, setLibrary] = useState(null), [sections, setSections] = useState([]), [draft, setDraft] = useState(null);
  const [pendingCheckouts, setPendingCheckouts] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function load() { const data = await api('/admin/lesson-library'); setLibrary(data.library); setPendingCheckouts(data.library.pendingCheckouts || 0); setSections(data.sections); }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function act(work) { setBusy(true); setError(''); setNotice(''); try { await work(); await load(); await refreshConfig(); onChange(); } catch(e) { setError(e.message); await load().catch(()=>{}); } finally { setBusy(false); } }
  function setOpen(open) { return act(async () => {
    const result = await api('/admin/lesson-library', { method: 'PUT', body: { open, expectedRevision: library.revision } });
    setPendingCheckouts(result.pendingCheckouts || 0);
    setNotice(result.pendingCheckouts ? `Library closed. ${result.pendingCheckouts} existing checkout link(s) could not be expired. Use Retry closing checkout links; these links expire within 30 minutes.` : open ? 'Library open. Clients can browse and purchase access.' : 'Library closed. Lessons and purchase options are hidden from clients.');
  }); }
  return <section className="lesson-library-controls" aria-label="Lesson library settings">
    <h3>Open when you’re ready.</h3>
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    {library && <><label className="check-label library-switch"><input type="checkbox" role="switch" checked={library.open} disabled={busy} onChange={e => setOpen(e.target.checked)}/>{library.open ? 'Library open' : 'Library closed'}</label>
    {pendingCheckouts > 0 && !library.open && <><p role="status">{pendingCheckouts} previous checkout link(s) still need to close. Automatic retries run while the site is being used; you can retry now.</p><button type="button" className="quiet-button" disabled={busy} onClick={()=>setOpen(false)}>Retry closing checkout links</button></>}<p>Lessons: <strong>{money(library.lessonCents)}/month</strong> · Training + lessons: <strong>{money(library.bundleCents)}/month</strong> for one dog. Additional training dogs are $100/month each. Monthly access renews manually.</p>
    <p className="helper">Closed means only owners and administrators can view and edit the library. Purchase options disappear too. Closing does not cancel memberships, pause their end dates, or issue refunds.</p></>}
    <div className="section-label"><h3>Library sections</h3><button type="button" className="button button-small" disabled={busy} onClick={()=>setDraft({_id:'',title:'',description:'',order:sections.length})}>Add section</button></div>
    {sections.length ? <ul className="lesson-section-list">{sections.map(section=><li key={section._id}><span><strong>{section.title}</strong><small>{section.description}</small></span><button type="button" className="quiet-button" disabled={busy} onClick={()=>setDraft(section)}>Edit section</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>act(async()=>{await api(`/admin/lesson-sections/${section._id}`,{method:'DELETE',body:{}});setNotice('Empty section removed.');})}>Remove empty section</button></li>)}</ul> : <p>Add sections such as Foundations, Leash Skills, or Everyday Behavior, then place lessons inside them.</p>}
    {draft && <form onSubmit={e=>{e.preventDefault();act(async()=>{const {_id,...body}=draft;await api(`/admin/lesson-sections${_id?'/'+_id:''}`,{method:_id?'PUT':'POST',body});setDraft(null);setNotice('Section saved.');});}}><fieldset disabled={busy} className="editor-fields"><label>Section name<input required maxLength="80" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Section description<textarea maxLength="1000" value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label><label>Section order<input type="number" min="0" max="9999" required value={draft.order} onChange={e=>setDraft({...draft,order:Number(e.target.value)})}/></label><div className="record-actions"><button className="button">Save section</button><button type="button" className="quiet-button" onClick={()=>setDraft(null)}>Cancel</button></div></fieldset></form>}
  </section>;
}
