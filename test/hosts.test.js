import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHostEntry, checkRecipeHosts, registrableDomain, sameSite, hostAllowed, MAX_HOSTS } from '../src/engine/hosts.js';
import { checkRecipe } from '../src/engine/transforms.js';
import { seed } from './helpers.js';

test('wildcards on a public suffix or with fewer than two labels after *. are refused', () => {
  for (const h of ['*.com', '*.co.uk', '*.com.ua', '*.github.io', '*.vercel.app', '*.amazonaws.com', '*.', '*', '*.localhost', '*.*.x.com', 'x.*.com']) assert.notEqual(checkHostEntry(h), '', h);
  for (const h of ['*.x.com', '*.linkedin.com', '*.example.co.uk', 'x.com', 'www.youtube.com', 'abs.twimg.com']) assert.equal(checkHostEntry(h), '', h);
});

test('bare public suffixes, single labels, IPs and feedql hosts are refused as hosts', () => {
  for (const h of ['com', 'localhost', '127.0.0.1', '10.0.0.1', 'feedql.com', 'api.feedql.com', '*.feedql.com', 'feedql.app', 'www.feedql.app', 'a b.com', 'X.com ', '']) assert.notEqual(checkHostEntry(h), '', JSON.stringify(h));
});

test('a recipe has at most ten hosts and every host entry must pass', () => {
  assert.equal(MAX_HOSTS, 10);
  const rec = seed('x');
  rec.hosts = Array.from({ length: 11 }, (_, i) => `h${i}.example.com`);
  assert.throws(() => checkRecipe(rec), /at most 10 hosts/);
  const r2 = seed('x');
  r2.hosts = [...r2.hosts, '*.com'];
  assert.throws(() => checkRecipe(r2), /\*\.com/);
  const r3 = seed('x');
  r3.hosts = [...r3.hosts, 'app.feedql.com'];
  assert.throws(() => checkRecipe(r3), /feedql/);
  const r4 = seed('x');
  r4.needs_permission_origins = ['https://*.com/*'];
  assert.throws(() => checkRecipe(r4), /\*\.com/);
  const r5 = seed('x');
  r5.needs_permission_origins = ['https://evil.example/*'];
  assert.throws(() => checkRecipeHosts(r5), /not covered/);
  for (const s of ['x', 'linkedin', 'medium', 'youtube']) assert.doesNotThrow(() => checkRecipe(seed(s)), s);
});

test('registrable domains and same-site for cookies', () => {
  assert.equal(registrableDomain('www.linkedin.com'), 'linkedin.com');
  assert.equal(registrableDomain('a.b.example.co.uk'), 'example.co.uk');
  assert.equal(registrableDomain('x.com'), 'x.com');
  assert.equal(registrableDomain('com'), '');
  assert.ok(sameSite('x.com', 'x.com'));
  assert.ok(sameSite('www.linkedin.com', 'linkedin.com'));
  assert.ok(sameSite('api.x.com', 'www.x.com'), 'same registrable domain');
  assert.ok(!sameSite('x.com', 'evil.com'));
  assert.ok(!sameSite('a.co.uk', 'b.co.uk'), 'a public suffix is not a site');
  assert.ok(!sameSite('evilx.com', 'x.com'));
  assert.ok(!sameSite('com', 'com'), 'a public suffix alone is nobody');
});

test('hostAllowed matches a wildcard only on a label boundary', () => {
  assert.ok(hostAllowed(['*.x.com'], 'api.x.com'));
  assert.ok(!hostAllowed(['*.x.com'], 'x.com'));
  assert.ok(!hostAllowed(['*.x.com'], 'evilx.com'));
});
