import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Page, Notice } from './ui';

export default function ContactPage() {
  const [team, setTeam] = useState([]), [error, setError] = useState('');
  useEffect(() => { api('/team').then(data => setTeam(data.team)).catch(e => setError(e.message)); }, []);
  return <Page title="Talk to Bravo." eyebrow="ABERDEEN, SOUTH DAKOTA" intro="Training questions, an upcoming visit, or your account—reach the right person without hunting through the site.">
    <Notice error>{error}</Notice>
    <section className="panel prose"><h2>Mobile service in Aberdeen, South Dakota.</h2><p>Bravo K9 Solutions comes to you for <Link to="/dog-training">private dog training</Link> and offers <Link to="/dog-walking">professional dog walking</Link>. Call <a href="tel:+16058242767">(605) 824-2767</a> to discuss your dog, confirm service at your location or get help choosing a program.</p><p>Visits are by appointment. The booking calendar shows available times; your request needs Bravo’s confirmation.</p></section>
    <div className="contact-grid">
      <section className="panel"><p className="kicker gold">CALL A TRAINER</p><h2>Your Bravo team.</h2>{team.length ? <div className="team-contact-list">{team.map(person => <article key={person.id}><div><strong>{person.name}</strong><span className="badge">{person.role === 'owner' ? 'OWNER' : 'STAFF'}</span><small>{person.title}</small>{person.bio && <p>{person.bio}</p>}</div>{person.phone ? <a className="button button-small button-ghost" href={`tel:${person.phone.replace(/[^+\d]/g, '')}`}>Call {person.name.split(' ')[0]} · {person.phone}</a> : <Link className="inline-link" to={`/community?tab=direct&to=${person.id}`}>Message {person.name.split(' ')[0]}</Link>}</article>)}</div> : <><p>Call the main Bravo line for training and scheduling help.</p><a className="button" href="tel:+16058242767">Call (605) 824-2767</a></>}</section>
      <section className="panel"><h2>Message the team.</h2><p>Signed-in clients can privately message Bravo. The thread stays with your profile so any available staff member can help.</p><Link className="button button-ghost" to="/community?tab=direct">Open private messages</Link><p className="helper">For urgent matters, call instead of waiting for a reply.</p></section>
      <section className="panel"><h2>Before your visit.</h2><p>Keep your phone number and visit address current in your account. Add training goals and access instructions to the private booking notes.</p><p>A saved request still needs Bravo’s confirmation. Check your account for its current status.</p><Link className="inline-link" to="/account">Manage my account →</Link></section>
      <section className="panel"><h2>Quick answers.</h2><details><summary>How do I change a visit?</summary><p>Open My schedule from the menu and choose Add Days and Times. Select dates, choose times and save your changes. The Bravo team can also help you update visits.</p></details><details><summary>How do I cancel?</summary><p>Open My schedule to manage your visits. Use Add Days and Times to remove selected visits, then save the changes. Contact Bravo for payment or refund questions.</p></details><details><summary>I forgot my password.</summary><p>Call Bravo so the owner can verify your identity and help with recovery. Never post your password in the community.</p></details></section>
    </div>
  </Page>;
}
