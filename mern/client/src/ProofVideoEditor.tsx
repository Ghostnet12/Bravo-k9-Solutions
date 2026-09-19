import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { SITE_VIDEO_MAX_BYTES, MEDIA_CHUNK_BYTES } from '../../shared/site-images.js';
import { proofVideoType, normalizeFacebookReelUrl } from '../../shared/proof-videos.js';
import type { ProofClip } from './ProofVideoCarousel';
import './site-image-editor.css';

function base64(buffer: ArrayBuffer) {
  let value = ''; const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
function thumbnail(video: HTMLVideoElement | null) {
  if (!video || video.readyState < 2 || !video.videoWidth) return undefined;
  const canvas = document.createElement('canvas'), scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  try {
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.72).split(',')[1];
    return data.length <= 256 * 1024 ? data : undefined;
  } catch { return undefined; }
}
export default function ProofVideoEditor({ clip, onClose, onSaved, onRemoved, apiBase = '/proof-videos' }: { apiBase?: '/proof-videos' | '/hero-videos'; clip: ProofClip; onClose: () => void; onSaved: (clip: ProofClip) => void; onRemoved: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), preview = useRef<HTMLVideoElement>(null), mounted = useRef(true);
  const [title, setTitle] = useState(clip.title), [description, setDescription] = useState(clip.description), [fit, setFit] = useState(clip.fit || 'contain');
  const [selectedPoster, setSelectedPoster] = useState<string | undefined>();
  const [file, setFile] = useState<File | null>(null), [source, setSource] = useState(''), [ready, setReady] = useState(false);
  const [sourceType, setSourceType] = useState(clip.facebookUrl ? 'facebook' : 'upload'), [facebookUrl, setFacebookUrl] = useState(clip.facebookUrl || '');
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState(''), [previewError, setPreviewError] = useState('');
  const saving = useRef(false), mutation = useRef(crypto.randomUUID());
  const upload = useRef<{ id: string; next: number } | null>(null);
  const isNew = !clip.src && !clip.facebookUrl;
  const isFacebook = sourceType === 'facebook', reelUrl = normalizeFacebookReelUrl(facebookUrl);
  const replacingUpload = !isFacebook && !!file;
  const changed = !!selectedPoster || (isFacebook ? reelUrl !== clip.facebookUrl : !!file) || title !== clip.title || description !== clip.description || fit !== (clip.fit || 'contain');
  const canPublish = changed && !!title.trim() && (isFacebook ? !!reelUrl : file ? ready : !!clip.src);
  useEffect(() => {
    mounted.current = true; const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { mounted.current = false; dialog.current?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); setSource(url); setReady(false); setPreviewError('');
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (isFacebook || !file || ready || previewError) return;
    const timeout = setTimeout(() => setPreviewError('The preview could not load. Choose another video or export a compatible MP4 and try again.'), 15000);
    return () => clearTimeout(timeout);
  }, [file, ready, previewError, isFacebook]);
  const dirty = () => { mutation.current = crypto.randomUUID(); setError(''); };
  function changeSource(value: string) {
    dirty(); preview.current?.pause(); setSourceType(value); setPreviewError('');
    if (file && value === 'upload') setReady(false);
  }
  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]; event.target.value = '';
    if (!selected || saving.current) return;
    if (!selected.size || selected.size > SITE_VIDEO_MAX_BYTES || !proofVideoType(selected)) { setError('Choose an MP4, MOV or WebM video up to 80 MB.'); return; }
    dirty(); setSelectedPoster(undefined); upload.current = null; setReady(false); setFile(selected);
    if (!title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120));
  }
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || !canPublish) return;
    saving.current = true; setBusy(true); setError('');
    const posterData = !isFacebook ? selectedPoster || (replacingUpload ? thumbnail(preview.current) : undefined) : undefined;
    preview.current?.pause();
    try {
      if (!isFacebook && file) {
        const chunks = Math.ceil(file.size / MEDIA_CHUNK_BYTES);
        if (!upload.current) {
          setProgress('Starting upload…');
          const started = await api(`${apiBase}/${clip.id}/uploads`, { method: 'POST', body: { filename: file.name.slice(0, 160), contentType: proofVideoType(file), size: file.size, chunks } });
          upload.current = { id: started.uploadId, next: 0 };
        }
        for (let index = upload.current.next; index < chunks; index++) {
          if (!mounted.current) return;
          const data = base64(await file.slice(index * MEDIA_CHUNK_BYTES, (index + 1) * MEDIA_CHUNK_BYTES).arrayBuffer());
          await api(`${apiBase}/${clip.id}/uploads/${upload.current.id}/chunks/${index}`, { method: 'PUT', body: { data } });
          upload.current.next = index + 1;
          if (mounted.current) setProgress(`Uploading video: ${Math.round((index + 1) / chunks * 100)}%`);
        }
      }
      if (!mounted.current) return;
      setProgress('Publishing video and description…');
      const result = await api(`${apiBase}/${clip.id}`, { method: 'PUT', body: { expectedRevision: clip.revision, mutationId: mutation.current, title, description, fit, ...(isFacebook ? { facebookUrl: reelUrl } : file ? { uploadId: upload.current!.id, ...(posterData ? { posterData } : {}) } : posterData ? { posterData } : {}) } });
      if (mounted.current) onSaved(result.clip);
    } catch (cause: any) {
      if (mounted.current) { setError(cause.message); setProgress(''); }
      if (cause.status === 404) upload.current = null;
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  async function remove() {
    if (saving.current || !window.confirm(`Remove “${clip.title}” from the homepage?`)) return;
    saving.current = true; setBusy(true); setError('');
    try { await api(`${apiBase}/${clip.id}`, { method: 'DELETE', body: { expectedRevision: clip.revision } }); if (mounted.current) onRemoved(clip.id); }
    catch (cause: any) { if (mounted.current) setError(cause.message); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  return <dialog ref={dialog} className="site-photo-dialog proof-video-dialog" data-site-image-editor="" aria-labelledby="proof-editor-title" aria-busy={busy} onCancel={event => { event.preventDefault(); if (!saving.current) onClose(); }}>
    <form onSubmit={publish}>
      <div className="site-photo-heading"><div><p>BRAVO · VIDEO EDITOR</p><h2 id="proof-editor-title">{isNew ? 'Add a video' : 'Edit this video'}</h2></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close video editor">×</button></div>
      <p className="site-photo-intro">Upload a video or link a Facebook Reel, add its story, then publish it to the homepage.</p>
      <fieldset disabled={busy} className="proof-editor-fields">
        <fieldset className="proof-source-picker"><legend>Video source</legend><label><input type="radio" name="proof-video-source" value="upload" checked={!isFacebook} onChange={() => changeSource('upload')}/>Upload video</label><label><input type="radio" name="proof-video-source" value="facebook" checked={isFacebook} onChange={() => changeSource('facebook')}/>Facebook Reel URL</label></fieldset>
        {isFacebook ? <div className="site-photo-description"><label htmlFor="proof-facebook-url">Facebook Reel URL</label><input id="proof-facebook-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={2048} value={facebookUrl} placeholder="https://www.facebook.com/reel/…" aria-describedby="proof-facebook-help" onChange={event => { dirty(); setFacebookUrl(event.target.value); }}/><p id="proof-facebook-help" className="site-photo-note">Paste a public Reel link or a facebook.com/share/r/ link. Tapping the card opens Facebook in this tab; use Back to return to Bravo.</p>{facebookUrl.trim() && !reelUrl && <p className="site-photo-error" role="alert">Enter a Facebook Reel URL, such as facebook.com/reel/123456789/.</p>}</div> : <>
        <div className="site-photo-pickers"><label>Photo / Video Library<input type="file" accept="video/*" aria-label="Choose video from your photo library" onChange={choose}/></label><label>Browse Files<input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" aria-label="Choose video from files" onChange={choose}/></label></div>
        <p className="site-photo-filename">{file?.name || (isNew ? 'No video selected yet.' : 'Keep the existing video or choose a replacement.')}</p>
        {(source || clip.src) ? <div className="site-photo-frame proof-video-preview"><video key={source || clip.src} ref={preview} className="site-media-preview" src={source || clip.src!} poster={!file ? clip.poster || undefined : undefined} controls playsInline muted preload="auto" style={{ objectFit: fit }} aria-label="Video preview" onLoadedMetadata={event => { if (file) { setReady(true); setPreviewError(''); event.currentTarget.currentTime = Math.min(0.1, event.currentTarget.duration / 2 || 0); } }} onError={() => { if (file) setReady(false); setPreviewError('This browser cannot preview that video format. Choose another video or export an MP4 using H.264.'); }}/></div> : clip.poster ? <img className="proof-video-existing-poster" src={clip.poster} alt="Current video thumbnail"/> : null}
        </>}
        {!isFacebook && (source || clip.src) && <><button type="button" onClick={()=>{const frame=thumbnail(preview.current);if(frame){dirty();setSelectedPoster(frame);setError('');}else setError('Play or seek the preview to a clear frame, then try again.');}}>Use current video frame as cover</button><p className="site-photo-note">Pause on a clear view of the dog and trainer, then choose it as the cover.</p>{selectedPoster && <img className="proof-video-existing-poster" alt="Selected video cover" src={`data:image/jpeg;base64,${selectedPoster}`}/>}</>}
        <label className="site-photo-description">Video title<input type="text" required maxLength={120} value={title} onChange={event => { dirty(); setTitle(event.target.value); }}/></label>
        <div className="site-photo-description"><label htmlFor="proof-video-description">Description</label><textarea id="proof-video-description" rows={4} maxLength={5000} value={description} placeholder="Starting challenge → what we practiced → progress visible in this clip." onChange={event => { dirty(); setDescription(event.target.value); }}/></div>
        {!isFacebook && <label className="site-photo-description">Video fit<select value={fit} onChange={event => { dirty(); setFit(event.target.value as 'contain' | 'cover'); }}><option value="contain">Show the whole video</option><option value="cover">Fill the frame</option></select></label>}
      </fieldset>
      <p className="site-photo-note">{!isFacebook && 'Up to 80 MB per video. MP4 works best across devices; MOV and WebM can also be selected. '}Describe the starting challenge, what you practiced, and the progress this clip actually shows. Include a timeframe only when known. Changes go live when you publish.</p>
      <p className="proof-upload-progress" role="status" aria-live="polite">{progress || (!isFacebook && file && !ready && !previewError ? 'Preparing video preview…' : '')}</p>
      {(error || previewError) && <p className="site-photo-error" role="alert">{error || previewError}</p>}
      <div className="site-photo-actions">{!isNew && <button type="button" disabled={busy} onClick={remove}>Remove video</button>}<button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="site-photo-publish" disabled={busy || !canPublish}>{busy ? 'Publishing…' : isNew ? 'Publish video' : 'Publish changes'}</button></div>
    </form>
  </dialog>;
}
