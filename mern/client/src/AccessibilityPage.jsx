import { Link } from 'react-router-dom';
import { Page } from './ui';

export default function AccessibilityPage() {
  return <Page title="Accessibility at Bravo." eyebrow="ACCESS & SUPPORT" intro="We want everyone to be able to explore our services, request care, and manage their account.">
    <section className="panel prose accessibility-statement" aria-label="Website accessibility statement">
      <p>Bravo K9 Solutions is committed to providing people with disabilities equal access to our services, including through this website, consistent with the Americans with Disabilities Act (ADA). Accessibility is part of how we design, test, publish, and maintain this site.</p>
      <h2>Our accessibility goal</h2>
      <p>We use the <a href="https://www.w3.org/TR/WCAG22/">Web Content Accessibility Guidelines (WCAG) 2.2, Level AA</a> as our design and testing goal, with additional Level AAA practices where practical. We review the site and address barriers as we identify them.</p>
      <h2>Measures we take</h2>
      <ul>
        <li>Use semantic page structure, visible keyboard focus, labeled forms, status announcements, and controls sized for touch and pointer use.</li>
        <li>Test representative pages at mobile and desktop sizes, with keyboard-only navigation, browser zoom, reduced motion, and higher contrast settings.</li>
        <li>Provide text alternatives for meaningful images and require captions or transcripts for published training media.</li>
        <li>Keep booking and account tasks usable without dragging, timed responses, or memory-based authentication puzzles.</li>
      </ul>
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
      <p>Last updated September 11, 2026. The current implementation has been reviewed against WCAG 2.2 Level AA through code review, structural checks, keyboard testing, contrast review, zoom, and responsive-layout testing. WCAG conformance is evaluated against complete pages and processes; it is not a government certification. We continue to test with assistive technologies and welcome testing and feedback from people with disabilities.</p>
      <p>Uploaded photos, videos, captions, transcripts, and other changing content need continuing review. Stripe’s hosted checkout and billing pages are maintained separately by Stripe; contact us if a third-party step creates a barrier and we will provide assistance.</p>
      <p>We welcome feedback and will work with you to find a usable way to access our services.</p>
    </section>
  </Page>;
}
