import { publicTrainerName } from './discovery.js';

// Public edits never rename the account used by assignments and joint visits.
// Existing portrait keys and biography keys remain stable after a name change.
export function trainerProfileKey(person) {
  if (/^ashley (northrop|leverock)$/i.test(person.name || '')) return 'ashley';
  if (/^david northrop$/i.test(person.name || '')) return 'david';
  if (/^janet hughes$/i.test(person.name || '')) return 'janet';
  return String(person._id || person.id);
}
export function publicTrainerProfile(person, role = person.role) {
  const profileKey = trainerProfileKey(person);
  const legacy = { david: 'david-northrop', ashley: 'ashley-northrop', janet: 'janet-hughes' }[profileKey];
  return { id: String(person._id || person.id), name: person.publicName ?? publicTrainerName(person.name), role,
    title: person.title || (role === 'owner' ? 'Owner & Lead Trainer' : 'Bravo Trainer'), bio: person.bio || '',
    phone: person.showPhone ? person.phone : '', profileKey,
    revision: person.publicProfileRevision || 0, imageKey: `team-${legacy || profileKey}`,
    image: `/images/${legacy || 'bravo-logo-small'}.webp` };
}

export const trainerIntroductions = {
  'David Northrop': {
    key: 'trainer-david-introduction',
    focusKey: 'trainer-david-focus',
    text: 'Meet David, Bravo’s owner and lead trainer. Start a conversation about your dog, your goals, and the practical challenges you face at home. David can help you discuss where to begin with Bravo.',
    focus: 'Obedience · Service-dog foundations',
    quote: 'David is very knowledgeable and my dogs love him.',
    author: 'Andrea Leigh Duarte',
  },
  'Ashley Northrop': {
    key: 'trainer-ashley-introduction',
    focusKey: 'trainer-ashley-focus',
    text: 'Meet Ashley, a Bravo trainer with a specialty in Pitbulls. Tell her about your dog’s personality and the everyday situations you want help with. Ask about her approach and whether she is the right fit for your dog.',
    focus: 'Pitbull training · Everyday behavior',
    quote: 'David & Ashley are both fantastic trainers.',
    author: 'Cassidy Bierman',
  },
};
trainerIntroductions['Ashley Leverock'] = trainerIntroductions['Ashley Northrop'];

