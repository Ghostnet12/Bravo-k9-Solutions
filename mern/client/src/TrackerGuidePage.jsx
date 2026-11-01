import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from './ui';
import guide from './tracker-guide.json';
import './how-to.css';

const timestamp = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function TrackerGuidePage() {
  const video = useRef(null), pendingSeek = useRef(null);
  const [playbackError, setPlaybackError] = useState('');
  function seek() {
    if (pendingSeek.current === null || !video.current || video.current.readyState < 1) return;
    video.current.currentTime = pendingSeek.current;
    pendingSeek.current = null;
  }
  function playChapter(start) {
    const player = video.current;
    if (!player) return;
    pendingSeek.current = start;
    setPlaybackError('');
    seek();
    player.scrollIntoView({ block: 'center', behavior: 'instant' });
    player.focus({ preventScroll: true });
    player.play().catch(() => setPlaybackError('Press Play on the video to continue, or open the video directly below.'));
  }
  return <Page className="how-to-page tracker-guide-page" eyebrow="YOUR BRAVO TRACKER GUIDE" title="Follow the journey." intro="Learn to use the vehicle tracker and find your private trip updates. A short video with spoken instructions, captions and a checklist for the Bravo team.">
    <section className="how-to-watch" aria-labelledby="tracker-watch-title">
      <div className="how-to-player">
        <video ref={video} controls playsInline preload="none" poster={guide.poster} width="1080" height="1920" tabIndex={0} aria-label="Bravo transport tracker walkthrough with spoken instructions" aria-describedby="tracker-player-help" onLoadedMetadata={seek} onError={() => setPlaybackError('The video could not load. Open it directly below, or read the full transcript.')}>
          <source src={guide.video} type="video/mp4"/>
          <track kind="captions" src={guide.captions} srcLang="en" label="English"/>
          Your browser cannot play this video. Use the video link below or read the transcript.
        </video>
        {playbackError && <p role="alert">{playbackError}</p>}
        <p id="tracker-player-help">Press Play to hear the guide. Use the player controls for volume, captions and full screen.</p>
        <a href={guide.video}>Open the tracker video directly</a>
      </div>
      <div className="how-to-intro">
        <p className="how-to-meta">4 MIN 17 SEC <span aria-hidden="true">·</span> VOICE + CAPTIONS</p>
        <h2 id="tracker-watch-title">A little guidance. Every mile.</h2>
        <p>Start at the beginning or choose a chapter below. Pause whenever you want to try a step yourself.</p>
        <ul><li>Open the shared vehicle map and check its last-update time.</li><li>Copy the tracking link and find your private trip details.</li><li>Know what to do when the map is blank or out of date.</li></ul>
        <p className="how-to-demo-note">The map is public; your assigned trip details stay in your Bravo account. Example visuals in the video are not a live journey. The team checklist starts at 2:23.</p>
        <div className="how-to-actions"><Link className="button" to="/k9-transport#track-bravo">Open vehicle tracker →</Link><Link className="button secondary" to="/transport">Breeder & Client Portal</Link></div>
        <a href="#tracker-chapters">Choose a chapter ↓</a>
      </div>
    </section>
    <section id="tracker-chapters" className="how-to-chapters" aria-labelledby="tracker-chapters-title">
      <h2 id="tracker-chapters-title">Jump to what you need.</h2>
      <p>Clients and breeders: start with the first seven chapters. Bravo team: use the sharing checklist from 2:23.</p>
      <ol>{guide.chapters.map(chapter => <li key={chapter.id}><button type="button" onClick={() => playChapter(chapter.start)} aria-label={`Play ${chapter.title} at ${timestamp(chapter.start)}`}><span className="how-to-time">{timestamp(chapter.start)}</span><span>{chapter.title}</span><span aria-hidden="true">↗</span></button></li>)}</ol>
    </section>
    <details className="how-to-transcript"><summary>Read the tracker video transcript</summary>{guide.chapters.map(chapter => <section key={chapter.id}><h3>{timestamp(chapter.start)} · {chapter.title}</h3><p>{chapter.text}</p></section>)}</details>
    <section className="how-to-help" aria-labelledby="tracker-help-title"><div><h2 id="tracker-help-title">Need a hand?</h2><p>For a trip update, call <a href="tel:+16058242767">(605) 824-2767</a>. For account and training help, visit the website guide.</p></div><Link className="button secondary" to="/how-to">Website & scheduling guide</Link></section>
  </Page>;
}
