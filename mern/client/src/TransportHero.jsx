import { Link } from 'react-router-dom';
import { Editable } from './SiteContent';
import './transport.css';

export default function TransportHero({ home = false }) {
  return <section id={home ? 'k9-transport' : undefined} className={`transport-hero${home ? ' transport-home' : ''}`} aria-labelledby="transport-title">
    <div className="transport-photo">
      <img src="/images/bravo-k9-transport.webp" srcSet="/images/bravo-k9-transport-small.webp 900w, /images/bravo-k9-transport.webp 1672w" sizes={home ? '(min-width: 701px) 440px, 100vw' : '(max-width: 1000px) 100vw, 1400px'} data-site-image-key="asset-bravo-k9-transport.webp" width="1672" height="941" loading={home ? 'lazy' : 'eager'} fetchPriority={home ? undefined : 'high'} decoding="async" alt="Bravo’s black Dodge Durango with silver wheels, front push bar and spotlight on a road at sunset"/>
      <Editable as="span" contentKey="transport-status" canEditText className="transport-badge">Coming Soon</Editable>
    </div>
    <Editable as={home ? 'h2' : 'h1'} contentKey="transport-title" canEditText id="transport-title" className="transport-title">K9<br/>{' '}Transport</Editable>
    <div className="transport-copy">
      <Editable as="p" contentKey="transport-tagline" canEditText className="transport-tagline">The Bravo standard.<br/>On the road.</Editable>
      <Editable as="p" contentKey="transport-intro" canEditText className="transport-intro">Dedicated canine transport is on the way.</Editable>
      <div className="transport-actions">
        {home ? <Link className="button transport-primary" to="/k9-transport#transport-updates">Get launch updates <span aria-hidden="true">→</span></Link> : <a className="button transport-primary" href="#transport-updates">Get launch updates <span aria-hidden="true">→</span></a>}
        <Editable as={Link} contentKey="transport-contact" canEditText canEditLink className="transport-contact" to="/contact?interest=k9-transport">Ask about our local and out-of-state rates <span aria-hidden="true">↗</span></Editable>
        <Link className="transport-contact" to="/k9-transport#track-bravo">Track the Bravo vehicle <span aria-hidden="true">↗</span></Link>
      </div>
    </div>
  </section>;
}
