import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from './ui';
import guide from './website-guide.json';
import './how-to.css';

const timestamp = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function HowToPage() {
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
    player.play().catch(() => setPlaybackError('Press Play on the video to continue, or open the video using the link below.'));
  }
  return <Page className="how-to-page" eyebrow="YOUR BRAVO WEBSITE GUIDE" title="How to use the website." intro="Get comfortable with your account, your schedule and the little changes life brings. Watch, pause and follow along at your own pace.">
    <section className="how-to-watch" aria-labelledby="how-to-watch-title">
      <div className="how-to-player">
        <video ref={video} controls playsInline preload="metadata" poster={guide.poster} width="1080" height="1920" tabIndex={0} aria-label="Bravo website walkthrough: sign in and manage your schedule" aria-describedby="how-to-player-help" onLoadedMetadata={seek} onError={() => setPlaybackError('The video could not load. Try opening it directly below, or read the full transcript.')}>
          <source src={guide.video} type="video/mp4"/>
          <track kind="captions" src={guide.captions} srcLang="en" label="English"/>
          Your browser cannot play this video. Use the video link below or read the transcript.
        </video>
        {playbackError && <p role="alert">{playbackError}</p>}
        <p id="how-to-player-help">Press Play to begin. Use the video controls for captions, volume and full screen.</p>
        <a href={guide.video}>Open the video directly</a>
      </div>
      <div className="how-to-intro">
        <p className="how-to-meta">9 MIN 14 SEC <span aria-hidden="true">·</span> 22 SHORT CHAPTERS</p>
        <h2 id="how-to-watch-title">Feel confident before your next visit.</h2>
        <p>This guided tour shows the actual website, one step at a time. Start at the beginning or jump straight to the part you need.</p>
        <ul>
          <li>Sign in and set your first password.</li>
          <li>Choose training days, pick times and save your schedule.</li>
          <li>Add a day, move a visit or cancel one.</li>
          <li>Check your membership, download a schedule and message Bravo.</li>
        </ul>
        <p className="how-to-demo-note">The video uses a demo account and sample dates. Your available days and times depend on your membership and Bravo’s current schedule.</p>
        <div className="how-to-actions"><Link className="button" to="/account">Open my account</Link><a className="button secondary" href="#guide-chapters">Choose a chapter</a></div>
        <p>Need help getting an account? <Link to="/contact">Contact Bravo</Link>.</p>
      </div>
    </section>
    <section id="guide-chapters" className="how-to-chapters" aria-labelledby="how-to-chapters-title">
      <h2 id="how-to-chapters-title">What would you like to learn?</h2>
      <p>Choose a chapter to play that part of the video. Pause whenever you want to try a step yourself.</p>
      <ol>{guide.chapters.map(chapter => <li key={chapter.id} id={`chapter-${chapter.id}`}><button type="button" onClick={() => playChapter(chapter.start)} aria-label={`Play ${chapter.title} at ${timestamp(chapter.start)}`}><span className="how-to-time">{timestamp(chapter.start)}</span><span>{chapter.title}</span><span aria-hidden="true">↗</span></button></li>)}</ol>
    </section>
    <details className="how-to-transcript">
      <summary>Read the full video transcript</summary>
      {guide.chapters.map(chapter => <section key={chapter.id}><h3>{timestamp(chapter.start)} · {chapter.title}</h3><p>{chapter.text}</p></section>)}
    </details>
    <section className="how-to-help" aria-labelledby="how-to-help-title"><div><h2 id="how-to-help-title">You can always ask us.</h2><p>If something looks different or you get stuck, the Bravo team can help you with your account and visits.</p></div><Link className="button" to="/contact">Get help from Bravo</Link></section>
  </Page>;
}
