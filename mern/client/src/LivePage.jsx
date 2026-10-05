import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header, Footer } from './ui';
import { useBravo } from './context';
import { api } from './api';
import { useLiveSessions, useLiveClock, liveTime, liveDuration } from './live-state';
import { createViewer } from './live-direct';
import { claimLiveAudio, releaseLiveAudio } from './live-audio';
import './live.css';

function LivePlayer({ session, offset }) {
  const video = useRef(null), roomRef = useRef(null), generation = useRef(0);
  const [state, setState] = useState('idle'), [error, setError] = useState(''), [sound, setSound] = useState(false);
  const now = useLiveClock(offset), active = session.status === 'live';
  useEffect(() => {
    const element = video.current;
    const stop = () => { generation.current++; roomRef.current?.disconnect(); releaseLiveAudio(element); };
    const hide = () => { stop(); setState('ended'); };
    window.addEventListener('pagehide', hide);
    return () => { stop(); window.removeEventListener('pagehide', hide); };
  }, [session.id]);
  async function watch() {
    const current = ++generation.current; setState('connecting'); setError('');
    try {
      roomRef.current?.disconnect(); setSound(false); releaseLiveAudio(video.current);
      const room = createViewer(session.id,
        stream => { if (current === generation.current && video.current) { video.current.srcObject = stream; video.current.play().catch(() => {}); } },
        state => { if (current === generation.current) setState(state); },
        message => { if (current === generation.current) setError(message); });
      roomRef.current = room; await room.connect();
      if (current !== generation.current) { room.disconnect(); return; }
      setState(old => old === 'connecting' ? 'waiting' : old);
    } catch (error) { if (current === generation.current) { roomRef.current?.disconnect(); setState('ended'); setError(error.message || 'The stream could not connect. Try another network.'); } }
  }
  async function toggleSound() {
    if (!sound) { claimLiveAudio(video.current); video.current.muted = false; await video.current.play(); }
    else { video.current.muted = true; releaseLiveAudio(video.current); }
    setSound(!sound);
  }
  const connection = session.status === 'unavailable' ? 'Status unavailable' : !active ? 'Reconnecting' : state === 'watching' ? 'Connected' : state === 'reconnecting' ? 'Reconnecting' : state === 'ended' ? 'Connection ended' : state === 'idle' ? 'Ready to watch' : 'Connecting';
  return <section id="live-player" className="live-player" aria-label={`${session.trainerName} training ${session.dogName}`}>
    <div className="live-video-stage">
      <video ref={video} autoPlay playsInline muted={!sound} aria-label="Live training video"/>
      <div className="live-video-top">{active && state !== 'ended' ? <span className="live-badge"><i aria-hidden="true"/>LIVE</span> : <span className="live-connection-state">{connection}</span>}<span className="live-timer">{liveDuration(session.startedAt, now)}</span></div>
      {state !== 'watching' && <div className="live-video-cover"><img src="/bravo-shield-192.png" alt="" width="72" height="72"/>
        <h3>{state === 'idle' ? 'Step into the session.' : state === 'ended' ? 'This connection has ended.' : state === 'reconnecting' ? 'Reconnecting…' : 'Connecting to Bravo…'}</h3>
        {['idle', 'ended'].includes(state) && active && <button className="button" onClick={watch}>Watch live <span aria-hidden="true">▶</span></button>}
        {error && <p role="alert">{error}</p>}
      </div>}
    </div>
    <div className="live-player-caption"><div><h2>{session.trainerName} <span> / </span> {session.dogName}</h2>
      {session.trainingFocus && <p className="live-training-focus">{session.trainingFocus}</p>}
      <p>Started {liveTime(session.startedAt)} Central Time · {session.audience === 'client' ? 'Client session' : 'Public session'}</p><p role="status">{connection}</p></div>
      <div className="live-controls"><button onClick={() => toggleSound().catch(() => { video.current.muted = true; releaseLiveAudio(video.current); setError('Tap again to enable sound.'); })} disabled={state !== 'watching'} aria-pressed={sound}>{sound ? 'Mute audio' : 'Enable audio'}</button><button onClick={() => { const element = video.current; if (element?.webkitEnterFullscreen) element.webkitEnterFullscreen(); else element?.requestFullscreen?.().catch(() => setError('Full screen is unavailable in this browser.')); }} disabled={state !== 'watching'}>Full screen</button></div>
    </div><p className="live-caption-note">Direct phone stream. Quality depends on the trainer’s connection and audience size. If this network cannot connect, try Wi-Fi. Automatic captions and replays are not available.</p>
  </section>;
}
function TrainingHighlights() {
  const [clips, setClips] = useState([]), activeMedia = useRef(null);
  useEffect(() => { let active = true; api('/proof-videos').then(data => { if (active) setClips((data.clips || []).filter(clip => clip.src && !/sign up|signup|sale|register/i.test(clip.title) && /leash|training|puppy|first day|obedience|public|exposure/i.test(`${clip.title} ${clip.description}`)).slice(0, 3)); }).catch(() => {}); return () => { active = false; releaseLiveAudio(activeMedia.current); }; }, []);
  if (!clips.length) return null;
  return <section className="live-highlights" aria-label="Recorded Bravo training"><h2>TRAINING HIGHLIGHTS</h2><p>Recorded training · Real Bravo sessions, between broadcasts.</p><div>{clips.map(clip => <article key={clip.id}><video controls playsInline preload="none" poster={clip.poster || undefined} src={clip.src} aria-label={`Recorded training: ${clip.title}`} onPlay={event => { activeMedia.current = event.currentTarget; claimLiveAudio(event.currentTarget); }} onPause={event => releaseLiveAudio(event.currentTarget)} onEnded={event => releaseLiveAudio(event.currentTarget)} onError={() => setClips(old => old.filter(item => item.id !== clip.id))}/><h3>{clip.title}</h3><span>Recorded training</span></article>)}</div></section>;
}
export default function LivePage() {
  const { user } = useBravo(), { sessions, announcements, loading, error, availability, offset } = useLiveSessions();
  const [search, setSearch] = useSearchParams(), now = useLiveClock(offset);
  const visible = sessions.filter(session => session.startedAt && ['live', 'reconnecting', 'unavailable'].includes(session.status));
  const selected = visible.find(session => session.id === search.get('session') || session.trainerId === search.get('trainer')) || visible[0];
  const publicLive = visible.filter(session => session.status === 'live' && session.audience === 'public');
  const privateNotices = announcements.filter(item => item.audience === 'client' && !sessions.some(session => session.trainerId === item.trainerId));
  const available = availability === 'available';
  const requestedSession = search.get('session'), selectedId = selected?.id;
  useEffect(() => {
    // Persist the fallback after an ended selection. Otherwise that trainer
    // restarting can silently replace the stream the visitor is now watching.
    if (!loading && !error && available && requestedSession && selectedId && requestedSession !== selectedId) setSearch({ session: selectedId }, { replace: true });
  }, [loading, error, available, requestedSession, selectedId, setSearch]);
  return <><Header/><main id="main-content" tabIndex={-1} className="bravo-live-page">
    <section className="live-hero"><img className="live-hero-photo" src="/images/hero-bravo-launch.webp" width="1774" height="887" alt="A trainer and dog walking together in the field"/><div className="live-shell"><p className="live-eyebrow">TRUST. TRAIN. DEPLOY.</p><h1>BRAVO <em>LIVE</em></h1><h2>REAL TRAINING. RIGHT NOW.</h2><p>Watch our trainers in live sessions.<br/>See the Bravo difference as it happens.</p><div className="live-hero-actions">{publicLive.length > 0 && <a className="button" href="#live-player">Watch live ↓</a>}{!user && <Link className="live-text-link" to="/account">Client sign in →</Link>}{['staff', 'owner'].includes(user?.role) && <Link className="live-text-link" to="/live/studio">Go live ↗</Link>}</div></div></section>
    <noscript><p className="live-shell live-noscript">Enable JavaScript to check live status and watch public training. Client sessions require sign-in.</p></noscript>
    <div className="live-shell live-content"><div className="live-section-heading"><h2>LIVE SESSIONS</h2><span>REAL DOGS. REAL PROGRESS.</span></div>
      {error && <p className="notice notice-error" role="status">{error}</p>}
      {loading ? <p className="live-empty" role="status">Checking live sessions…</p> : <>
        {!available && !error && <p className="live-empty" role="status">Live status is temporarily unavailable. Please check again shortly.</p>}
        {!!visible.length && <><div className="live-session-list"><div className="live-session-header"><span>TRAINER</span><span>STATUS</span><span>DOG / FOCUS</span><span>STARTED · CT</span><span>LIVE FOR</span><span/></div>
          {visible.map(session => <button key={session.id} className={`live-session-row ${selected?.id === session.id ? 'is-selected' : ''}`} aria-pressed={selected?.id === session.id} onClick={() => setSearch({ session: session.id }, { replace: true })}>
            <strong>{session.trainerName}</strong><span className={session.status === 'live' ? 'live-status' : 'live-muted-status'}>{session.status === 'live' && <i aria-hidden="true"/>}{session.status === 'live' ? 'LIVE' : session.status.toUpperCase()}{session.audience === 'client' && <small>Client session</small>}</span><span>{session.dogName}{session.trainingFocus && <small>{session.trainingFocus}</small>}</span><span className="live-row-time">{liveTime(session.startedAt)}</span><span className="live-timer">{liveDuration(session.startedAt, now)}</span><span aria-hidden="true" className="live-row-arrow">›</span>
          </button>)}
        </div>{selected && <LivePlayer key={selected.id} session={selected} offset={offset}/>}</>}
        {!!privateNotices.length && <section className="live-client-notices" aria-label="Client sessions"><h2>CLIENT SESSIONS</h2>{privateNotices.map(item => <p key={item.trainerId}><strong>{item.trainerName}</strong> · Client session · {item.status === 'live' ? 'On air' : item.status === 'unavailable' ? 'Status unavailable' : 'Reconnecting'} {user ? <span>Only the assigned client can watch.</span> : <Link to="/account">Sign in to check access →</Link>}</p>)}</section>}
        {available && !visible.length && <><section className="live-empty"><img src="/bravo-shield-192.png" alt="" width="68" height="68"/><h2>OUT IN THE FIELD.</h2><p>{search.get('session') ? 'This session has ended or requires client access.' : privateNotices.length ? 'No public sessions are live right now.' : 'No sessions are live right now. Check back for our next training session.'}</p>{!user && <p>Watching your dog? <Link to="/account">Sign in for client sessions.</Link></p>}<Link to="/dog-training" className="button button-ghost">Explore our training</Link></section><TrainingHighlights/></>}
      </>}
      {user && <p className="live-contact"><Link to="/community?tab=direct">Message Bravo about your session →</Link></p>}
      <div className="live-signature"><img src="/bravo-shield-192.png" width="56" height="56" alt="Bravo K9 shield"/><p>MORE THAN TRAINING.<br/><span>A STRONGER TOMORROW.</span></p></div>
    </div></main><Footer/></>;
}
