import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { MUSIC_MAX_BYTES } from '../../shared/music-playlist.js';
import './music.css';
export default function MusicEditor({ close }) {
  const dialog = useRef(null), urls = useRef([]), drag = useRef(null);
  const [draft, setDraft] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState('');
  const [file, setFile] = useState(null), [title, setTitle] = useState(''), [preview, setPreview] = useState('');
  useEffect(() => {
    const prior = document.activeElement; dialog.current.showModal();
    window.dispatchEvent(new CustomEvent('bravo-audio-focus', { detail: { active: true } }));
    let current = true;
    api('/site-music').then(data => { if (current) setDraft(data); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; urls.current.forEach(URL.revokeObjectURL); prior?.focus?.(); window.dispatchEvent(new CustomEvent('bravo-audio-focus', { detail: { active: false } })); };
  }, []);
  const changeTracks = tracks => setDraft(old => ({ ...old, tracks, startId: tracks.some(t => t.id === old.startId && t.enabled) ? old.startId : tracks.find(t => t.enabled)?.id || '' }));
  const move = (from, to) => { if (from === null || to < 0 || to >= draft.tracks.length) return; const tracks = [...draft.tracks]; tracks.splice(to, 0, tracks.splice(from, 1)[0]); changeTracks(tracks); };
  function selectFile(e) {
    const chosen = e.target.files?.[0]; setError(''); setFile(null); setPreview('');
    if (!chosen) return;
    if (!/\.(mp3|m4a)$/i.test(chosen.name) || chosen.size > MUSIC_MAX_BYTES || chosen.size < 16) { setError('Choose an MP3 or M4A file up to 20 MB.'); return; }
    setFile(chosen); setTitle(chosen.name.replace(/\.[^.]+$/, '').slice(0, 100));
    const url = URL.createObjectURL(chosen); urls.current.push(url); setPreview(url);
  }
  async function add() {
    setBusy(true); setError('');
    try {
      const upload = await api('/site-music/uploads', { method: 'POST', body: { filename: file.name.slice(0, 160), contentType: /\.mp3$/i.test(file.name) ? 'audio/mpeg' : 'audio/mp4', size: file.size } });
      for (let start = 0, index = 0; start < file.size; start += upload.chunkSize, index++) {
        setProgress(`Uploading ${Math.round(start / file.size * 100)}%…`);
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file.slice(start, start + upload.chunkSize)); });
        await api(`/site-music/uploads/${upload.id}/chunks/${index}`, { method: 'PUT', body: { data } });
      }
      changeTracks([...draft.tracks, { id: upload.id, title: title.trim(), enabled: true, src: preview }]);
      setFile(null); setPreview(''); setTitle(''); setProgress('Song added to your draft. Publish playlist to make it live.');
    } catch (e) { setError(e.message || 'Upload failed. Please try again.'); }
    finally { setBusy(false); }
  }
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const saved = await api('/site-music', { method: 'PUT', body: { expectedRevision: draft.revision, enabled: draft.enabled, startId: draft.startId, tracks: draft.tracks.map(({ id, title, enabled }) => ({ id, title, enabled })) } });
      window.dispatchEvent(new CustomEvent('bravo-music-published', { detail: saved })); close();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return createPortal(<dialog ref={dialog} className="music-editor" aria-labelledby="music-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}><h2 id="music-title">Manage Music</h2>
    <p>Add regular or holiday songs, switch songs on or off, and arrange your lineup. Only upload music Bravo has permission to stream.</p>
    {error && <p role="alert">{error}</p>}
    {!draft ? <button type="button" onClick={close}>Close</button> : <form onSubmit={save}><fieldset disabled={busy}>
      <label><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })}/> Enable background music site-wide</label>
      <label>Starting song<select value={draft.startId} onChange={e => setDraft({ ...draft, startId: e.target.value })}><option value="">First enabled song</option>{draft.tracks.filter(t => t.enabled).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      <ol>{draft.tracks.map((track, index) => <li key={track.id} draggable onDragStart={() => { drag.current = index; }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); move(drag.current, index); drag.current = null; }}>
        <label>Song {index + 1}<input required maxLength={100} value={track.title} onChange={e => changeTracks(draft.tracks.map(t => t.id === track.id ? { ...t, title: e.target.value } : t))}/></label>
        <label><input type="checkbox" checked={track.enabled} onChange={e => changeTracks(draft.tracks.map(t => t.id === track.id ? { ...t, enabled: e.target.checked } : t))}/> Enabled</label>
        <audio controls preload="none" src={track.src} aria-label={`Preview ${track.title}`}/>
        <div className="music-buttons"><button type="button" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`Move ${track.title} up`}>Move Up</button><button type="button" disabled={index === draft.tracks.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move ${track.title} down`}>Move Down</button><button type="button" onClick={() => changeTracks(draft.tracks.filter(t => t.id !== track.id))}>Remove {track.title}</button></div>
      </li>)}</ol>
      <p>Removing a song changes this playlist only; its stored file is retained.</p>
      <label>Add a song (MP3 or M4A, up to 20 MB)<input type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4" onChange={selectFile}/></label>
      {file && <><label>New song title<input maxLength={100} value={title} onChange={e => setTitle(e.target.value)}/></label><audio controls preload="metadata" src={preview} aria-label="Preview new song"/><button type="button" disabled={!title.trim() || draft.tracks.length >= 50} onClick={add}>Add song to lineup</button></>}
      <div className="music-buttons"><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={!!file}>Publish playlist</button></div>
    </fieldset><p role="status">{busy ? progress || 'Publishing…' : progress}</p></form>}
  </dialog>, document.body);
}
