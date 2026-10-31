import { CINEMATIC_HERO_SOURCE, CINEMATIC_HERO_ALT } from './cinematic-hero.js';
export const SITE_ORIGIN = 'https://bravounleashed.com';
export const PAGE_METADATA = {
  '/training': { title: "Training Programs & Pricing | Bravo K9 Solutions", description: "Explore private obedience, puppy foundations, behavior assessments and specialist training with Bravo in Aberdeen, South Dakota.", label: "Training" },
  '/our-approach': { title: "The Bravo Approach | Bravo K9 Solutions", description: "Explore Trust. Train. Deploy. See what happens at your first Bravo session and how we practice together.", label: "Our approach" },
  '/team': { title: "Meet the Bravo Team | Bravo K9 Solutions", description: "Meet the Bravo K9 trainers, explore their experience and working hours, and choose the right person for your dog.", label: "The team" },
  '/results': { title: "Bravo Training in Action | Bravo K9 Solutions", description: "Watch Bravo training sessions and explore real dogs practicing in everyday places.", label: "Training in action" },
  '/reviews': { title: "Client Reviews | Bravo K9 Solutions", description: "Read client experiences and Bravo account reviews from dog owners training with Bravo K9 Solutions.", label: "Client reviews" },

  '/k9-transport': { title: 'K9 Transport — Coming Soon | Bravo K9 Solutions', description: 'Dedicated canine transport from Bravo K9 Solutions is on the way. Meet our Durango and request a launch update.', label: 'K9 transport', image: '/images/bravo-k9-transport.webp', imageAlt: 'Bravo’s black Dodge Durango on a road at sunset' },
  '/tools-of-the-trade': { title: 'Tools of the Trade | Bravo K9 Solutions', description: 'Explore tools for Bravo’s basic through advanced obedience courses and training. We assess each dog first and recommend only the tools their individual training plan needs.', label: 'Tools of the trade' },
  '/how-to': { title: 'How to Use the Website | Bravo K9 Solutions', description: 'Watch the step-by-step Bravo website guide. Learn to sign in, create a training schedule, add or cancel days, download your schedule and get help.', label: 'How-to video' },
  '/fci-support': { title: 'FCI Support | Bravo K9 Solutions', description: 'Explore Bravo K9 Solutions support for responsible breeding, breed heritage, canine welfare and official FCI resources.', label: 'FCI Support' },
  '/hunting-dog-training': { title: 'Hunting Dog Training in Aberdeen, SD | Bravo K9 Solutions', description: 'Discuss hunting-dog training goals with Bravo in Aberdeen, South Dakota. Explore field obedience, recall and retrieving goals, suitability and individually scoped plans.', label: 'Hunting dog training', service: 'Individually scoped hunting dog training' },
  '/live': { title: 'Bravo Live | Real Dog Training, Right Now', description: 'Watch live dog training with Bravo K9 Solutions. Real dogs, real sessions, real progress.', label: 'Live cams' },
  '/live/studio': { title: 'Go Live | Bravo Trainer Studio', description: 'Start a public or client-only Bravo training session from your phone.', private: true },
  '/': { title: 'Mobile Dog Training in Aberdeen, SD | Bravo K9 Solutions', description: 'Private, in-home dog training in Aberdeen, South Dakota. Build everyday skills with Bravo K9 Solutions. We come to you.', label: 'Home', image: CINEMATIC_HERO_SOURCE, imageAlt: CINEMATIC_HERO_ALT },
  '/dog-training': { title: 'In-Home Dog Training in Aberdeen, SD | Bravo K9 Solutions', description: 'Private mobile dog training in Aberdeen, SD, for puppy foundations, obedience and everyday behavior. Explore how Bravo works and request your first visit.', label: 'Dog training', service: 'Private mobile dog training', image: '/images/obedience-real-world.webp', imageAlt: 'Trainer and dog owner working together outdoors' },
  '/behavior-assessment': { title: 'Dog Behavior Assessment in Aberdeen, SD | Bravo K9 Solutions', description: 'Start with a two-trainer assessment for aggressive-dog behavior in Aberdeen, SD. Discuss handling concerns, your dog’s history and next steps with Bravo.', label: 'Behavior assessment', service: 'Aggressive-dog intake and behavior assessment' },
  '/workshops': { title: 'Dog Training Workshops | Bravo K9 Solutions', description: 'Explore Bravo dog-training workshops. See the announced date, price and session details, and contact the trainers to reserve a seat.', label: 'Workshops' },
  '/learn': { title: 'Online Dog Training Lessons | Bravo K9 Solutions', description: 'Explore Bravo online dog-training education from David and Ashley. Request a launch update or access published lessons when the library is open.', label: 'Online lessons', image: '/images/training-education.webp', imageAlt: 'Bravo training lesson with a handler and Belgian Malinois' },
  '/contact': { title: 'Contact Bravo K9 Solutions | Aberdeen Dog Training', description: 'Call Bravo K9 Solutions at (605) 824-2767 for private dog training in Aberdeen, SD. Get help choosing a program or managing a visit.', label: 'Contact', type: 'ContactPage' },
  '/accessibility': { title: 'Accessibility Statement | Bravo K9 Solutions', description: 'Read Bravo K9 Solutions’ website accessibility commitment, available features, review status, and ways to request assistance.', label: 'Accessibility' },
  '/media-rights': { title: 'Media Permissions | Bravo K9 Solutions', description: 'Contact Bravo K9 Solutions about reuse of its website media and brand assets.', label: 'Media permissions' },
  // Transactional and personal screens stay usable but are not search landing pages.
  '/portal': { title: 'Book Dog Training | Bravo K9 Solutions', description: 'Choose your Bravo program and request available visits.', private: true },
  '/account': { title: 'Your Account | Bravo K9 Solutions', description: 'Manage your Bravo account, visit requests, and care details.', private: true },
  '/schedule': { title: 'Your Schedule | Bravo K9 Solutions', description: 'View and manage your saved Bravo visits.', private: true },
  '/reset-password': { title: 'Reset Your Password | Bravo K9 Solutions', description: 'Securely reset your Bravo account password.', private: true },
  '/community': { title: 'Bravo Room | Bravo K9 Solutions', description: 'Member conversations and updates from the Bravo team.', private: true },
  '/admin': { title: 'Owner & Staff Desk | Bravo K9 Solutions', description: 'Bravo scheduling, lesson publishing, messages, and account management.', private: true },
};
export const NOT_FOUND_METADATA = { title: 'Page Not Found | Bravo K9 Solutions', description: 'Find dog training, behavior assessments and contact information at Bravo K9 Solutions.', private: true };
export const publicRoutes = () => Object.entries(PAGE_METADATA).filter(([, data]) => !data.private);
export const canonicalUrl = route => SITE_ORIGIN + (route === '/' ? '/' : route.replace(/\/+$/, ''));
export const robotsContent = data => !data || data.private ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
export const socialImage = data => SITE_ORIGIN + (data?.image || '/images/hero-bravo-launch.webp');
export const socialImageAlt = data => data?.imageAlt || 'Professional Bravo K9 trainer working with a Belgian Malinois near Aberdeen, South Dakota';

