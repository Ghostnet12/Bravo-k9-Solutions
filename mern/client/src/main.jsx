import { SiteContentProvider } from './SiteContent';
import SiteTelemetry from './SiteTelemetry';
import { LiveStatusProvider } from './live-state';
import SiteSoundtrack from './SiteSoundtrack';
import { reportBrowserError } from './telemetry';
import { PAGE_METADATA, NOT_FOUND_METADATA, canonicalUrl, robotsContent, socialImage, socialImageAlt, structuredData } from '../../shared/page-metadata';
import React, { useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider, useBravo } from './context';
import PasswordSetupGate from './PasswordSetupGate';
import { mountSiteImages } from './site-image-editor.js';
import { isImageEditor } from '../../shared/site-images.js';
import Home from './Home';
import { MobileHomeNav } from './MobileConversion';
import AdvertisementManagement from './AdvertisementManagement';
import AccessibilityPage from './AccessibilityPage';
import NotFoundPage from './NotFoundPage';
import { Page } from './ui';
import './legacy.css';
import './styles.css';
import './professional.css';
import './site-image-editor.css';
import './accessibility-layout.css';
import './reset-layout.css';
import './usability-polish.css';
import './cinematic-home.css';
import './bravo-theme.css';
import './discovery.css';
import './persistent-navigation.css';
import './homepage-optimization.css';
// Keep the server-rendered public page readable until its interactive module
// is ready. A failed chunk must not replace useful HTML with a loading/error shell.
const publicPageLoaders = {
  '/tools-of-the-trade': () => import('./ToolsOfTheTradePage'),
  '/how-to': () => import('./HowToPage'),
  '/live': () => import('./LivePage'),
  '/workshops': () => import('./WorkshopPage'),
  '/dog-training': () => import('./DogTrainingPage'),
  '/hunting-dog-training': () => import('./HuntingPage'),
  '/behavior-assessment': () => import('./BehaviorAssessmentPage'),
  '/media-rights': () => import('./MediaRightsPage'),
  '/learn': () => import('./LearnPage'),
  '/contact': () => import('./ContactPage'),
  '/fci-support': () => import('./FCISupportPage'),
  '/dog-walking': () => import('./DogWalkingPage'),
};
let initialPublicPage = null;
function publicPage(path) {
  const Deferred = lazy(publicPageLoaders[path]);
  return function PublicPage(props) {
    const Component = initialPublicPage?.path === path ? initialPublicPage.Component : Deferred;
    return <Component {...props}/>;
  };
}
const ToolsOfTheTradePage = publicPage('/tools-of-the-trade');
const HowToPage = publicPage('/how-to');
const WorkshopPage = publicPage('/workshops');
const DogTrainingPage = publicPage('/dog-training');
const HuntingPage = publicPage('/hunting-dog-training');
const BehaviorAssessmentPage = publicPage('/behavior-assessment');
const MediaRightsPage = publicPage('/media-rights');
const SchedulePage = lazy(() => import('./SchedulePage'));
const ResetPasswordPage = lazy(() => import('./ResetPasswordPage'));
const BookingPage = lazy(() => import('./BookingPage'));
const AccountPage = lazy(() => import('./AccountPage'));
const LearnPage = publicPage('/learn');
const CommunityPage = lazy(() => import('./CommunityPage'));
const ContactPage = publicPage('/contact');
const FCISupportPage = publicPage('/fci-support');
const LivePage = publicPage('/live');
const LiveStudio = lazy(() => import('./LiveStudio'));
const AdminPage = lazy(() => import('./AdminPage'));
const DogWalkingPage = publicPage('/dog-walking');
function SiteImageTools() {
  const { user } = useBravo();
  useEffect(() => mountSiteImages({ canEdit: isImageEditor(user) && !user?.mustChangePassword }), [user?.id, user?.role, user?.mustChangePassword]);
  return null;
}
function RouteBehavior() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    history.scrollRestoration = 'manual';
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    let cancelled = false;
    let frame = 0, focusedAnchor = null, movingAnchorFocus = false;
    let anchor = hash.slice(1);
    try { anchor = decodeURIComponent(anchor); } catch { /* Malformed links must not crash navigation. */ }
    const alignAnchor = () => {
      if (cancelled || !hash) return;
      const target = document.getElementById(anchor);
      if (target?.tagName === 'DETAILS') target.open = true;
      target?.scrollIntoView({ behavior: 'instant' });
      if (target && target !== focusedAnchor) {
        if (!target.hasAttribute('tabindex') && !target.matches('a[href],button,input,select,textarea')) target.tabIndex = -1;
        focusedAnchor = target; movingAnchorFocus = true;
        try { target.focus({ preventScroll: true }); } finally { movingAnchorFocus = false; }
      }
    };
    const scheduleAlignment = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(alignAnchor);
    };
    // A route can mount before fonts, reviews, and proof media settle.
    // Keep its destination aligned briefly instead of first jumping to the hero.
    const layout = hash ? new ResizeObserver(scheduleAlignment) : null;
    layout?.observe(document.body);
    const additions = hash ? new MutationObserver(scheduleAlignment) : null;
    additions?.observe(document.getElementById('root'), { childList: true, subtree: true });
    alignAnchor();
    const timer = setTimeout(async () => {
      if (hash && document.fonts) await document.fonts.ready;
      if (cancelled) return;
      if (hash) alignAnchor();
      else document.getElementById('main-content')?.focus({ preventScroll: true });
    }, 100);
    const stopAlignment = () => {
      cancelled = true; clearTimeout(timer); cancelAnimationFrame(frame);
      layout?.disconnect(); additions?.disconnect();
    };
    const deadline = setTimeout(stopAlignment, 5000);
    // A navigation link receiving focus is part of the same tap, not a request
    // to abandon its destination. New gestures and form/editor focus take over.
    const cancelRouteFocus = event => {
      if (movingAnchorFocus) return;
      if (hash && event?.type === 'focusin' && event.target.closest?.('a[href]')) return;
      stopAlignment();
    };
    const events = ['pointerdown', 'keydown', 'focusin', 'input', 'wheel', 'touchmove'];
    events.forEach(type => document.addEventListener(type, cancelRouteFocus, { capture: true, passive: true }));
    const metadata = PAGE_METADATA[pathname] || NOT_FOUND_METADATA;
    document.title = metadata.title;
    function meta(selector, attributes) {
      let element = document.head.querySelector(selector);
      if (!element) { element = document.createElement(selector.startsWith('link') ? 'link' : 'meta'); document.head.appendChild(element); }
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    }
    meta('meta[name="description"]', { name: 'description', content: metadata?.description || 'Return to Bravo K9 Solutions.' });
    meta('meta[name="robots"]', { name: 'robots', content: robotsContent(metadata) });
    if (PAGE_METADATA[pathname]) meta('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl(pathname) });
    else document.head.querySelector('link[rel="canonical"]')?.remove();
    meta('meta[property="og:title"]', { property: 'og:title', content: document.title });
    meta('meta[property="og:description"]', { property: 'og:description', content: metadata?.description || '' });
    meta('meta[property="og:url"]', { property: 'og:url', content: PAGE_METADATA[pathname] ? canonicalUrl(pathname) : '' });
    meta('meta[property="og:image"]', { property: 'og:image', content: socialImage(metadata) });
    meta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: socialImageAlt(metadata) });
    for (const [name, content] of Object.entries({ 'twitter:card': 'summary_large_image', 'twitter:title': metadata.title, 'twitter:description': metadata.description, 'twitter:image': socialImage(metadata), 'twitter:image:alt': socialImageAlt(metadata) })) meta(`meta[name="${name}"]`, { name, content });
    let schema = document.head.querySelector('#bravo-structured-data');
    const data = structuredData(pathname);
    if (data) {
      if (!schema) { schema = document.createElement('script'); schema.type = 'application/ld+json'; schema.id = 'bravo-structured-data'; document.head.appendChild(schema); }
      schema.textContent = JSON.stringify(data);
    } else schema?.remove();
    return () => {
      stopAlignment(); clearTimeout(deadline);
      events.forEach(type => document.removeEventListener(type, cancelRouteFocus, true));
    };
  }, [pathname, hash]);
  return null;
}
class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch() { reportBrowserError('page_crash'); }
  render() { return this.state.error ? <Page title="Let’s get you back on track."><p>The page couldn’t load. Your saved bookings are not affected.</p><a className="button" href="/">Reload Bravo</a></Page> : this.props.children; }
}
function BookingRoute() { const location = useLocation(); return <BookingPage key={location.search}/>; }
function App() { return <BrowserRouter><AppProvider><LiveStatusProvider><SiteContentProvider><a className="skip-link" href="#main-content">Skip to main content</a><RouteBehavior/><SiteTelemetry/><SiteSoundtrack/><ErrorBoundary><Suspense fallback={<Page title="Opening Bravo…"><p role="status">Loading your page.</p></Page>}><PasswordSetupGate><Routes><Route path="/tools-of-the-trade" element={<ToolsOfTheTradePage/>}/><Route path="/how-to" element={<HowToPage/>}/><Route path="/live" element={<LivePage/>}/><Route path="/live/studio" element={<LiveStudio/>}/><Route path="/schedule" element={<SchedulePage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/" element={<Home/>}/><Route path="/workshops" element={<WorkshopPage/>}/><Route path="/dog-training" element={<DogTrainingPage/>}/><Route path="/hunting-dog-training" element={<HuntingPage/>}/><Route path="/behavior-assessment" element={<BehaviorAssessmentPage/>}/><Route path="/dog-walking" element={<DogWalkingPage/>}/><Route path="/portal" element={<BookingRoute/>}/><Route path="/account" element={<AccountPage/>}/><Route path="/learn" element={<LearnPage/>}/><Route path="/community" element={<CommunityPage/>}/><Route path="/contact" element={<ContactPage/>}/><Route path="/fci-support" element={<FCISupportPage/>}/><Route path="/admin" element={<AdminPage/>}/><Route path="/accessibility" element={<AccessibilityPage/>}/><Route path="/media-rights" element={<MediaRightsPage/>}/><Route path="*" element={<NotFoundPage/>}/></Routes></PasswordSetupGate></Suspense></ErrorBoundary><AdvertisementManagement/><MobileHomeNav/><SiteImageTools/></SiteContentProvider></LiveStatusProvider></AppProvider></BrowserRouter>; }
const start = () => createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
const initialPath = window.location.pathname;
if (publicPageLoaders[initialPath]) {
  publicPageLoaders[initialPath]().then(module => {
    initialPublicPage = { path: initialPath, Component: module.default };
    start();
  }).catch(() => { reportBrowserError('page_crash'); });
} else start();

// Register on the live entry point so ordinary account workflows are unchanged.
if ('serviceWorker' in navigator && window.location.pathname.startsWith('/live')) window.addEventListener('load', () => navigator.serviceWorker.register('/live-sw.js', { scope: '/live/' }).catch(() => {}));
