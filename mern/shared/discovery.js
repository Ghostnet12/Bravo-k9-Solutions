// Public presentation only: never changes account names or authorization identities.
export const publicTrainerName = name => name === 'Ashley Northrop' ? 'Ashley Leverock' : name;
export const GOALS = [
  { id: 'manners', label: 'Pulling, jumping & puppy manners', title: 'A calmer everyday.', description: 'Build clear communication around doorways, visitors, puppy routines and everyday obedience.', focus: 'basic-obedience', program: 'training', proof: 'foundations' },
  { id: 'walks', label: 'Dog walking', title: 'Better walks. A better routine.', description: 'A focused 30-minute walk with the Bravo team, priced per dog. For leash manners or distraction training, choose Pulling, jumping & puppy manners.', program: 'walking', proof: null },
  { id: 'handling', label: 'Aggression concerns', title: 'Start with understanding.', description: 'Begin with a two-trainer intake. Discuss your dog’s history and handling concerns before deciding on an ongoing plan.', focus: 'behavior-modification', program: 'aggression', proof: null },
  { id: 'specialist', label: 'Advanced & working-dog goals', title: 'Talk through the goal.', description: 'Discuss suitability and preparation for advanced obedience, hunting, service, search and rescue, law enforcement or other working-dog goals with Bravo.', focus: 'job-specific', program: 'training', proof: 'working' },
];
export const goalBookingPath = goal => goal.id === 'specialist' ? '/contact' : `/portal?program=${goal.program}${goal.program === 'training' ? `&focus=${goal.focus}` : ''}`;
export const goalDetailsPath = goal => goal.id === 'specialist' ? '/#specialist-training' : ({ training: '/dog-training', walking: '/dog-walking', aggression: '/behavior-assessment' })[goal.program];
export const PROOF_TOPICS = [ { id: 'all', label: 'All training' }, { id: 'foundations', label: 'Foundations' }, { id: 'walking', label: 'Leash walking' }, { id: 'distractions', label: 'Distractions' }, { id: 'working', label: 'Working dogs' } ];
// Topics describe published words; they never assert a diagnosis or result.
export function proofMatches(clip, topic) {
  const text = `${clip.title || ''} ${clip.description || ''}`;
  const patterns = { foundations: /first|begin|foundation|puppy|obedience|structure|communication/i, walking: /leash|walk|heel/i, distractions: /distraction|public|real.world|exposure|unfamiliar|environment/i, working: /service.dog|working.dog|search|rescue|law.enforcement|vocal|bloodline|fci/i };
  return topic === 'all' || Boolean(patterns[topic]?.test(text));
}
