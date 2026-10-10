import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSearch, activityTime } from '../src/sites/linkedin-parse.js';
import { graphqlUrl, restUrl, refusal } from '../src/sites/linkedin.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/linkedin-search.synthetic.json', import.meta.url)));

test('synthetic Voyager fixture: posts, counts, dedupe, skipped empties', () => {
  const items = parseSearch(fx, 'data platform', 10);
  assert.equal(items.length, 2);
  const [a, b] = items;
  assert.equal(a.external_id, '7249871234567890123');
  assert.equal(a.url, 'https://www.linkedin.com/feed/update/urn:li:activity:7249871234567890123/');
  assert.equal(a.author, 'Jane Doe');
  assert.equal(a.author_url, 'https://www.linkedin.com/in/jane-doe-123');
  assert.deepEqual(a.metrics, { likes: 128, reposts: 9, replies: 14 });
  assert.equal(a.query, 'data platform');
  assert.equal(b.author, 'Acme Corp');
  assert.deepEqual(b.metrics, { likes: 0, reposts: 0, replies: 0 });
});

test('activity id carries the publication time', () => {
  // 2024-09-25T12:00:00Z
  const ms = Date.UTC(2024, 8, 25, 12);
  const id = (BigInt(ms) << 22n).toString();
  assert.equal(activityTime(id), '2024-09-25T12:00:00.000Z');
  assert.equal(activityTime('12'), '');
});

test('max and garbage', () => {
  assert.equal(parseSearch(fx, 'q', 1).length, 1);
  assert.deepEqual(parseSearch({}, 'q'), []);
  assert.deepEqual(parseSearch({ included: [null, 5, 'x'] }, 'q'), []);
});

test('urls escape Rest.li syntax characters in keywords', () => {
  const u = graphqlUrl("rock (n) 'roll', a:b", 0, 10);
  assert.ok(u.includes('keywords:rock%20%28n%29%20%27roll%27%2C%20a%3Ab'));
  assert.ok(u.includes('resultType,value:List(CONTENT)'));
  assert.ok(restUrl('go lang', 0, 10).includes('keywords:go%20lang'));
});

test('999 and 429 are refusals, other statuses are plain errors', () => {
  const r = (status) => refusal({ status, headers: { get: () => null } });
  assert.equal(r(999).name, 'Error');
  assert.equal(r(999).status, 999);
  assert.equal(r(429).site, 'linkedin');
  assert.equal(r(500).status, undefined);
});
