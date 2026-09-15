import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFacebookReelUrl } from '../shared/proof-videos.js';

test('Reel URLs accept copied mobile and share links without tracking parameters', () => {
  for (const url of ['https://www.facebook.com/reel/1850999522754029/?mibextid=abc#fragment', 'http://m.facebook.com/reel/1850999522754029', 'facebook.com/reel/1850999522754029/']) {
    assert.equal(normalizeFacebookReelUrl(url), 'https://www.facebook.com/reel/1850999522754029/');
  }
  assert.equal(normalizeFacebookReelUrl('https://www.facebook.com/share/r/AbC123_-/?mibextid=abc'), 'https://www.facebook.com/share/r/AbC123_-/');
});

test('Reel URLs reject scripts, lookalike hosts, credentials, non-Reel links and redirect endpoints', () => {
  for (const url of ['', null, 'javascript:alert(1)', '//facebook.com/reel/123', 'https://facebook.com.evil.example/reel/123', 'https://facebook.com@evil.example/reel/123', 'https://evil.example@facebook.com/reel/123', 'https://facebook.com:444/reel/123', 'https://l.facebook.com/l.php?u=https://evil.example', 'https://facebook.com/profile.php?id=123', 'https://facebook.com/share/123', 'https://facebook.com/reel/%2f123', 'https://facebook.com/reel/123/extra', 'https://facebook.com/reel/123?x=' + 'x'.repeat(2048)]) {
    assert.equal(normalizeFacebookReelUrl(url), null, String(url));
  }
});
