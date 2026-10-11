import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELD_STORIES, publishedFieldStories, HUNTING_GOALS, huntingInquiryPath, huntingInquiryContext } from '../shared/field-experience.js';
import { PAGE_METADATA, publicRoutes, structuredData } from '../shared/page-metadata.js';
import { publicPagePaths } from '../server/public-page.js';
const clips = [
 { id: FIELD_STORIES[0].clipId, title: 'Cleo and Patrick', description: 'First day of school', src: '/api/proof-videos/fixture/video?v=1' },
 { id: FIELD_STORIES[1].clipId, title: 'Confidence around distractions', description: 'Beau’s first exposure visit.', facebookUrl: 'https://www.facebook.com/reel/1079472767813329/' },
 { id: FIELD_STORIES[2].clipId, title: 'Off-leash vocal direction', description: 'Recorded training.', src: '/api/proof-videos/fixture/video?v=1' },
];
test('field stories reference three currently published recordings without creating duplicate media records', () => {
 const result = publishedFieldStories(clips);
 assert.equal(result.length, 3);result.forEach((story,index) => assert.equal(story.clip,clips[index]));
 assert.equal(publishedFieldStories([]).length,0);
 assert.equal(publishedFieldStories(clips.slice(1)).length,2);
});
test('deleted, unavailable and repurposed clips do not retain an unrelated story', () => {
 for (const change of [{deleted:true},{enabled:false},{src:null,facebookUrl:null},{title:'A different campaign',description:'Unrelated promotion'}]) {
  assert.equal(publishedFieldStories([{...clips[0],...change}]).length,0);
 }
 const edited={...clips[0],description:'Updated first day description'};
 assert.equal(publishedFieldStories([edited])[0].clip.description,edited.description);
});
test('hunting inquiry carries only an allowlisted interest and never performs a booking', () => {
 for (const goal of HUNTING_GOALS) {
  const path=huntingInquiryPath(goal.id);assert.ok(path.startsWith('/contact?interest=hunting'));
  assert.deepEqual(huntingInquiryContext(path.split('?')[1]),{label:'Hunting dog training',goal:goal.label});
 }
 assert.equal(huntingInquiryPath('<script>'),'/contact?interest=hunting');
 assert.deepEqual(huntingInquiryContext('?interest=hunting&goal=%3Cscript%3E'),{label:'Hunting dog training',goal:''});
 assert.equal(huntingInquiryContext('?interest=private&goal=recall'),null);
 assert.equal(huntingInquiryContext(''),null);
});
test('hunting page exists in public route, server, metadata and deployment configuration', () => {
 assert.ok(PAGE_METADATA['/hunting-dog-training']);assert.ok(publicRoutes().some(([route])=>route==='/hunting-dog-training'));
 assert.ok(publicPagePaths.includes('/hunting-dog-training'));
 const schema=structuredData('/hunting-dog-training');assert.ok(schema['@graph'].some(item=>item['@type']==='Service'));
 const deployment=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(deployment.rewrites.some(item=>item.source==='/hunting-dog-training'&&item.destination==='/api/public-page?path=/hunting-dog-training'));
 const html=readFileSync(new URL('../client/dist/hunting-dog-training.html',import.meta.url),'utf8');
 assert.match(html,/Drive meets direction/);assert.match(html,/Individually scoped/);assert.ok(!html.includes('$200'));
});
test('goal selection preserves editable destination keys in the selected panel and price authority', () => {
 const source=readFileSync(new URL('../client/src/GoalFinder.jsx',import.meta.url),'utf8');
 assert.match(source,/as="button" contentKey=\{`goal-\$\{item.id\}-selector`\}/);
 assert.match(source,/contentKey=\{`goal-\$\{goal.id\}-choice`\} canEditLink/);
 assert.match(source,/aria-controls="goal-result"/);assert.match(source,/goalBookingPath\(goal\)/);assert.match(source,/CatalogPrice/);
});
