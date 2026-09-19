import { Editable } from './SiteContent';
import { Link } from 'react-router-dom';
import { Page } from './ui';

export default function AccessibilityPage() {
  return <Page title="Accessibility at Bravo." eyebrow="ACCESS & SUPPORT" intro="We want everyone to be able to explore our services, request care, and manage their account.">
    <Editable as="section" contentKey="accessibilitypage-1" className="panel accessibility-audit-download" aria-labelledby="accessibility-audit-title">
      <Editable as="p" contentKey="accessibilitypage-2" canEditText className="kicker gold">ACCESSIBILITY AUDIT</Editable>
      <Editable as="h2" contentKey="accessibilitypage-3" canEditText id="accessibility-audit-title">Read our accessibility review.</Editable>
      <Editable as="p" contentKey="accessibilitypage-4" canEditText id="accessibility-audit-description">Our September 11, 2026 report explains the WCAG 2.2 Level AA goal, pages reviewed, improvements published, remaining responsibilities, and ongoing testing schedule.</Editable>
      <Editable as="div" contentKey="accessibilitypage-5" className="accessibility-audit-actions" aria-describedby="accessibility-audit-description">
        <Editable as="a" contentKey="accessibilitypage-6" canEditLink canEditText className="button" href="/reports/bravo-k9-accessibility-audit-2026-09-11.html">Read audit report</Editable>
        <Editable as="a" contentKey="accessibilitypage-7" canEditLink canEditText className="button button-ghost" href="/reports/bravo-k9-accessibility-audit-2026-09-11.html" download="Bravo-K9-Accessibility-Audit-2026-09-11.html">Download audit report</Editable>
      </Editable>
      <Editable as="p" contentKey="accessibilitypage-8" canEditText className="helper">Accessible HTML document · opens or downloads on your device</Editable>
    </Editable>
    <Editable as="section" contentKey="accessibilitypage-9" className="panel prose accessibility-statement" aria-label="Website accessibility statement">
      <Editable as="p" contentKey="accessibilitypage-10" canEditText>Bravo K9 Solutions is committed to providing people with disabilities equal access to our services, including through this website, consistent with the Americans with Disabilities Act (ADA). Accessibility is part of how we design, test, publish, and maintain this site.</Editable>
      <Editable as="h2" contentKey="accessibilitypage-11" canEditText>Our accessibility goal</Editable>
      <Editable as="p" contentKey="accessibilitypage-12">We use the <Editable as="a" contentKey="accessibilitypage-13" canEditLink canEditText href="https://www.w3.org/TR/WCAG22/">Web Content Accessibility Guidelines (WCAG) 2.2, Level AA</Editable> as our design and testing goal, with additional Level AAA practices where practical. We review the site and address barriers as we identify them.</Editable>
      <Editable as="h2" contentKey="accessibilitypage-14" canEditText>Measures we take</Editable>
      <Editable as="ul" contentKey="accessibilitypage-15">
        <Editable as="li" contentKey="accessibilitypage-16" canEditText>Use semantic page structure, visible keyboard focus, labeled forms, status announcements, and controls sized for touch and pointer use.</Editable>
        <Editable as="li" contentKey="accessibilitypage-17" canEditText>Test representative pages at mobile and desktop sizes, with keyboard-only navigation, browser zoom, reduced motion, and higher contrast settings.</Editable>
        <Editable as="li" contentKey="accessibilitypage-18" canEditText>Provide text alternatives for meaningful images and require captions or transcripts for published training media.</Editable>
        <Editable as="li" contentKey="accessibilitypage-19" canEditText>Keep booking and account tasks usable without dragging, timed responses, or memory-based authentication puzzles.</Editable>
      </Editable>
      <Editable as="h2" contentKey="accessibilitypage-20" canEditText>Using this website</Editable>
      <Editable as="ul" contentKey="accessibilitypage-21">
        <Editable as="li" contentKey="accessibilitypage-22" canEditText>Use a keyboard to reach navigation, forms, and buttons. A “Skip to main content” link appears when focused.</Editable>
        <Editable as="li" contentKey="accessibilitypage-23" canEditText>Use your browser’s zoom, or open Accessibility for larger text, higher contrast, and reduced motion.</Editable>
        <Editable as="li" contentKey="accessibilitypage-24" canEditText>Forms provide labels and status or error messages. Mobile layouts allow text and controls to wrap.</Editable>
        <Editable as="li" contentKey="accessibilitypage-25" canEditText>Published training lessons provide caption and transcript controls. Tell us if a description or media alternative does not meet your needs.</Editable>
      </Editable>
      <Editable as="h2" contentKey="accessibilitypage-26" canEditText>Need assistance or found a barrier?</Editable>
      <Editable as="p" contentKey="accessibilitypage-27">Call <Editable as="a" contentKey="accessibilitypage-28" canEditLink canEditText href="tel:+16058242767">(605) 824-2767</Editable>, including through your preferred telecommunications relay service, or <Editable as={Link} contentKey="accessibilitypage-29" canEditLink canEditText to="/community?tab=direct">message the Bravo team</Editable> if you can sign in. You can request help with booking, account access, or information in an alternative format.</Editable>
      <Editable as="p" contentKey="accessibilitypage-30" canEditText>Let us know which page or feature caused trouble, what you were trying to do, and how you would like us to respond. Please do not include passwords or payment details.</Editable>
      <Editable as="h2" contentKey="accessibilitypage-31" canEditText>Review status</Editable>
      <Editable as="p" contentKey="accessibilitypage-32" canEditText>Last updated September 11, 2026. The current implementation has been reviewed against WCAG 2.2 Level AA through code review, structural checks, keyboard testing, contrast review, zoom, and responsive-layout testing. WCAG conformance is evaluated against complete pages and processes; it is not a government certification. We continue to test with assistive technologies and welcome testing and feedback from people with disabilities.</Editable>
      <Editable as="p" contentKey="accessibilitypage-33" canEditText>Uploaded photos, videos, captions, transcripts, and other changing content need continuing review. Stripe’s hosted checkout and billing pages are maintained separately by Stripe; contact us if a third-party step creates a barrier and we will provide assistance.</Editable>
      <Editable as="p" contentKey="accessibilitypage-34" canEditText>We welcome feedback and will work with you to find a usable way to access our services.</Editable>
    </Editable>
  </Page>;
}
