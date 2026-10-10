import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSearch, walkTimeline, toItem } from '../src/sites/x-parse.js';
import { searchUrl, FEATURES, refusal } from '../src/sites/x.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/x-search.recorded.json', import.meta.url)));

test('recorded SearchTimeline yields posts with author, text and date', () => {
  const tweets = walkTimeline(fx);
  assert.ok(tweets.length >= 1);
  for (const t of tweets) { assert.ok(t.id && t.author && t.createdAt); }
  const first = tweets[0];
  assert.equal(first.author, 'eatonphil');
});

test('parseSearch maps to the ext item contract and drops retweets/replies', () => {
  const items = parseSearch(fx, 'databases', 20);
  assert.ok(items.length >= 1);
  for (const it of items) {
    assert.match(it.external_id, /^\d+$/);
    assert.match(it.url, /^https:\/\//);
    assert.ok(it.text.length > 0);
    assert.ok(!Number.isNaN(Date.parse(it.published_at)));
    assert.equal(it.query, 'databases');
    assert.ok(it.metrics.likes >= 0);
  }
  assert.equal(new Set(items.map((i) => i.external_id)).size, items.length);
});

test('toItem: outbound link becomes the url, status becomes Discussion', () => {
  const t = { id: '1', author: 'a', authorName: 'A', text: 'read this', createdAt: 'Thu Nov 14 04:36:04 +0000 2013', likes: 1, retweets: 2, replies: 3, urls: ['https://t.co/x', 'https://example.com/post'], isRetweet: false, isReply: false, lang: 'en' };
  const it = toItem(t);
  assert.equal(it.url, 'https://example.com/post');
  assert.match(it.text, /Discussion: https:\/\/x\.com\/a\/status\/1$/);
  assert.equal(toItem({ ...t, isRetweet: true }), null);
  assert.equal(toItem({ ...t, isReply: true }), null);
  assert.equal(toItem({ ...t, urls: [] }).url, 'https://x.com/a/status/1');
});

test('parser tolerates garbage', () => {
  assert.deepEqual(parseSearch(null, 'q'), []);
  assert.deepEqual(parseSearch({ data: [1, 'a', { __typename: 'Tweet' }] }, 'q'), []);
});

test('search URL carries the SearchTimeline variables and features', () => {
  const u = new URL(searchUrl('"data race" lang:en', 20));
  assert.match(u.pathname, /SearchTimeline$/);
  const vars = JSON.parse(u.searchParams.get('variables'));
  assert.equal(vars.rawQuery, '"data race" lang:en');
  assert.equal(vars.product, 'Top');
  assert.deepEqual(JSON.parse(u.searchParams.get('features')), FEATURES);
});

test('refusal classes', () => {
  const r = (status, h = {}) => refusal({ status, headers: { get: (k) => h[k] ?? null } });
  assert.equal(r(429, { 'x-rate-limit-reset': '1800000000' }).resetAtMs, 1800000000000);
  assert.equal(r(401).auth, true);
  assert.equal(r(404).name, 'Error');
});
