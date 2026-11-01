import TrainingPage from './TrainingPage';
import OurApproachPage from './OurApproachPage';
import TeamPage from './TeamPage';
import ResultsPage from './ResultsPage';
import ReviewsPage from './ReviewsPage';
import TransportPage from './TransportPage';
import ToolsOfTheTradePage from './ToolsOfTheTradePage';
import HowToPage from './HowToPage';
import TrackerGuidePage from './TrackerGuidePage';
import FCISupportPage from './FCISupportPage';
import LivePage from './LivePage';
import WorkshopPage from './WorkshopPage';
// Build-time rendering of the actual public components. No credentials, API
// calls, member content or browser automation are used to produce this HTML.
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { AppProvider } from './context';
import Home from './Home';
import { MobileHomeNav } from './MobileConversion';
import DogTrainingPage from './DogTrainingPage';
import HuntingPage from './HuntingPage';
import BehaviorAssessmentPage from './BehaviorAssessmentPage';
import LearnPage from './LearnPage';
import ContactPage from './ContactPage';
import AccessibilityPage from './AccessibilityPage';
import MediaRightsPage from './MediaRightsPage';
import NotFoundPage from './NotFoundPage';

const pages = { '/training': TrainingPage, '/our-approach': OurApproachPage, '/team': TeamPage, '/results': ResultsPage, '/reviews': ReviewsPage,  '/k9-transport': TransportPage, '/tools-of-the-trade': ToolsOfTheTradePage, '/how-to': HowToPage, '/tracker-guide': TrackerGuidePage, '/fci-support': FCISupportPage, '/live': LivePage, '/workshops': WorkshopPage, '/': Home, '/dog-training': DogTrainingPage, '/hunting-dog-training': HuntingPage, '/behavior-assessment': BehaviorAssessmentPage, '/learn': LearnPage, '/contact': ContactPage, '/accessibility': AccessibilityPage, '/media-rights': MediaRightsPage, '/404': NotFoundPage };
export function renderPublicPage(route) {
  const Component = pages[route];
  if (!Component) throw new Error(`No public component for ${route}`);
  return renderToString(<StaticRouter location={route}><AppProvider><a className="skip-link" href="#main-content">Skip to main content</a><Component/><MobileHomeNav staticFallback/></AppProvider></StaticRouter>);
}

