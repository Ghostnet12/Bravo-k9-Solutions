import { Link } from 'react-router-dom';
import { Page } from './ui';

export default function AccessibilityPage() {
  return <Page title="Accessibility at Bravo." eyebrow="ACCESS & SUPPORT" intro="We want everyone to be able to explore our services, request care, and manage their account.">
    <section className="panel prose accessibility-statement" aria-label="Website accessibility statement">
      <p>Bravo K9 Solutions is committed to providing people with disabilities equal access to our services, including through this website, consistent with the Americans with Disabilities Act (ADA).</p>
      <h2>Our accessibility goal</h2>
      <p>We use the <a href="https://www.w3.org/WAI/standards-guidelines/wcag/">Web Content Accessibility Guidelines (WCAG) 2.2, Level AA</a> as our design and testing goal. We review the site and address barriers as we identify them.</p>
      <h2>Using this website</h2>
      <ul>
        <li>Use a keyboard to reach navigation, forms, and buttons. A “Skip to main content” link appears when focused.</li>
        <li>Use your browser’s zoom, or open Accessibility for larger text, higher contrast, and reduced motion.</li>
        <li>Forms provide labels and status or error messages. Mobile layouts allow text and controls to wrap.</li>
        <li>Published training lessons provide caption and transcript controls. Tell us if a description or media alternative does not meet your needs.</li>
      </ul>
      <h2>Need assistance or found a barrier?</h2>
      <p>Call <a href="tel:+16058242767">(605) 824-2767</a>, including through your preferred telecommunications relay service, or <Link to="/community?tab=direct">message the Bravo team</Link> if you can sign in. You can request help with booking, account access, or information in an alternative format.</p>
      <p>Let us know which page or feature caused trouble, what you were trying to do, and how you would like us to respond. Please do not include passwords or payment details.</p>
      <h2>Review status</h2>
      <p>Last updated September 11, 2026. Accessibility evaluation is ongoing. We have not established full WCAG conformance or certified ADA compliance. A complete review with assistive technologies and people with disabilities is still needed. Uploaded media needs continuing review, and Stripe’s hosted payment pages are maintained separately by Stripe.</p>
      <p>We welcome feedback and will work with you to find a usable way to access our services.</p>
    </section>
  </Page>;
}
