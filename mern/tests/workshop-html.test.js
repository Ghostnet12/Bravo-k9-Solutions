import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WORKSHOP, workshopMarkup } from '../shared/workshops.js';
import { renderSiteContent } from '../server/content-html.js';
test('workshop HTML escapes saved content and includes meaningful booking facts',()=>{
  const html=workshopMarkup({...DEFAULT_WORKSHOP,title:'<script>alert(1)</script>',location:'A & B'});
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/A &amp; B/);assert.match(html,/October 3, 2026/);assert.match(html,/\$100/);
});
test('public workshop snapshot and visible details agree, with a useful empty fallback',()=>{
  const template='<html><head></head><body><div data-workshop-content="full"></div></body></html>';
  const html=renderSiteContent(template,{},DEFAULT_WORKSHOP);assert.match(html,/bravo-workshop/);assert.match(html,/Saturday dog-training workshop/);
  const empty=renderSiteContent(template,{},null);assert.doesNotMatch(empty,/Saturday dog-training workshop/);assert.match(empty,/Ask about the next session/);
});
