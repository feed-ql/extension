import test from 'node:test';
import assert from 'node:assert/strict';
import { Secrets, redactEntry, MAX_BODY } from '../src/capture.js';

test('cookie values never appear in a captured entry, in any spelling or place', () => {
  const s = new Secrets();
  s.add('abc/def=="x y"'); s.add('CT0VALUE');
  const e = redactEntry({
    method: 'GET', url: 'https://x.com/s?a=CT0VALUE&b=' + encodeURIComponent('abc/def=="x y"'),
    headers: { Cookie: 'ct0=CT0VALUE', 'X-Csrf-Token': 'z', Authorization: 'Bearer q', 'x-echo': 'pre-CT0VALUE', accept: '*/*' },
    body: JSON.stringify({ t: 'CT0VALUE', u: 'abc/def=="x y"' }),
    status: 200, resp: 'echo CT0VALUE and ' + encodeURIComponent('abc/def=="x y"'),
  }, s);
  const out = JSON.stringify(e);
  assert.ok(!out.includes('CT0VALUE'));
  assert.ok(!out.includes('abc/def'));
  assert.ok(!out.includes('abc%2Fdef'));
  assert.deepEqual(Object.keys(e.requestHeaders), ['accept']);
});

test('large bodies are truncated', () => {
  const e = redactEntry({ url: 'u', resp: 'a'.repeat(MAX_BODY * 2), status: 200 }, new Secrets());
  assert.ok(e.responseBody.length < MAX_BODY + 100);
});

import { listOffered } from '../src/offered.js';

test('opening the popup never leases tasks: stale cache refreshes through the read-only status call', async () => {
  let cache = { at: 0, offered: [{ site: 'x', label: 'X', enabled: true, hosts: ['x.com'] }, { site: 'gone', label: 'G' }], sites: { x: { enabled: true } } };
  const calls = [];
  const api = {
    async getTasks() { calls.push('tasks'); throw new Error('must not lease'); },
    async getSiteStates() { calls.push('status'); return { x: { label: 'X2', enabled: false } }; },
  };
  const deps = { getOffered: async () => cache, saveOffered: async (c) => { cache = c; }, api, now: () => 1e12 };
  const r = await listOffered(deps);
  assert.deepEqual(calls, ['status']);
  assert.equal(r.offered.length, 1);
  assert.equal(r.offered[0].enabled, false);
  assert.deepEqual(r.offered[0].hosts, ['x.com']);
  const fresh = await listOffered({ ...deps, getOffered: async () => ({ ...cache, at: 1e12 }) });
  assert.deepEqual(calls, ['status']); // fresh cache: no call at all
  assert.ok(fresh);
  assert.equal(await listOffered({ ...deps, getOffered: async () => null }), null); // empty cache: nothing, not a lease
  assert.ok(!calls.includes('tasks'));
});
