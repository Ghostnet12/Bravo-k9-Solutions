import { Link } from 'react-router-dom';
import { Page } from './ui';
import { Editable } from './SiteContent';
import { TRAINING_TOOLS } from '../../shared/training-tools';
import './tools-of-the-trade.css';

export default function ToolsOfTheTradePage() {
  return <Page className="tools-page" title="Tools of the trade." eyebrow="THE BRAVO APPROACH" intro="Tools for Bravo’s basic through advanced obedience courses and training.">
    <Editable as="section" contentKey="tools-assessment" className="tools-assessment" aria-labelledby="tools-assessment-title">
      <Editable as="p" contentKey="tools-assessment-eyebrow" canEditText className="kicker gold">ASSESSMENT COMES FIRST</Editable>
      <Editable as="h2" contentKey="tools-assessment-title" canEditText id="tools-assessment-title">We assess your dog first. We only use the tools your dog needs.</Editable>
      <Editable as="p" contentKey="tools-assessment-copy" canEditText>Every dog is different. We look at your dog’s behavior, temperament, training history and your goals before recommending equipment. Not every dog needs every tool shown here.</Editable>
      <Editable as="p" contentKey="tools-assessment-guidance" canEditText className="tools-assessment-guidance">Please speak with Bravo before purchasing. Your trainer will explain any recommendation, check the fit and show you how to use it.</Editable>
      <Link className="tools-text-link" to="/contact">Ask Bravo what your dog needs <span aria-hidden="true">→</span></Link>
    </Editable>

    <section className="tools-catalog" aria-labelledby="tools-catalog-title">
      <div className="tools-catalog-heading">
        <Editable as="h2" contentKey="tools-catalog-title" canEditText id="tools-catalog-title">Get to know the equipment.</Editable>
        <Editable as="p" contentKey="tools-catalog-intro" canEditText>These links are here for clients whose trainer has recommended a specific tool. Check the size and model with Bravo before ordering.</Editable>
      </div>
      <div className="tools-grid">
        {TRAINING_TOOLS.map(tool => <Editable as="article" key={tool.id} contentKey={`tools-${tool.id}-card`} className="tool-card" aria-labelledby={`tool-${tool.id}-title`}>
          <div className="tool-photo"><img src={tool.image} alt={tool.alt} width="679" height="679" loading="lazy" decoding="async"/></div>
          <div className="tool-copy">
            <Editable as="p" contentKey={`tools-${tool.id}-category`} canEditText className="tool-category">{tool.category}</Editable>
            <Editable as="h3" contentKey={`tools-${tool.id}-title`} canEditText id={`tool-${tool.id}-title`}>{tool.name}</Editable>
            <Editable as="p" contentKey={`tools-${tool.id}-description`} canEditText>{tool.description}</Editable>
            <Editable as="p" contentKey={`tools-${tool.id}-detail`} canEditText className="tool-detail">{tool.detail}</Editable>
            <Editable as="a" contentKey={`tools-${tool.id}-purchase`} canEditLink className="button secondary tool-purchase" href={tool.buyUrl} target="_blank" rel="noopener noreferrer" aria-label={`View ${tool.name} on Amazon (opens in a new tab)`}>View on Amazon <span aria-hidden="true">↗</span></Editable>
          </div>
        </Editable>)}
      </div>
      <Editable as="p" contentKey="tools-retailer-note" canEditText className="tools-retailer-note">Purchase links open Amazon in a new tab. Current prices, sizes, availability and checkout are on Amazon.</Editable>
    </section>

    <Editable as="section" contentKey="tools-next-step" className="tools-next-step" aria-labelledby="tools-next-title">
      <div><Editable as="h2" contentKey="tools-next-title" canEditText id="tools-next-title">Start with an assessment.</Editable><Editable as="p" contentKey="tools-next-copy" canEditText>Tell us what you’re working on. We’ll assess your dog and explain the next step, including whether any equipment is needed.</Editable></div>
      <Link className="button" to="/portal?program=training">Plan a first visit <span aria-hidden="true">→</span></Link>
    </Editable>
  </Page>;
}
