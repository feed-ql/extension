import test from 'node:test';
import assert from 'node:assert/strict';
import { jitter, nextBackoff, due, clampInterval, chunk } from '../src/pacing.js';
import { BACKOFF } from '../src/config.js';
import { xQuery } from '../src/runner.js';

test('jitter stays inside its bounds', () => {
  assert.equal(jitter(15, 30, () => 0), 15);
  assert.equal(jitter(15, 30, () => 0.999999), 30);
});

test('backoff doubles, honours reset, is capped, never negative', () => {
  const now = 1_000_000;
  const z = () => 0;
  assert.equal(nextBackoff(1, now, {}, z), now + BACKOFF.baseMs);
  assert.equal(nextBackoff(2, now, {}, z), now + BACKOFF.baseMs * 2);
  assert.equal(nextBackoff(30, now, {}, z), now + BACKOFF.maxMs);
  assert.equal(nextBackoff(1, now, { resetAtMs: now + 3 * 3600_000 }, z), now + 3 * 3600_000);
  assert.equal(nextBackoff(1, now, { retryAfterSec: 7200 }, z), now + 7200_000);
  assert.ok(nextBackoff(1, now, { resetAtMs: now - 5 }, z) >= now + BACKOFF.baseMs);
});

test('due: enabled, not backing off, interval elapsed', () => {
  const now = 10_000_000;
  assert.equal(due({ enabled: false }, now, 900), false);
  assert.equal(due({ enabled: true, backoffUntil: now + 1 }, now, 900), false);
  assert.equal(due({ enabled: true, lastRunAt: now - 899_000 }, now, 900), false);
  assert.equal(due({ enabled: true, lastRunAt: now - 900_000 }, now, 900), true);
  assert.equal(due({ enabled: true }, now, 900), true);
});

test('server may only slow us down', () => {
  assert.equal(clampInterval(60, 900), 900);
  assert.equal(clampInterval(3600, 900), 3600);
  assert.equal(clampInterval(undefined, 900), 900);
});

test('chunk and X query filters', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(xQuery('go lang'), 'go lang -filter:retweets -filter:replies');
  assert.equal(xQuery('go -filter:retweets'), 'go -filter:retweets');
});
