import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header, Footer } from './ui';
import { useBravo } from './context';
import { api } from './api';
import { useLiveSessions, useLiveClock, liveTime, liveDuration } from './live-state';
import './live.css';

function LivePlayer({ session }) {
  const video = useRef(null), audio = useRef(null), roomRef = useRef(null), generation = useRef(0);
  const [state, setState] = useState('idle'), [error, setError] = useState(''), [sound, setSound] = useState(false);
  const now = useLiveClock();
  useEffect(() => () => { generation.current++; roomRef.current?.disconnect(); }, [session.id]);
  async function watch() {
    const current = ++generation.current; setState('connecting'); setError('');
    try {
      const [{ Room, RoomEvent, Track }, credentials] = await Promise.all([import('livekit-client'), api(`/live/${session.id}/watch`, { method: 'POST', body: {} })]);
      if (current !== generation.current) return;
      const room = new Room({ adaptiveStream: true }); roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind === Track.Kind.Video && video.current) { track.attach(video.current); setState('watching'); }
        if (track.kind === Track.Kind.Audio && audio.current) track.attach(audio.current);
      });
      room.on(RoomEvent.TrackUnsubscribed, track => { track.detach(); if (track.kind === Track.Kind.Video) setState('waiting'); });
      room.on(RoomEvent.Reconnecting, () => setState('reconnecting'));
      room.on(RoomEvent.Reconnected, () => setState('watching'));
      room.on(RoomEvent.Disconnected, () => { if (current === generation.current) setState('ended'); });
      await room.connect(credentials.url, credentials.token);
      if (current !== generation.current) { await room.disconnect(); return; }
      setState(old => old === 'connecting' ? 'waiting' : old);
    } catch { if (current === generation.current) { await roomRef.current?.disconnect(); setState('idle'); setError('The stream could not connect. Try again in a moment.'); } }
  }
  async function toggleSound() {
    if (!sound) await roomRef.current?.startAudio();
    setSound(!sound);
  }
  return <section className="live-player" aria-label={`${session.trainerName} training ${session.dogName}`}>
    <div className="live-video-stage">
      <video ref={video} autoPlay playsInline muted aria-label="Live training video"/>
      <audio ref={audio} autoPlay muted={!sound}/>
      <div className="live-video-top"><span className="live-badge"><i/>LIVE</span><span className="live-timer">{liveDuration(session.startedAt, now)}</span></div>
      {state !== 'watching' && <div className="live-video-cover"><img src="/bravo-shield-192.png" alt="" width="72" height="72"/>
        <h3>{state === 'idle' ? 'Step into the session.' : state === 'ended' ? 'This connection has ended.' : state === 'reconnecting' ? 'Reconnecting…' : 'Connecting to Bravo…'}</h3>
        {['idle', 'ended'].includes(state) && <button className="button" onClick={watch}>Watch live <span aria-hidden="true">▶</span></button>}
        {error && <p role="alert">{error}</p>}
      </div>}
    </div>
    <div className="live-player-caption"><div><h2>{session.trainerName} <span> / </span> {session.dogName}</h2><p>Started {liveTime(session.startedAt)} CT · {session.audience === 'client' ? 'Client only' : 'Public session'}</p></div>
      <div className="live-controls"><button onClick={() => toggleSound().catch(() => setError('Tap again to enable sound.'))} disabled={state !== 'watching'} aria-pressed={sound}>{sound ? 'Mute audio' : 'Enable audio'}</button><button onClick={() => { const element = video.current; if (element?.webkitEnterFullscreen) element.webkitEnterFullscreen(); else element?.requestFullscreen?.().catch(() => {}); }} disabled={state !== 'watching'}>Full screen</button></div>
    </div><p className="live-caption-note">Live video. Automatic captions and replays are not available.</p>
  </section>;
}

export default function LivePage() {
  const { user } = useBravo(), { sessions, loading, error, offset } = useLiveSessions();
  const [search, setSearch] = useSearchParams(); const now = useLiveClock(offset);
  const selected = sessions.find(session => session.id === search.get('session')) || sessions[0];
  return <><Header/><main id="main-content" tabIndex={-1} className="bravo-live-page">
    <section className="live-hero"><div className="live-shell"><p className="live-eyebrow">TRUST. TRAIN. DEPLOY.</p><h1>BRAVO <em>LIVE</em></h1><h2>REAL TRAINING. RIGHT NOW.</h2><p>Watch our trainers in live sessions.<br/>See the Bravo difference as it happens.</p><div className="live-hero-actions">{['staff', 'owner'].includes(user?.role) ? <Link className="button" to="/live/studio">Go live ↗</Link> : !user && <Link className="live-text-link" to="/account">Client sign in →</Link>}</div></div></section>
    <noscript><p className="live-shell live-noscript">Live video requires JavaScript and an internet connection. Enable JavaScript to see the current sessions and watch public training. Client-only sessions require you to sign in with the account linked to your dog. You can also call Bravo at (605) 824-2767 for help with your training session.</p></noscript><div className="live-shell live-content"><div className="live-section-heading"><h2>LIVE SESSIONS</h2><span>REAL DOGS. REAL PROGRESS.</span></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading ? <p className="live-empty" role="status">Checking live sessions…</p> : sessions.length ? <>
        <div className="live-session-list"><div className="live-session-header"><span>TRAINER</span><span>LIVE</span><span>DOG</span><span>STARTED · CT</span><span>LIVE FOR</span><span/></div>
          {sessions.map(session => <button key={session.id} className={`live-session-row ${selected?.id === session.id ? 'is-selected' : ''}`} aria-pressed={selected?.id === session.id} onClick={() => setSearch({ session: session.id }, { replace: true })}>
            <strong>{session.trainerName}</strong><span className="live-status"><i/>{session.audience === 'client' ? 'PRIVATE' : 'LIVE'}</span><span>{session.dogName}</span><span className="live-row-time">{liveTime(session.startedAt)}</span><span className="live-timer">{liveDuration(session.startedAt, now)}</span><span aria-hidden="true" className="live-row-arrow">›</span>
          </button>)}
        </div>{selected && <LivePlayer key={selected.id} session={selected}/>}
      </> : <section className="live-empty"><img src="/bravo-shield-192.png" alt="" width="68" height="68"/><h2>OUT IN THE FIELD.</h2><p>{search.get('session') ? 'This session has ended or is available only to its client.' : 'No sessions are live right now. Check back for our next training session.'}</p>{!user && <p>Watching your dog? <Link to="/account">Sign in for client-only sessions.</Link></p>}<Link to="/dog-training" className="button button-ghost">Explore our training</Link></section>}
      {user && <p className="live-contact"><Link to="/community?tab=direct">Message Bravo about your session →</Link></p>}
      <div className="live-signature"><img src="/bravo-shield-192.png" width="56" height="56" alt="Bravo K9 shield"/><p>MORE THAN TRAINING.<br/><span>A STRONGER TOMORROW.</span></p></div>
    </div></main><Footer/></>;
}
