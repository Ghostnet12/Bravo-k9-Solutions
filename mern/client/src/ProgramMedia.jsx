import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from './api';
import { useBravo } from './context';
import { useSiteContent, Editable } from './SiteContent';
import { isImageEditor } from '../../shared/site-images';
const VideoEditor = lazy(() => import('./ProofVideoEditor'));
export default function ProgramMedia({ goal, automaticClip }) {
  const { user } = useBravo(), owner = isImageEditor(user) && !user?.mustChangePassword;
  const { entries, publishEntry } = useSiteContent();
  const key = `goal-${goal.id}-media`, kind = entries[key]?.value?.mediaKind || 'automatic';
  const [video, setVideo] = useState(null), [editing, setEditing] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  useEffect(() => { let live = true; api('/program-videos').then(data => { if (live) setVideo(data.clips?.find(item => item.id === goal.id) || null); }).catch(() => { if(live)setError('Program media could not load. Reload to try again.'); }); return () => { live = false; }; }, [goal.id]);
  async function selectKind(next) {
    setBusy(true); setError(''); setStatus('');
    try {
      const baseline = entries[key] || {revision:0,value:{}};
      const data = await api(`/site-content/${key}`, {method:'PUT',body:{expectedRevision:baseline.revision,value:{...baseline.value,mediaKind:next}}});
      publishEntry(key,data.entry); setStatus('Program media selection published.');
    } catch(cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function editVideo() {
    setBusy(true);setError('');
    try { const data=await api('/program-videos'); const current=data.clips?.find(item=>item.id===goal.id); setVideo(current || null);setEditing(current || {id:goal.id,title:goal.title,description:goal.description,order:0,revision:0,src:null}); }
    catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  const clip = kind === 'photo' ? null : kind === 'video' ? video : automaticClip;
  return <div className="program-media">
    {owner && <div className="program-media-tools" data-site-image-ignore="" aria-label={`Edit ${goal.label} media`}>
      <label>Program photo or video<select aria-label="Program photo or video" value={kind} disabled={busy} onChange={event=>selectKind(event.target.value)}><option value="automatic">Suggested training video</option><option value="photo">Program photo</option><option value="video" disabled={!video}>Program video</option></select></label>
      <button type="button" disabled={busy} onClick={editVideo}>{video ? 'Edit program video' : 'Upload program video'}</button>
      {kind === 'photo' && <button type="button" disabled={busy} onClick={()=>window.dispatchEvent(new CustomEvent('bravo-edit-photo',{detail:{key:`program-${goal.id}`}}))}>Edit program photo</button>}
      <button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('bravo-content-edit',{detail:{key:`goal-${goal.id}-copy`}}))}>Edit program text</button>
      <p role="status">{busy?'Saving…':status}</p>{error && <p role="alert">{error}</p>}
    </div>}
    {clip ? <figure className="goal-proof" data-site-image-ignore="">{clip.src ? <video key={clip.src} src={clip.src} poster={clip.poster || undefined} controls playsInline preload="none" aria-label={clip.title}/> : <a href={clip.facebookUrl}><img src={clip.poster || '/images/bravo-client-training.jpeg'} width="640" height="420" loading="lazy" alt={clip.title}/><span>Watch on Facebook ↗</span></a>}<figcaption><strong>{clip.title}</strong><p>{clip.description}</p><a href="/#reviews">Explore more training videos →</a></figcaption></figure> : <div className="goal-consult"><img key={`${goal.id}-${kind}`} data-site-image-ignore={kind !== 'photo' ? '' : undefined} data-site-image-key={kind === 'photo' ? `program-${goal.id}` : undefined} src="/images/bravo-client-training.jpeg" width="828" height="1121" loading="lazy" alt={`${goal.label}: Bravo training in an everyday public setting`}/><div><Editable as="strong" contentKey="goal-consult-title" canEditText>Let’s talk about your dog.</Editable><Editable as="p" contentKey="goal-consult-copy" canEditText>Not sure where to begin? We’ll help you choose.</Editable><a href="tel:+16058242767">Call (605) 824-2767</a></div></div>}
    {owner && editing && <Suspense fallback={<p role="status">Opening video editor…</p>}><VideoEditor apiBase="/program-videos" clip={editing} onClose={()=>setEditing(null)} onSaved={saved=>{setVideo(saved);setEditing(null);selectKind('video');}}/></Suspense>}
  </div>;
}
