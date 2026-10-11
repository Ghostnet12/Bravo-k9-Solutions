import { useLocation, Link } from 'react-router-dom';
import { huntingInquiryContext } from '../../shared/field-experience';
import './field-experience.css';
export default function ContactInterest() {
  const { search } = useLocation(), context = huntingInquiryContext(search);
  if (!context) return null;
  return <section className="contact-interest panel" aria-labelledby="contact-interest-title"><p className="cinema-eyebrow">LET’S START THE CONVERSATION</p><h2 id="contact-interest-title">You’re asking about hunting training.</h2>{context.goal && <p><strong>Your selected interest:</strong> {context.goal}</p>}<p>When you contact Bravo, mention hunting training and tell us about your dog’s age, experience and goals. No booking or payment has been submitted.</p><div className="field-actions"><a className="button" href="tel:+16058242767">Call Bravo about hunting</a><Link className="inline-link" to="/hunting-dog-training">Back to hunting training</Link><Link className="inline-link" to="/contact">Clear selected interest</Link></div><p className="helper">Prefer a written conversation? Signed-in clients can use the private messages below. This selection is a conversation aid, not a sent message.</p></section>;
}
