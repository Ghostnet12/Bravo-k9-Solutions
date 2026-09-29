import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import { renderSiteContent } from '../server/content-html.js';
import { createHomepageHandler } from '../server/homepage.js';
import express from 'express';
import request from 'supertest';

test('published reviews and the early quote use the same escaped snapshot without resurrecting removed content', async () => {
  const template='<html><head></head><body><aside data-review-highlight="">Old quote</aside><div data-public-reviews="">Old review</div></body></html>';
  const review={id:'fixture',authorName:'<script>bad()</script>',body:'A careful review <img src=x onerror=bad()> with enough detail.',source:'Client review',rating:null};
  const html=renderSiteContent(template,{},undefined,undefined,[review]);
  assert.ok(html.includes('bravo-reviews'));assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));assert.ok(!html.includes('<script>bad()'));
  assert.ok(!html.includes('review-stars'));assert.ok(!html.includes('Old review'));assert.ok(!html.includes('Old quote'));
  const editedCta=renderSiteContent(template,{'copy-goalfinder-3':{value:{text:'See every client story →',link:'/reviews'}}},undefined,undefined,[review]);
  assert.ok(editedCta.includes('See every client story →'));assert.ok(editedCta.includes('href="/reviews"'));assert.ok(editedCta.includes('data-site-content-key="copy-goalfinder-3"'));
  const empty=renderSiteContent(template,{},undefined,undefined,[]);assert.ok(!empty.includes('Old review'));assert.ok(!empty.includes('Old quote'));
  const app=express().get('/',createHomepageHandler({loadTemplate:async()=>template,loadHero:async()=>null,loadReviews:async()=>{throw new Error('unavailable');}}));
  const failed=await request(app).get('/').expect(200);assert.ok(!failed.text.includes('Old review'));assert.ok(failed.text.includes('bravo-reviews'));
  const sherrie=DEFAULT_REVIEWS.find(r=>r.authorName==='Sherrie Humphries');assert.equal(sherrie.rating,null);assert.equal(sherrie.source,'Facebook comment');assert.ok(sherrie.body.endsWith('soon after we started.'));
});
