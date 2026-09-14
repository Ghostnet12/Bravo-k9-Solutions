# Navigation and feedback polish

This change builds on production 9e11d12. It keeps existing bookings, membership terms, day credits, payments, trainer capacity and permissions intact.

- The phone/tablet menu puts role-specific account tasks first, labels the public links separately, adds contact/help and keeps Sign out at the bottom. Escape closes the menu and returns focus.
- Staff desk tabs wrap into visible rows on phones. Shortcuts open the credit-day tool or jump to working hours and requests, placing keyboard focus at the destination.
- Account, staff desk and client calendar action results appear in a persistent, dismissible live region, away from the accessibility button. Failed profile saves preserve the form for retry. Initial schedule/desk loading failures offer retry.
- Client accounts show the next future paid/covered visit, including whether confirmation is pending. Profile, billing and review fields use expandable settings; member empty states point to their schedule.
- Back keeps its history behavior and has a predictable account/team destination alongside it. Calendar month changes replace the current history entry, preserve space while fetching, and no longer trigger page-top scrolling. Hash navigation still scrolls to its target and opens details targets.
- Schedule editing starts with three brief steps. Detailed calendar symbols sit in expandable help. Review/save explains when no changes are pending. Trainer weekend tools are explicitly named Open weekend availability.

Verification: production build, existing unit/API and isolated database suites, existing scheduling/login/member/SEO browser suites, plus usability-polish.browser.mjs in Chromium/WebKit for member, staff, administrator and owner. New checks cover actual save failure/retry, visible feedback, keyboard menu close, task destinations, month/history behavior and 320/390/1280/1440 widths. Browser fixtures use isolated data; no customer records are edited by these checks.
