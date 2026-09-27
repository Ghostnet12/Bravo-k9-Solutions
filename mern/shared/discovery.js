// Public presentation only: never changes account names or authorization identities.
export const publicTrainerName = name => name === 'Ashley Northrop' ? 'Ashley Leverock' : name;
export const GOALS = [
  { id: 'manners', label: 'Everyday manners', title: 'A calmer everyday.', description: 'Build clear communication around doorways, visitors, puppy routines and everyday obedience.', focus: 'basic-obedience', program: 'training', proof: 'foundations' },
  { id: 'walks', label: 'Walking & distractions', title: 'Skills that travel with you.', description: 'Practice attention and communication where life happens, from your neighborhood to unfamiliar places.', focus: 'advanced-obedience', program: 'training', proof: 'distractions' },
  { id: 'handling', label: 'Aggression & handling', title: 'Start with understanding.', description: 'Begin with a two-trainer intake. Discuss your dog’s history and handling concerns before deciding on an ongoing plan.', focus: 'behavior-modification', program: 'aggression', proof: null },
  { id: 'specialist', label: 'Specialized training', title: 'Talk through the goal.', description: 'Discuss suitability and preparation for service, search and rescue, law enforcement or other working-dog goals with Bravo.', focus: 'job-specific', program: 'training', proof: 'working' },
];
export const PROOF_TOPICS = [ { id: 'all', label: 'All training' }, { id: 'foundations', label: 'Foundations' }, { id: 'walking', label: 'Leash walking' }, { id: 'distractions', label: 'Distractions' }, { id: 'working', label: 'Working dogs' } ];
// Topics describe published words; they never assert a diagnosis or result.
export function proofMatches(clip, topic) {
  const text = `${clip.title || ''} ${clip.description || ''}`;
  const patterns = { foundations: /first|begin|foundation|puppy|obedience|structure|communication/i, walking: /leash|walk|heel/i, distractions: /distraction|public|real.world|exposure|unfamiliar|environment/i, working: /service.dog|working.dog|search|rescue|law.enforcement|vocal|bloodline|fci/i };
  return topic === 'all' || Boolean(patterns[topic]?.test(text));
}
