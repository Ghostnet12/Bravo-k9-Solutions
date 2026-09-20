export const SITE_ORIGIN = 'https://bravounleashed.com';
export const PAGE_METADATA = {
  '/': { title: 'Mobile Dog Training in Aberdeen, SD | Bravo K9 Solutions', description: 'Private, in-home dog training and professional dog walking in Aberdeen, South Dakota. Build everyday skills with Bravo K9 Solutions. We come to you.', label: 'Home' },
  '/dog-training': { title: 'In-Home Dog Training in Aberdeen, SD | Bravo K9 Solutions', description: 'Private mobile dog training in Aberdeen, SD, for puppy foundations, obedience and everyday behavior. Explore how Bravo works and request your first visit.', label: 'Dog training', service: 'Private mobile dog training', image: '/images/obedience-real-world.webp', imageAlt: 'Trainer and dog owner working together outdoors' },
  '/behavior-assessment': { title: 'Dog Behavior Assessment in Aberdeen, SD | Bravo K9 Solutions', description: 'Start with a two-trainer assessment for aggressive-dog behavior in Aberdeen, SD. Discuss handling concerns, your dog’s history and next steps with Bravo.', label: 'Behavior assessment', service: 'Aggressive-dog intake and behavior assessment' },
  '/dog-walking': { title: 'Dog Walking in Aberdeen, SD | Bravo K9 Solutions', description: 'Professional 30-minute dog walks in Aberdeen, South Dakota. See per-dog pricing, request available visits and get dependable support from the Bravo team.', label: 'Dog walking', service: '30-minute dog walking' },
  '/learn': { private: true, title: 'Online Dog Training Lessons | Bravo K9 Solutions', description: 'Explore Bravo’s online dog training library. Active members can watch published lessons with English captions and written transcripts between sessions.', label: 'Online lessons', image: '/images/training-education.webp', imageAlt: 'Bravo training lesson with a handler and Belgian Malinois' },
  '/contact': { title: 'Contact Bravo K9 Solutions | Aberdeen Dog Training', description: 'Call Bravo K9 Solutions at (605) 824-2767 for mobile dog training and dog walking in Aberdeen, SD. Get help choosing a program or managing a visit.', label: 'Contact', type: 'ContactPage' },
  '/accessibility': { title: 'Accessibility Statement | Bravo K9 Solutions', description: 'Read Bravo K9 Solutions’ website accessibility commitment, available features, review status, and ways to request assistance.', label: 'Accessibility' },
  '/media-rights': { title: 'Media Permissions | Bravo K9 Solutions', description: 'Contact Bravo K9 Solutions about reuse of its website media and brand assets.', label: 'Media permissions' },
  // Transactional and personal screens stay usable but are not search landing pages.
  '/portal': { title: 'Book Dog Training & Walking | Bravo K9 Solutions', description: 'Choose your Bravo program and request available visits.', private: true },
  '/account': { title: 'Your Account | Bravo K9 Solutions', description: 'Manage your Bravo account, visit requests, and care details.', private: true },
  '/schedule': { title: 'Your Schedule | Bravo K9 Solutions', description: 'View and manage your saved Bravo visits.', private: true },
  '/reset-password': { title: 'Reset Your Password | Bravo K9 Solutions', description: 'Securely reset your Bravo account password.', private: true },
  '/community': { title: 'Bravo Room | Bravo K9 Solutions', description: 'Member conversations and updates from the Bravo team.', private: true },
  '/admin': { title: 'Owner & Staff Desk | Bravo K9 Solutions', description: 'Bravo scheduling, lesson publishing, messages, and account management.', private: true },
};
export const NOT_FOUND_METADATA = { title: 'Page Not Found | Bravo K9 Solutions', description: 'Find dog training, dog walking and contact information at Bravo K9 Solutions.', private: true };
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
    { '@type': 'LocalBusiness', '@id': businessId, name: 'Bravo K9 Solutions', legalName: 'Bravo K9 Solutions, LLC', url: `${SITE_ORIGIN}/`, telephone: '+1-605-824-2767', description: 'Professional mobile dog training and dog walking in Aberdeen, South Dakota. We come to you.', logo: `${SITE_ORIGIN}/bravo-shield-192.png`, image: `${SITE_ORIGIN}/images/hero-bravo-launch.webp`, address: { '@type': 'PostalAddress', addressLocality: 'Aberdeen', addressRegion: 'SD', addressCountry: 'US' }, areaServed: area },
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
