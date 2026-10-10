import test from 'node:test';
import assert from 'node:assert/strict';
import { jitter, nextBackoff, due, clampInterval, chunk } from '../src/pacing.js';
import { seed } from './helpers.js';

const X = seed('x').pacing; // base 1800 s, max 43200 s
const LI = seed('linkedin').pacing;

test('jitter stays inside its bounds', () => {
  assert.equal(jitter(15, 30, () => 0), 15);
  assert.equal(jitter(15, 30, () => 0.999999), 30);
});

test('backoff: base * 2^(n-1) from the recipe, capped, honours Retry-After / reset, +0..20%, never negative', () => {
  const now = 1_000_000;
  const z = () => 0;
  assert.equal(nextBackoff(1, now, {}, X, z), now + 1800_000);
  assert.equal(nextBackoff(2, now, {}, X, z), now + 3600_000);
  assert.equal(nextBackoff(3, now, {}, X, z), now + 7200_000);
  assert.equal(nextBackoff(30, now, {}, X, z), now + 43200_000);
  assert.equal(nextBackoff(1000, now, {}, X, z), now + 43200_000);
  assert.equal(nextBackoff(1, now, { resetAtMs: now + 3 * 3600_000 }, X, z), now + 3 * 3600_000);
  assert.equal(nextBackoff(1, now, { retryAfterSec: 7200 }, X, z), now + 7200_000);
  assert.equal(nextBackoff(1, now, { retryAfterSec: 10 * 86400 }, X, z), now + 43200_000, 'the recipe cap wins over a huge Retry-After');
  assert.ok(nextBackoff(1, now, { resetAtMs: now - 5 }, X, z) >= now + 1800_000);
  assert.equal(nextBackoff(1, now, {}, X, () => 1), now + 1800_000 * 1.2);
  assert.equal(nextBackoff(1, now, {}, { backoff_base_sec: 60, max_backoff_sec: 120 }, z), now + 60_000);
  assert.equal(nextBackoff(1, now, {}, LI, z), now + 1800_000);
});

test('due: enabled, not backing off, interval elapsed', () => {
  const now = 10_000_000;
  assert.equal(due({ enabled: false }, now, 900), false);
  assert.equal(due({ enabled: true, backoffUntil: now + 1 }, now, 900), false);
  assert.equal(due({ enabled: true, lastRunAt: now - 899_000 }, now, 900), false);
  assert.equal(due({ enabled: true, lastRunAt: now - 900_000 }, now, 900), true);
  assert.equal(due({ enabled: true }, now, 900), true);
});

test('server and recipe limits may only slow us down', () => {
  assert.equal(clampInterval(60, 900), 900);
  assert.equal(clampInterval(3600, 900), 3600);
  assert.equal(clampInterval(undefined, 900), 900);
});

test('chunk', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
