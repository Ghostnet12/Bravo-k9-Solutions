import { huntingInquiryContext } from './field-experience.js';

// Only known public program names are displayed. Never reflect arbitrary query
// text, personal details or a price into a specialist inquiry.
const interests = {
  'advanced-training': 'advanced obedience',
  'job-specific': 'working-dog training',
  'service-dog': 'service dog training',
  'law-enforcement': 'law-enforcement K9 training',
  'search-and-rescue': 'search-and-rescue training',
  'executive-protection': 'executive protection training',
};
export const SPECIALIST_LINKS = [
  { name: 'Service Dogs', interest: 'service-dog' },
  { name: 'Law Enforcement', interest: 'law-enforcement' },
  { name: 'Executive Protection', interest: 'executive-protection' },
  { name: 'Search & Rescue', interest: 'search-and-rescue' },
  { name: 'Hunting Dog Training', interest: 'hunting-dog' },
];
export function specialistInquiryPath(focus) {
  if (focus === 'hunting-dog') return '/contact?interest=hunting';
  return Object.hasOwn(interests, focus) ? `/contact?interest=${focus}` : '/contact';
}
export function contactInquiryContext(search = '') {
  const hunting = huntingInquiryContext(search);
  if (hunting) return { ...hunting, subject: 'hunting training', backPath: '/hunting-dog-training', backLabel: 'Back to hunting training' };
  const interest = new URLSearchParams(search).get('interest');
  if (interest === 'k9-transport') return { subject: 'K9 transport', kind: 'transport', goal: '', backPath: '/k9-transport', backLabel: 'Back to K9 transport' };
  if (!Object.hasOwn(interests, interest)) return null;
  return { subject: interests[interest], goal: '', backPath: '/#specialist-training', backLabel: 'Explore training options' };
}
