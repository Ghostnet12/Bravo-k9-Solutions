import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {horizontalSwipe,boundedIndex} from '../shared/bravo-motion.js';
test('ad swipes require decisive horizontal movement',()=>{
 for(const [x,y,want] of [[-44,0,1],[44,0,-1],[-130,30,1],[130,30,-1],[43,0,0],[-43,0,0],[40,90,0],[70,65,0],[0,0,0],[Infinity,0,0],[NaN,4,0]])assert.equal(horizontalSwipe(x,y),want);
});
test('story controls stay within available items',()=>{
 for(const [index,count,want] of [[-1,3,0],[0,3,0],[2,3,2],[3,3,2],[10,0,0],[1,1,0]])assert.equal(boundedIndex(index,count),want);
});
test('new motion is scoped, finite and reduced-motion aware',()=>{
 const css=readFileSync(new URL('../client/src/bravo-motion.css',import.meta.url),'utf8');
 assert.ok(!css.includes('transition:all'));
 assert.ok(!css.includes('infinite'));
 for(const value of ['pointer-events:none','prefers-reduced-motion:reduce','access-reduced-motion','forced-colors:active','scroll-snap-type:x proximity'])assert.ok(css.includes(value),value);
 for(const value of ['.booking-page','.account-page','.live-player'])assert.ok(!css.includes(value),value);
});
test('existing ad fade and public scroll/pinch are retained',()=>{
 const css=readFileSync(new URL('../client/src/home-ad-carousel.css',import.meta.url),'utf8');
 assert.ok(css.includes('transition:opacity .65s ease'));
 assert.ok(readFileSync(new URL('../client/src/bravo-motion.css',import.meta.url),'utf8').includes('touch-action:pan-y pinch-zoom'));
});
