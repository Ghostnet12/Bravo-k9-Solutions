import { PAGE_METADATA, NOT_FOUND_METADATA, canonicalUrl, robotsContent, socialImage, socialImageAlt, structuredData } from '../../shared/page-metadata';
import React, { useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider, useBravo } from './context';
import PasswordSetupGate from './PasswordSetupGate';
import { mountSiteImages } from './site-image-editor.js';
import { isImageEditor } from '../../shared/site-images.js';
import Home from './Home';
import Accessibility from './Accessibility';
import AccessibilityPage from './AccessibilityPage';
import NotFoundPage from './NotFoundPage';
import { Page } from './ui';
import './legacy.css';
import './styles.css';
import './professional.css';
import './site-image-editor.css';
import './accessibility-layout.css';
import './reset-layout.css';
const DogTrainingPage = lazy(() => import('./DogTrainingPage'));
const BehaviorAssessmentPage = lazy(() => import('./BehaviorAssessmentPage'));
const MediaRightsPage = lazy(() => import('./MediaRightsPage'));
const SchedulePage = lazy(() => import('./SchedulePage'));
const ResetPasswordPage = lazy(() => import('./ResetPasswordPage'));
const BookingPage = lazy(() => import('./BookingPage'));
const AccountPage = lazy(() => import('./AccountPage'));
const LearnPage = lazy(() => import('./LearnPage'));
const CommunityPage = lazy(() => import('./CommunityPage'));
const ContactPage = lazy(() => import('./ContactPage'));
const AdminPage = lazy(() => import('./AdminPage'));
const DogWalkingPage = lazy(() => import('./DogWalkingPage'));
function SiteImageTools() {
  const { user } = useBravo();
  useEffect(() => mountSiteImages({ canEdit: isImageEditor(user) }), [user?.id, user?.role]);
  return null;
}
function RouteBehavior() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const timer = setTimeout(() => {
      let anchor = hash.slice(1);
      try { anchor = decodeURIComponent(anchor); } catch { /* Malformed links must not crash navigation. */ }
      const target = hash ? document.getElementById(anchor) : document.getElementById('main-content');
      if (hash) target?.scrollIntoView({ behavior: 'instant' });
      else target?.focus({ preventScroll: true });
    }, 100);
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
    return () => clearTimeout(timer);
  }, [pathname, search, hash]);
  return null;
}
class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <Page title="Let’s get you back on track."><p>The page couldn’t load. Your saved bookings are not affected.</p><a className="button" href="/">Reload Bravo</a></Page> : this.props.children; }
}
function BookingRoute() { const location = useLocation(); return <BookingPage key={location.search}/>; }
function App() { return <BrowserRouter><AppProvider><a className="skip-link" href="#main-content">Skip to main content</a><RouteBehavior/><ErrorBoundary><Suspense fallback={<Page title="Opening Bravo…"><p role="status">Loading your page.</p></Page>}><PasswordSetupGate><Routes><Route path="/schedule" element={<SchedulePage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/" element={<Home/>}/><Route path="/dog-training" element={<DogTrainingPage/>}/><Route path="/behavior-assessment" element={<BehaviorAssessmentPage/>}/><Route path="/dog-walking" element={<DogWalkingPage/>}/><Route path="/portal" element={<BookingRoute/>}/><Route path="/account" element={<AccountPage/>}/><Route path="/learn" element={<LearnPage/>}/><Route path="/community" element={<CommunityPage/>}/><Route path="/contact" element={<ContactPage/>}/><Route path="/admin" element={<AdminPage/>}/><Route path="/accessibility" element={<AccessibilityPage/>}/><Route path="/media-rights" element={<MediaRightsPage/>}/><Route path="*" element={<NotFoundPage/>}/></Routes></PasswordSetupGate></Suspense></ErrorBoundary><Accessibility/><SiteImageTools/></AppProvider></BrowserRouter>; }
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
