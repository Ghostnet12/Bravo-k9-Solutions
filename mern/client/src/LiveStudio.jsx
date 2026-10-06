import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { Page, Notice } from './ui';
import { api } from './api';
import { liveDuration, liveTime, useLiveClock, refreshLive, useLiveSessions } from './live-state';
import { cameraReady, stopStream, createBroadcaster, createPublisherHealth } from './live-direct';
import { LIVE_STALE_MS, LIVE_FRESH_MS } from '../../shared/live-policy.js';
import './live.css';

function cameraError(error) {
  return error.name === 'NotAllowedError' ? 'Camera access was declined. Allow the camera in your browser settings, then try again.' : error.name === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not open. Close other camera apps and try again.';
}
export default function LiveStudio() {
  const { user, authReady } = useBravo(); const allowed = ['staff', 'owner'].includes(user?.role);
  const [data, setData] = useState(null), [bookingId, setBookingId] = useState(''), [dogName, setDogName] = useState(''), [trainingFocus, setTrainingFocus] = useState('');
  const [audience, setAudience] = useState('client'), [consent, setConsent] = useState(false), [facing, setFacing] = useState('environment');
  const [audioOn, setAudioOn] = useState(false), [preview, setPreview] = useState(false), [busy, setBusy] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [session, setSession] = useState(null), [status, setStatus] = useState('idle'), [error, setError] = useState('');
  const video = useRef(null), stream = useRef(null), room = useRef(null), health = useRef(null), current = useRef(null), wakeLock = useRef(null), mounted = useRef(false), operation = useRef(false), cameraSwitch = useRef(0);
  const live = useLiveSessions();
  const activeSessions = live.sessions.filter(item => user?.role === 'owner' || item.trainerId === user?.id);
  const localStatus = status === 'live' && session?.liveUntil && Date.parse(session.liveUntil) <= Date.now() + live.offset ? 'reconnecting' : status;
  const now = useLiveClock(live.offset); const booking = data?.bookings.find(item => item.id === bookingId);
  const load = () => api('/live/studio').then(result => { if (mounted.current) setData(result); });
  useEffect(() => {
    mounted.current = true;
    let timer;
    if (allowed) { load().catch(e => setError(e.message)); timer = setInterval(() => load().catch(() => {}), 15000); }
    return () => {
      clearInterval(timer);
      mounted.current = false; stopStream(stream.current); stream.current = null; room.current?.disconnect(); health.current?.disconnect(); wakeLock.current?.release();
      if (current.current) fetch(`/api/live/${current.current.id}/end`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      current.current = null;
    };
  }, [allowed, user?.id]);
  useEffect(() => {
    if (!session) return;
    let active = true, timer, leaseTimer;
    const stopPublishing = message => {
      if (!active) return;
      active = false; clearTimeout(timer); clearTimeout(leaseTimer);
      room.current?.disconnect(); health.current?.disconnect(); stopStream(stream.current); stream.current = null;
      setPreview(false); setStatus('unavailable'); setError(`${message} End this session, then start again.`);
    };
    const renewLease = (row, serverTime) => {
      clearTimeout(leaseTimer);
      const publicationAge = row?.liveUntil && serverTime ? Math.max(0, Date.parse(serverTime) - (Date.parse(row.liveUntil) - LIVE_FRESH_MS)) : 0;
      leaseTimer = setTimeout(() => stopPublishing('The publication health lease expired.'), Math.max(0, LIVE_STALE_MS - publicationAge));
    };
    renewLease(session, session.serverTime);
    const beat = async () => {
      if (!active || current.current?.id !== session.id) return;
      if (cameraSwitch.current && Date.now() - cameraSwitch.current < 10000) { timer = setTimeout(beat, 2000); return; }
      try {
        const result = await api(`/live/${session.id}/heartbeat`, { method: 'POST', body: { cameraReady: cameraReady(stream.current), publication: await health.current.sample() }, timeoutMs: 4000 });
        if (active && current.current?.id === session.id) { renewLease(result.session, result.serverTime); room.current?.sync(result.peers); setSession(result.session); current.current = result.session; setStatus(result.session.status); setError(''); refreshLive(); }
      } catch (e) {
        if (!active || current.current?.id !== session.id) return;
        if ([400, 401, 403, 404, 409, 410].includes(e.status) || e.code === 'LIVE_NOT_CONFIGURED') { stopPublishing(e.message); return; }
        setStatus('reconnecting'); setError('Connection interrupted. Reconnecting…');
      }
      if (active) timer = setTimeout(beat, 2000);
    };
    timer = setTimeout(beat, 2000);
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    const pageHide = () => { stopStream(stream.current); room.current?.disconnect(); health.current?.disconnect(); fetch(`/api/live/${session.id}/end`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); };
    const keepAwake = async () => { if (document.visibilityState === 'visible' && navigator.wakeLock) { try { wakeLock.current = await navigator.wakeLock.request('screen'); } catch { /* Some browsers or power-saving settings deny wake locks. */ } } };
    keepAwake(); document.addEventListener('visibilitychange', keepAwake); window.addEventListener('beforeunload', beforeUnload); window.addEventListener('pagehide', pageHide);
    return () => { active = false; clearTimeout(timer); clearTimeout(leaseTimer); wakeLock.current?.release(); document.removeEventListener('visibilitychange', keepAwake); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', pageHide); };
  }, [session?.id]);
  async function withAction(action) {
    if (operation.current) return; operation.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { if (mounted.current) setError(e.message); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  async function openCamera(nextFacing = facing, nextAudio = audioOn) {
    stopStream(stream.current); stream.current = null; setPreview(false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Open Bravo in Safari or Chrome over HTTPS to use the camera.');
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: nextAudio, video: { facingMode: { ideal: nextFacing }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 20, max: 24 } } });
      if (!mounted.current) { stopStream(next); return; }
      stream.current = next; video.current.srcObject = next; await video.current.play().catch(() => {}); setPreview(true);
    } catch (e) { throw new Error(cameraError(e)); }
  }
  async function start() {
    if (!preview || !data?.configured) return;
    let credentials;
    try {
      if (!mounted.current) throw new Error('Broadcast cancelled.');
      setStatus('starting');
      // Camera health setup can take longer on phones. Do it before creating
      // the short-lived server session so setup cannot consume its start lease.
      health.current = await createPublisherHealth(() => stream.current);
      if (!mounted.current) throw new Error('Broadcast cancelled.');
      credentials = await api('/live', { method: 'POST', body: { audience, dogName: booking?.dogName || dogName, trainingFocus,
        ...(bookingId ? { bookingId } : {}), publicConsent: audience === 'public' && consent } });
      current.current = credentials.session;
      if (!mounted.current) throw new Error('Broadcast cancelled.');
      room.current = createBroadcaster(credentials.session.id, () => stream.current, count => { if (mounted.current && current.current?.id === credentials.session.id) setViewerCount(count); });
      const result = await api(`/live/${credentials.session.id}/heartbeat`, { method: 'POST', body: { cameraReady: cameraReady(stream.current), publication: await health.current.sample() } });
      if (!mounted.current) throw new Error('Broadcast cancelled.');
      current.current = result.session; setSession({ ...result.session, serverTime: result.serverTime }); setStatus(result.session.status); refreshLive(); await load();
    } catch (e) {
      await room.current?.disconnect(); health.current?.disconnect(); stopStream(stream.current); stream.current = null;
      if (credentials) await api(`/live/${credentials.session.id}/end`, { method: 'POST', body: {} }).catch(() => {});
      current.current = null;
      if (mounted.current) { setPreview(false); await load(); }
      throw e;
    }
  }
  async function end(id = session?.id) {
    if (id === current.current?.id) { current.current = null; stopStream(stream.current); stream.current = null; await room.current?.disconnect(); health.current?.disconnect(); setPreview(false); setSession(null); setViewerCount(0); setStatus('idle'); }
    try { await api(`/live/${id}/end`, { method: 'POST', body: {} }); }
    finally { refreshLive(); await load(); }
  }
  async function flip() {
    const nextFacing = facing === 'environment' ? 'user' : 'environment';
    if (session) {
      const source = stream.current, broadcastId = current.current?.id;
      const previous = source.getVideoTracks()[0];
      cameraSwitch.current = Date.now(); previous.stop();
      try {
        const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 20, max: 24 } } });
        if (!mounted.current || current.current?.id !== broadcastId || stream.current !== source) { stopStream(next); return; }
        const track = next.getVideoTracks()[0];
        source.removeTrack(previous); source.addTrack(track);
        await room.current.replaceTrack('video', track); await health.current.replaceTrack(track);
        video.current.srcObject = source; await video.current.play().catch(() => {});
      } finally { cameraSwitch.current = 0; }
    } else if (preview) await openCamera(nextFacing, audioOn);
    setFacing(nextFacing);
  }
  async function toggleAudio() {
    if (session) {
      const existing = stream.current.getAudioTracks()[0];
      if (audioOn) {
        await room.current.replaceTrack('audio', null);
        if (existing) { existing.stop(); stream.current.removeTrack(existing); }
      } else {
        const source = stream.current, broadcastId = current.current?.id;
        const next = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!mounted.current || current.current?.id !== broadcastId || stream.current !== source) { stopStream(next); return; }
        const track = next.getAudioTracks()[0]; stream.current.addTrack(track);
        await room.current.replaceTrack('audio', track);
      }
    } else if (preview) await openCamera(facing, !audioOn);
    setAudioOn(!audioOn);
  }
  return <Page className="live-studio" title={<>BRAVO <em>LIVE</em></>} eyebrow="TRAINER BROADCAST" intro="Your phone. Your dog. Your session.">
    {!authReady ? <p role="status">Checking trainer access…</p> : !allowed ? <section className="panel"><h2>Trainer sign in required.</h2><Link className="button" to="/account">Sign in</Link></section> : <>

      {data && !data.configured && <Notice>Camera preview is available. Broadcasting is temporarily disabled.</Notice>}
      <div className="live-studio-grid"><section className="live-setup panel"><p className="live-eyebrow">01 / SET THE SESSION</p>
        <fieldset disabled={busy || !!session}><legend className="sr-only">Session details</legend><label>Dog / scheduled client<select value={bookingId} onChange={event => { setBookingId(event.target.value); setConsent(false); }}><option value="">Choose a saved training request…</option>{data?.bookings.map(item => <option value={item.id} key={item.id}>{item.dogName} · {item.clientName}</option>)}</select></label>
          {!bookingId && <label>Dog’s name<input value={dogName} maxLength={80} placeholder="e.g. Gunner" onChange={e => setDogName(e.target.value)}/></label>}
          <label>Training focus<input value={trainingFocus} maxLength={100} placeholder="e.g. Field obedience" onChange={e => setTrainingFocus(e.target.value)}/></label>
          {booking && <p className="live-client-note">Client: {booking.clientName}{booking.visits?.length ? ` · ${booking.visits.length} scheduled visit${booking.visits.length === 1 ? '' : 's'}` : ''}</p>}
          <div className="live-audiences"><label className={audience === 'client' ? 'is-selected' : ''}><input type="radio" name="audience" value="client" checked={audience === 'client'} onChange={() => { setAudience('client'); setConsent(false); }}/><strong>CLIENT ONLY</strong><span>Private access for this dog’s owner.</span></label><label className={audience === 'public' ? 'is-selected' : ''}><input type="radio" name="audience" value="public" checked={audience === 'public'} onChange={() => setAudience('public')}/><strong>PUBLIC LIVE</strong><span>Watchable from the Bravo homepage.</span></label></div>
          {audience === 'public' && <label className="live-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>I have permission to show everyone in this session publicly.</label>}
          {audience === 'client' && !bookingId && <p className="helper">Select a saved client request to enable private viewing.</p>}
        </fieldset><p className="live-install">Add Bravo to your Home Screen for quick access. On iPhone: Share → Add to Home Screen.</p>
      </section><section className="live-camera-panel"><div className="live-camera-preview"><video ref={video} autoPlay muted playsInline aria-label="Your camera preview" className={facing === 'user' ? 'is-mirrored' : ''}/>{!preview && <div className="live-video-cover"><img src="/bravo-shield-192.png" alt="" width="72" height="72"/><h2>READY WHEN YOU ARE.</h2><button className="button" disabled={busy || !data || !!session} onClick={() => withAction(() => openCamera())}>Enable camera preview</button></div>}{session && <div className="live-video-top"><span className={localStatus === 'live' ? 'live-badge' : 'live-connection-state'}>{localStatus === 'live' ? <><i aria-hidden="true"/>LIVE</> : localStatus.toUpperCase()}</span><span className="live-timer">{liveDuration(session.startedAt, now)}</span></div>}</div>
        <Notice error>{error}</Notice>
        <div className="live-camera-actions"><button disabled={busy || !preview} onClick={() => withAction(flip)}>Flip camera</button><button aria-pressed={audioOn} disabled={busy || (!!session && !preview)} onClick={() => withAction(toggleAudio)}>{audioOn ? 'Microphone on' : 'Microphone off'}</button></div>
        {session ? <><p className="live-current">{session.trainerName} · {session.dogName} · {viewerCount} {viewerCount === 1 ? 'viewer' : 'viewers'} · <strong>{session.audience === 'public' ? 'PUBLIC' : 'CLIENT ONLY'}</strong></p><button className="button live-stop" disabled={busy} onClick={() => withAction(() => end())}>{busy ? 'Ending…' : '■ End live session'}</button></> : <button className="button live-start" disabled={busy || !preview || !data?.configured || !(booking?.dogName || dogName.trim()) || (audience === 'client' && !bookingId) || (audience === 'public' && !consent)} onClick={() => withAction(start)}>{busy ? 'Connecting…' : '● Start live'}</button>}
        <p className="live-phone-note">Wi-Fi or cellular data · no minimum speed requirement or fixed viewer cap. Video quality adapts to your connection. Each viewer uses more of your phone’s upload connection. Keep this screen open and your phone unlocked. Calls, switching apps, or a weak signal can interrupt the camera.</p><p className="live-phone-note">Some carriers, VPNs and firewalls block direct video connections and need a relay. Bravo currently has no relay configured. Direct connections share network addresses with viewers; normal mobile data usage applies.</p>
      </section></div>
      {!!activeSessions.length && <section className="panel live-studio-sessions"><h2>ACTIVE SESSIONS</h2>{activeSessions.map(item => <div key={item.id}><p><strong>{item.trainerName}</strong> · {item.dogName}<br/><span>{item.status === 'live' ? '● LIVE' : item.status.toUpperCase()} · {liveTime(item.startedAt)} CT · {liveDuration(item.startedAt, now)} · {item.audience === 'public' ? 'Public' : 'Client only'}</span></p><button disabled={busy} onClick={() => withAction(() => end(item.id))}>End session</button></div>)}</section>}
      <p><Link to="/live">Open the live viewing page →</Link></p>
    </>}
  </Page>;
}
