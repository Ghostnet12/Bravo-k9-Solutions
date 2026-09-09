import React, { useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from './context';
import Home from './Home';
import Accessibility from './Accessibility';
import { Page } from './ui';
import './legacy.css';
import './styles.css';
const BookingPage = lazy(() => import('./BookingPage'));
const AccountPage = lazy(() => import('./AccountPage'));
const LearnPage = lazy(() => import('./LearnPage'));
const CommunityPage = lazy(() => import('./CommunityPage'));
const AdminPage = lazy(() => import('./AdminPage'));
function RouteBehavior() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const timer = setTimeout(() => {
      const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : document.getElementById('main-content');
      if (hash) target?.scrollIntoView({ behavior: 'instant' });
      else target?.focus({ preventScroll: true });
    }, 100);
    const titles = { '/': 'Real-world mobile dog training', '/portal': 'Book your program', '/portal/dog-sitting': 'Schedule dog sitting', '/account': 'Your Bravo account', '/learn': 'Online training', '/community': 'Bravo Room', '/admin': 'Staff desk' };
    document.title = `${titles[pathname] || 'Bravo K9 Solutions'} | Bravo K9 Solutions`;
    return () => clearTimeout(timer);
  }, [pathname, search, hash]);
  return null;
}
class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <Page title="Let’s get you back on track."><p>The page couldn’t load. Your saved bookings are not affected.</p><a className="button" href="/">Reload Bravo</a></Page> : this.props.children; }
}
function App() { return <BrowserRouter><AppProvider><a className="skip-link" href="#main-content">Skip to main content</a><RouteBehavior/><ErrorBoundary><Suspense fallback={<Page title="Opening Bravo…"><p role="status">Loading your page.</p></Page>}><Routes><Route path="/" element={<Home/>}/><Route path="/portal" element={<BookingPage key="programs"/>}/><Route path="/portal/dog-sitting" element={<BookingPage key="sitting" sitting/>}/><Route path="/account" element={<AccountPage/>}/><Route path="/learn" element={<LearnPage/>}/><Route path="/community" element={<CommunityPage/>}/><Route path="/admin" element={<AdminPage/>}/><Route path="/media-rights" element={<Page title="Bravo media & permissions" eyebrow="Brand standards"><div className="panel prose"><p>Bravo’s logo, team photographs, copy, and branded materials are provided for viewing on this website. Contact Bravo K9 Solutions for permission before reusing them.</p><p>Rights depend on the individual asset and its applicable license. A notice or a browser control does not establish ownership or make an image impossible to copy.</p><p>For permission requests, call <a href="tel:+16058242767">(605) 824-2767</a>. Please identify the image and intended use.</p></div></Page>}/><Route path="*" element={<Page title="That page wandered off."><p>Head back to Bravo and we’ll get you where you need to go.</p><a className="button" href="/">Back to home</a></Page>}/></Routes></Suspense></ErrorBoundary><Accessibility/></AppProvider></BrowserRouter>; }
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
