// Public presentation only. Never derive results, medical claims or completion
// status from a video, or resurrect a clip removed from the published library.
export const FIELD_STORIES = [
  { key: 'first-day', clipId: '576a0833-e740-4d9f-a132-1c0a439390cb', match: /Cleo|Patrick|first day/i, chapter: '01 / THE STARTING POINT', question: 'What does day one look like?', notice: 'Look at the small interactions between the dog and handler. This is a starting point, not a promise of a finished result.' },
  { key: 'real-world', clipId: '1079472767813329', match: /confidence|distraction|Beau|exposure/i, chapter: '02 / INTO THE REAL WORLD', question: 'Where does the dog’s attention go?', notice: 'Notice the surroundings and the handler’s position. The published note describes a first exposure visit—not a before-and-after transformation.' },
  { key: 'direction', clipId: '1068433732560103', match: /off.leash|vocal|direction/i, chapter: '03 / WORKING TOGETHER', question: 'What changes after a cue?', notice: 'Watch the timing of the handler’s cue and the dog’s response. This is a training example, not an invitation to try off-leash work in an unsecured place.' },
];
export function publishedFieldStories(clips = []) {
  return FIELD_STORIES.flatMap(story => {
    const clip = clips.find(item => item.id === story.clipId && item.deleted !== true && item.enabled !== false && (item.src || item.facebookUrl) && story.match.test(`${item.title || ''} ${item.description || ''}`));
    return clip ? [{ ...story, clip }] : [];
  });
}
export const HUNTING_GOALS = [
  { id: 'foundation', label: 'Field obedience' },
  { id: 'recall', label: 'Recall & steadiness' },
  { id: 'retrieve', label: 'Retrieving goals' },
  { id: 'not-sure', label: 'Help choosing a starting point' },
];
export function huntingInquiryPath(goal = '') {
  return '/contact?interest=hunting' + (HUNTING_GOALS.some(item => item.id === goal) ? `&goal=${goal}` : '');
}
export function huntingInquiryContext(search = '') {
  const params = new URLSearchParams(search);
  if (params.get('interest') !== 'hunting') return null;
  return { label: 'Hunting dog training', goal: HUNTING_GOALS.find(item => item.id === params.get('goal'))?.label || '' };
}
