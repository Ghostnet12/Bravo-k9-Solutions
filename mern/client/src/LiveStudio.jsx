import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { Page, Notice } from './ui';
import { api } from './api';
import { liveDuration, liveTime, useLiveClock } from './live-state';
import './live.css';

function stopTracks(tracks) { tracks.forEach(track => { track.detach(); track.stop(); }); }
function cameraError(error) {
  return error.name === 'NotAllowedError' ? 'Camera access was declined. Allow the camera in your browser settings, then try again.' : error.name === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not open. Close other camera apps and try again.';
}
export default function LiveStudio() {
  const { user, authReady } = useBravo(); const allowed = ['staff', 'owner'].includes(user?.role);
  const [data, setData] = useState(null), [bookingId, setBookingId] = useState(''), [dogName, setDogName] = useState('');
  const [audience, setAudience] = useState('client'), [consent, setConsent] = useState(false), [facing, setFacing] = useState('environment');
  const [audioOn, setAudioOn] = useState(false), [preview, setPreview] = useState(false), [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null), [status, setStatus] = useState('idle'), [error, setError] = useState('');
  const video = useRef(null), tracks = useRef([]), room = useRef(null), current = useRef(null), wakeLock = useRef(null), mounted = useRef(false), operation = useRef(false);
  const now = useLiveClock(); const booking = data?.bookings.find(item => item.id === bookingId);
  const load = () => api('/live/studio').then(result => { if (mounted.current) setData(result); });
  useEffect(() => {
    mounted.current = true;
    if (allowed) load().catch(e => setError(e.message));
    return () => {
      mounted.current = false; stopTracks(tracks.current); tracks.current = []; room.current?.disconnect(); wakeLock.current?.release();
      if (current.current) fetch(`/api/live/${current.current.id}/end`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      current.current = null;
    };
  }, [allowed, user?.id]);
  useEffect(() => {
    if (!session) return;
    let active = true, timer;
    const beat = async () => {
      try {
        const result = await api(`/live/${session.id}/heartbeat`, { method: 'POST', body: {} });
        if (active) { setSession(result.session); current.current = result.session; setStatus('live'); setError(''); }
      } catch (e) {
        if (active) { setStatus('interrupted'); setError(e.message); }
        if ([401, 403, 404, 410].includes(e.status)) { stopTracks(tracks.current); tracks.current = []; room.current?.disconnect(); if (active) setPreview(false); return; }
      }
      if (active) timer = setTimeout(beat, 15000);
    };
    timer = setTimeout(beat, 15000);
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    const pageHide = () => { stopTracks(tracks.current); room.current?.disconnect(); fetch(`/api/live/${session.id}/end`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); };
    const keepAwake = async () => { if (document.visibilityState === 'visible' && navigator.wakeLock) { try { wakeLock.current = await navigator.wakeLock.request('screen'); } catch { /* Some browsers or power-saving settings deny wake locks. */ } } };
    keepAwake(); document.addEventListener('visibilitychange', keepAwake); window.addEventListener('beforeunload', beforeUnload); window.addEventListener('pagehide', pageHide);
    return () => { active = false; clearTimeout(timer); wakeLock.current?.release(); document.removeEventListener('visibilitychange', keepAwake); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', pageHide); };
  }, [session?.id]);
  async function withAction(action) {
    if (operation.current) return; operation.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { if (mounted.current) setError(e.message); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  async function openCamera(nextFacing = facing, nextAudio = audioOn) {
    stopTracks(tracks.current); tracks.current = []; setPreview(false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Open Bravo in Safari or Chrome over HTTPS to use the camera.');
    try {
      const { createLocalTracks, Track } = await import('livekit-client');
      const next = await createLocalTracks({ audio: nextAudio, video: { facingMode: nextFacing, resolution: { width: 1280, height: 720, frameRate: 24 } } });
      if (!mounted.current) { stopTracks(next); return; }
      tracks.current = next; next.find(track => track.kind === Track.Kind.Video)?.attach(video.current); setPreview(true);
    } catch (e) { throw new Error(cameraError(e)); }
  }
  async function start() {
    if (!preview || !data?.configured) return;
    const credentials = await api('/live', { method: 'POST', body: { audience, dogName: booking?.dogName || dogName,
      ...(bookingId ? { bookingId } : {}), publicConsent: audience === 'public' && consent } });
    current.current = credentials.session;
    try {
      const { Room, RoomEvent } = await import('livekit-client');
      const next = new Room({ dynacast: true }); room.current = next;
      next.on(RoomEvent.Reconnecting, () => { if (mounted.current) setStatus('reconnecting'); });
      next.on(RoomEvent.Disconnected, () => { if (mounted.current && current.current) { setStatus('interrupted'); setError('Broadcast disconnected. End this session and start again.'); } });
      await next.connect(credentials.url, credentials.token, { autoSubscribe: false });
      if (!mounted.current) throw new Error('Broadcast cancelled.');
      for (const track of tracks.current) await next.localParticipant.publishTrack(track, { simulcast: true });
      const result = await api(`/live/${credentials.session.id}/heartbeat`, { method: 'POST', body: {} });
      if (!mounted.current) throw new Error('Broadcast cancelled.');
      current.current = result.session; setSession(result.session); setStatus('live'); await load();
    } catch (e) {
      await room.current?.disconnect(); stopTracks(tracks.current); tracks.current = [];
      await api(`/live/${credentials.session.id}/end`, { method: 'POST', body: {} }).catch(() => {});
      current.current = null;
      if (mounted.current) { setPreview(false); await load(); }
      throw e;
    }
  }
  async function end(id = session?.id) {
    if (id === current.current?.id) { current.current = null; stopTracks(tracks.current); tracks.current = []; await room.current?.disconnect(); setPreview(false); setSession(null); setStatus('idle'); }
    try { await api(`/live/${id}/end`, { method: 'POST', body: {} }); }
    finally { await load(); }
  }
  async function flip() {
    const nextFacing = facing === 'environment' ? 'user' : 'environment';
    if (session) { const track = tracks.current.find(item => item.kind === 'video'); await track.restartTrack({ facingMode: nextFacing }); }
    else if (preview) await openCamera(nextFacing, audioOn);
    setFacing(nextFacing);
  }
  async function toggleAudio() {
    if (session) {
      await room.current.localParticipant.setMicrophoneEnabled(!audioOn);
      // Include an audio track added after publishing in cleanup.
      const track = room.current.localParticipant.getTrackPublication('microphone')?.track;
      if (track && !tracks.current.includes(track)) tracks.current.push(track);
    } else if (preview) await openCamera(facing, !audioOn);
    setAudioOn(!audioOn);
  }
  return <Page className="live-studio" title={<>BRAVO <em>LIVE</em></>} eyebrow="TRAINER BROADCAST" intro="Your phone. Your dog. Your session.">
    {!authReady ? <p role="status">Checking trainer access…</p> : !allowed ? <section className="panel"><h2>Trainer sign in required.</h2><Link className="button" to="/account">Sign in</Link></section> : <>
      <Notice error>{error}</Notice>
      {data && !data.configured && <Notice>Camera preview is available. Broadcasting will unlock when Bravo’s media server is connected.</Notice>}
      <div className="live-studio-grid"><section className="live-setup panel"><p className="live-eyebrow">01 / SET THE SESSION</p>
        <fieldset disabled={busy || !!session}><label>Dog / scheduled client<select value={bookingId} onChange={event => { setBookingId(event.target.value); setConsent(false); }}><option value="">Choose a saved training request…</option>{data?.bookings.map(item => <option value={item.id} key={item.id}>{item.dogName} · {item.clientName}</option>)}</select></label>
          {!bookingId && <label>Dog’s name<input value={dogName} maxLength={80} placeholder="e.g. Gunner" onChange={e => setDogName(e.target.value)}/></label>}
          {booking && <p className="live-client-note">Client: {booking.clientName}{booking.visits?.length ? ` · ${booking.visits.length} scheduled visit${booking.visits.length === 1 ? '' : 's'}` : ''}</p>}
          <legend className="sr-only">Session details</legend><div className="live-audiences"><label className={audience === 'client' ? 'is-selected' : ''}><input type="radio" name="audience" value="client" checked={audience === 'client'} onChange={() => { setAudience('client'); setConsent(false); }}/><strong>CLIENT ONLY</strong><span>Private access for this dog’s owner.</span></label><label className={audience === 'public' ? 'is-selected' : ''}><input type="radio" name="audience" value="public" checked={audience === 'public'} onChange={() => setAudience('public')}/><strong>PUBLIC LIVE</strong><span>Watchable from the Bravo homepage.</span></label></div>
          {audience === 'public' && <label className="live-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>I have permission to show everyone in this session publicly.</label>}
          {audience === 'client' && !bookingId && <p className="helper">Select a saved client request to enable private viewing.</p>}
        </fieldset><p className="live-install">Add Bravo to your Home Screen for quick access. On iPhone: Share → Add to Home Screen.</p>
      </section><section className="live-camera-panel"><div className="live-camera-preview"><video ref={video} autoPlay muted playsInline aria-label="Your camera preview" className={facing === 'user' ? 'is-mirrored' : ''}/>{!preview && <div className="live-video-cover"><img src="/bravo-shield-192.png" alt="" width="72" height="72"/><h2>READY WHEN YOU ARE.</h2><button className="button" disabled={busy || !data} onClick={() => withAction(() => openCamera())}>Enable camera preview</button></div>}{session && <div className="live-video-top"><span className={status === 'live' ? 'live-badge' : 'live-connection-state'}>{status === 'live' ? '● LIVE' : status.toUpperCase()}</span><span className="live-timer">{liveDuration(session.startedAt, now)}</span></div>}</div>
        <div className="live-camera-actions"><button disabled={busy || !preview} onClick={() => withAction(flip)}>Flip camera</button><button aria-pressed={audioOn} disabled={busy} onClick={() => withAction(toggleAudio)}>{audioOn ? 'Microphone on' : 'Microphone off'}</button></div>
        {session ? <><p className="live-current">{session.trainerName} · {session.dogName} · <strong>{session.audience === 'public' ? 'PUBLIC' : 'CLIENT ONLY'}</strong></p><button className="button live-stop" disabled={busy} onClick={() => withAction(() => end())}>{busy ? 'Ending…' : '■ End live session'}</button></> : <button className="button live-start" disabled={busy || !preview || !data?.configured || !(booking?.dogName || dogName.trim()) || (audience === 'client' && !bookingId) || (audience === 'public' && !consent)} onClick={() => withAction(start)}>{busy ? 'Connecting…' : '● Start live'}</button>}
        <p className="live-phone-note">Keep this screen open and your phone unlocked. Calls, switching apps, or a weak signal can interrupt the camera.</p>
      </section></div>
      {!!data?.sessions.length && <section className="panel live-studio-sessions"><h2>ACTIVE SESSIONS</h2>{data.sessions.map(item => <div key={item.id}><p><strong>{item.trainerName}</strong> · {item.dogName}<br/><span>{item.status === 'live' && now - new Date(item.lastSeenAt).getTime() < 75000 ? '● LIVE' : 'Connection needs attention'} · {liveTime(item.startedAt)} CT · {liveDuration(item.startedAt, now)} · {item.audience === 'public' ? 'Public' : 'Client only'}</span></p><button disabled={busy} onClick={() => withAction(() => end(item.id))}>End session</button></div>)}</section>}
      <p><Link to="/live">Open the live viewing page →</Link></p>
    </>}
  </Page>;
}
