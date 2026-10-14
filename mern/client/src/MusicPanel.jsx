import { lazy, Suspense, useEffect, useState } from 'react';
import { useBravo } from './context';
import { isImageEditor } from '../../shared/site-images.js';
const MusicEditor = lazy(() => import('./MusicEditor'));
export default function MusicPanel() {
  const { user } = useBravo();
  const [status, setStatus] = useState({ playing: false, muted: false, volume: .72, title: '', available: false });
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const update = event => setStatus(event.detail);
    window.addEventListener('bravo-music-status', update);
    window.dispatchEvent(new CustomEvent('bravo-music-command', { detail: { action: 'status' } }));
    return () => window.removeEventListener('bravo-music-status', update);
  }, []);
  useEffect(() => {
    const open = () => { if (isImageEditor(user) && !user?.mustChangePassword) setEditing(true); };
    window.addEventListener('bravo-manage-music', open);
    return () => window.removeEventListener('bravo-manage-music', open);
  }, [user]);
  const command = (action, value) => window.dispatchEvent(new CustomEvent('bravo-music-command', { detail: { action, value } }));
  return <div className="music-panel">
    <strong>Bravo music</strong><p aria-live="polite">{status.title || 'No songs enabled'}</p>
    <div className="music-buttons"><button type="button" disabled={!status.available} onClick={() => command('toggle')}>{status.playing ? 'Pause music' : 'Enable Music'}</button><button type="button" disabled={!status.available} onClick={() => command('next')}>Next song</button><button type="button" aria-pressed={status.muted} onClick={() => command('mute')}>{status.muted ? 'Unmute music' : 'Mute music'}</button></div>
    <label>Music volume<input aria-label="Music volume" type="range" min="0" max="1" step=".05" value={status.volume} onChange={e => command('volume', Number(e.target.value))}/></label>
    {isImageEditor(user) && !user?.mustChangePassword && <button type="button" onClick={() => setEditing(true)}>Manage Music</button>}
    {editing && <Suspense fallback={<p role="status">Opening music editor…</p>}><MusicEditor close={() => setEditing(false)}/></Suspense>}
  </div>;
}
