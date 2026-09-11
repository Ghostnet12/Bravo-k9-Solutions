import { PAGE_METADATA, SITE_ORIGIN } from '../../shared/page-metadata';
import React, { useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider, useBravo } from './context';
import { mountSiteImages } from './site-image-editor.js';
import { isImageEditor } from '../../shared/site-images.js';
import Home from './Home';
import Accessibility from './Accessibility';
import AccessibilityPage from './AccessibilityPage';
import { Page } from './ui';
import './legacy.css';
import './styles.css';
import './professional.css';
import './site-image-editor.css';
import './accessibility-layout.css';
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
    const metadata = PAGE_METADATA[pathname];
    document.title = metadata?.title || 'Page not found | Bravo K9 Solutions';
    function meta(selector, attributes) {
      let element = document.head.querySelector(selector);
      if (!element) { element = document.createElement(selector.startsWith('link') ? 'link' : 'meta'); document.head.appendChild(element); }
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    }
    meta('meta[name="description"]', { name: 'description', content: metadata?.description || 'Return to Bravo K9 Solutions.' });
    meta('meta[name="robots"]', { name: 'robots', content: !metadata || metadata.private ? 'noindex, nofollow' : 'index, follow' });
    meta('link[rel="canonical"]', { rel: 'canonical', href: SITE_ORIGIN + pathname });
    meta('meta[property="og:title"]', { property: 'og:title', content: document.title });
    meta('meta[property="og:description"]', { property: 'og:description', content: metadata?.description || '' });
    meta('meta[property="og:url"]', { property: 'og:url', content: SITE_ORIGIN + pathname });
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
function App() { return <BrowserRouter><AppProvider><a className="skip-link" href="#main-content">Skip to main content</a><RouteBehavior/><ErrorBoundary><Suspense fallback={<Page title="Opening Bravo…"><p role="status">Loading your page.</p></Page>}><Routes><Route path="/" element={<Home/>}/><Route path="/dog-walking" element={<DogWalkingPage/>}/><Route path="/portal" element={<BookingRoute/>}/><Route path="/account" element={<AccountPage/>}/><Route path="/learn" element={<LearnPage/>}/><Route path="/community" element={<CommunityPage/>}/><Route path="/contact" element={<ContactPage/>}/><Route path="/admin" element={<AdminPage/>}/><Route path="/accessibility" element={<AccessibilityPage/>}/><Route path="/media-rights" element={<Page title="Bravo media & permissions" eyebrow="Brand standards"><div className="panel prose"><p>Bravo’s logo, team photographs, copy, and branded materials are provided for viewing on this website. Contact Bravo K9 Solutions for permission before reusing them.</p><p>Rights depend on the individual asset and its applicable license. A notice or a browser control does not establish ownership or make an image impossible to copy.</p><p>For permission requests, call <a href="tel:+16058242767">(605) 824-2767</a>. Please identify the image and intended use.</p></div></Page>}/><Route path="*" element={<Page title="That page wandered off."><p>Head back to Bravo and we’ll get you where you need to go.</p><a className="button" href="/">Back to home</a></Page>}/></Routes></Suspense></ErrorBoundary><Accessibility/><SiteImageTools/></AppProvider></BrowserRouter>; }
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
