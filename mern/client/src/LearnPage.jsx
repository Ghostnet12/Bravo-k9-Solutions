import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { money } from '../../shared/catalog';
import { useBravo } from './context';
import { Page, Notice } from './ui';
export default function LearnPage() {
  const { user, services, config } = useBravo();
  const [lessons, setLessons] = useState([]), [filter, setFilter] = useState('All'), [selected, setSelected] = useState(null), [transcript, setTranscript] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const member = ['staff', 'owner'].includes(user?.role) || services.includes('online');
  useEffect(() => { api('/lessons').then(data => setLessons(data.lessons)).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (selected) document.getElementById('current-lesson')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [selected]);
  async function open(lesson) {
    setError(''); setSelected(null); setTranscript('');
    try { const data = await api(`/lessons/${lesson._id}/transcript`); setTranscript(data.transcript); setSelected(lesson); }
    catch (e) { setError(e.message); }
  }
  return <Page className="learning-page" title="Learn the Bravo way." eyebrow={`ONLINE TRAINING · ${money(config?.services?.find(service => service.id === 'online')?.cents ?? 5000)} / MONTH`} intro="Practical lessons from the Bravo team. Browse the topics below; an active membership unlocks published videos and transcripts."><div className="learn-banner"><img src="/images/training-education.webp" width="1600" height="900" alt="Bravo training lesson with a handler and Belgian Malinois"/><div><p className="kicker gold">REAL WORK. CLEAR EXPLANATIONS.</p><h2>Better handlers.<br/>Better dogs.</h2><p>Video lessons, synchronized captions, and readable transcripts in one place.</p><Link className="button" to={member ? '/account' : '/portal?program=online'}>{member ? 'Your membership' : 'Explore membership'}</Link></div></div><Notice error>{error}</Notice>
    {!loading && !lessons.some(l => l.published) && <Notice>The lesson library is being prepared. These are upcoming topics—not playable videos. Online enrollment stays closed until published lessons are ready.</Notice>}
    {selected && <section className="panel lesson-player" id="current-lesson"><h2>{selected.title}</h2><video key={selected._id} controls preload="metadata" controlsList="nodownload" onError={() => setError('This video could not load. Please try again or contact Bravo.')}><source src={`/api/lessons/${selected._id}/video`}/><track kind="captions" src={`/api/lessons/${selected._id}/captions`} srcLang="en" label="English" default/>Your browser does not support this video. Read the transcript below.</video><details open><summary>Read transcript</summary><p className="transcript">{transcript}</p></details></section>}
    <section id="library"><div className="section-label"><h2>The lesson catalog.</h2><label>Filter by topic<select value={filter} onChange={e => setFilter(e.target.value)}>{['All', ...new Set(lessons.map(l => l.category))].map(c => <option key={c}>{c}</option>)}</select></label></div>{loading ? <p role="status">Loading the library…</p> : <div className="member-lesson-grid">{lessons.filter(l => filter === 'All' || l.category === filter).map(lesson => <article className="member-lesson" key={lesson._id}><img src={lesson.image} width="900" height="600" alt="" loading="lazy"/><div><span className="kicker gold">{lesson.category}</span><h3>{lesson.title}</h3><p>With {lesson.instructor}</p>{!lesson.published ? <span className="badge">Coming soon</span> : member ? <button className="button button-small" onClick={() => open(lesson)}>Watch lesson</button> : <Link className="inline-link" to={user ? '/portal?program=online' : '/account'}>Member access required →</Link>}</div></article>)}</div>}</section>
    <section id="accessible-media" className="panel prose"><h2>Accessible learning.</h2><p>Published lessons must include English captions and a written transcript. Use the CC control for captions, or read the transcript without playing audio. Contact Bravo if you need another format.</p></section>
  </Page>;
}
