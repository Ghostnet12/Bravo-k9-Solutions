// Summaries are shown only while the published review still supports every
// detail. Editing or removing a source falls back to its current review card.
export const CLIENT_STORIES = [
  {
    reviewId: 'imported-waneta-malsom', title: 'Benny & Huck',
    startingPoint: 'A move from a fenced yard, with indoor accidents.',
    focus: 'Everyday routines and outdoor obedience.',
    outcome: 'Not only have we not had any accidents for a month',
    evidence: ['Benny and Huck', 'huge fenced in backyard', 'peeing in the house', 'taught them to be outside', 'just 4 weeks'],
  },
  {
    reviewId: 'imported-jessica-post', title: 'A five-month-old rescue pup',
    startingPoint: 'A young rescue dog struggling with house training.',
    focus: 'Obedience and house-training routines.',
    outcome: 'Within 3 weeks we were down to just one accident in a week.',
    evidence: ['5 month old rescue pup', 'issues with potty training', 'obedience issue'],
  },
  {
    reviewId: 'imported-sherrie-humphries', title: 'Daisy',
    startingPoint: 'Pulling on walks and difficulty listening.',
    focus: 'Leash manners and everyday communication.',
    outcome: 'It all takes a little time and practice but we noticed improvements soon after we started.',
    evidence: ['Daisy', 'getting her to listen', 'walk with us not drag us'],
  },
];
export function clientStory(review) {
  const story = CLIENT_STORIES.find(item => item.reviewId === review.id);
  if (!story || review.deleted === true || review.enabled === false) return null;
  const body = String(review.body || '');
  return [...story.evidence, story.outcome].every(text => body.includes(text)) ? story : null;
}
export function featuredClientReviews(reviews = []) {
  const available = reviews.filter(review => review.deleted !== true && review.enabled !== false);
  const stories = CLIENT_STORIES.flatMap(story => available.filter(review => review.id === story.reviewId && clientStory(review)));
  const ordered = [...stories, ...available.filter(review => !stories.includes(review))];
  return { featured: ordered.slice(0, 3), more: ordered.slice(3), hasStories: stories.length > 0 };
}