export function structuredData(route) {
  const data = PAGE_METADATA[route];
  if (!data || data.private) return null;
  const url = canonicalUrl(route), businessId = `${SITE_ORIGIN}/#business`, websiteId = `${SITE_ORIGIN}/#website`;
  const area = { '@type': 'City', name: 'Aberdeen, South Dakota' };
  const graph = [
    { '@type': 'LocalBusiness', '@id': businessId, name: 'Bravo K9 Solutions', legalName: 'Bravo K9 Solutions, LLC', url: `${SITE_ORIGIN}/`, telephone: '+1-605-824-2767', description: 'Professional mobile dog training in Aberdeen, South Dakota. We come to you.', logo: `${SITE_ORIGIN}/bravo-shield-192.png`, image: `${SITE_ORIGIN}${CINEMATIC_HERO_SOURCE}`, address: { '@type': 'PostalAddress', addressLocality: 'Aberdeen', addressRegion: 'SD', addressCountry: 'US' }, areaServed: area },
    { '@type': 'WebSite', '@id': websiteId, url: `${SITE_ORIGIN}/`, name: 'Bravo K9 Solutions', alternateName: 'Bravo Unleashed', publisher: { '@id': businessId }, inLanguage: 'en-US' },
    { '@type': data.type || 'WebPage', '@id': `${url}#webpage`, url, name: data.title, description: data.description, isPartOf: { '@id': websiteId }, about: { '@id': businessId }, inLanguage: 'en-US', ...(route !== '/' ? { breadcrumb: { '@id': `${url}#breadcrumbs` } } : {}) },
  ];
  if (route !== '/') graph.push({ '@type': 'BreadcrumbList', '@id': `${url}#breadcrumbs`, itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
    { '@type': 'ListItem', position: 2, name: data.label, item: url },
  ] });
  if (data.service) graph.push({ '@type': 'Service', '@id': `${url}#service`, name: data.service, serviceType: data.service, url, description: data.description, provider: { '@id': businessId }, areaServed: area, mainEntityOfPage: { '@id': `${url}#webpage` } });
  return { '@context': 'https://schema.org', '@graph': graph };
}
