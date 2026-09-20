// Build-time rendering of the actual public components. No credentials, API
// calls, member content or browser automation are used to produce this HTML.
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { AppProvider } from './context';
import Home from './Home';
import DogTrainingPage from './DogTrainingPage';
import BehaviorAssessmentPage from './BehaviorAssessmentPage';
import DogWalkingPage from './DogWalkingPage';
import LearnPage from './LearnPage';
import ContactPage from './ContactPage';
import AccessibilityPage from './AccessibilityPage';
import MediaRightsPage from './MediaRightsPage';
import NotFoundPage from './NotFoundPage';

const pages = { '/': Home, '/dog-training': DogTrainingPage, '/behavior-assessment': BehaviorAssessmentPage, '/dog-walking': DogWalkingPage, '/learn': LearnPage, '/contact': ContactPage, '/accessibility': AccessibilityPage, '/media-rights': MediaRightsPage, '/404': NotFoundPage };
export function renderPublicPage(route) {
  const Component = pages[route];
  if (!Component) throw new Error(`No public component for ${route}`);
  return renderToString(<StaticRouter location={route}><AppProvider><a className="skip-link" href="#main-content">Skip to main content</a><Component/></AppProvider></StaticRouter>);
}
