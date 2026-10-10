// Permissions: required host access is feedql only; every other host comes from a recipe, at runtime, per site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { permissionOrigins, hostAllowed, sameSite } from '../src/engine/hosts.js';
import { headerRules, primaryHost } from '../src/headers.js';
import { checkRecipe } from '../src/engine/transforms.js';
import { seed } from './helpers.js';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));

test('manifest: required host permissions are feedql only, other sites are optional and granted at runtime', () => {
  assert.deepEqual(manifest.host_permissions, ['https://api.feedql.com/*']);
  assert.deepEqual(manifest.optional_host_permissions, ['<all_urls>']);
  assert.ok(manifest.permissions.includes('offscreen'), 'DOMParser lives in an offscreen document');
  assert.ok(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
  assert.equal(manifest.declarative_net_request, undefined, 'no static header rules: they are built from the recipes');
  for (const p of ['tabs', 'webRequest', 'scripting', 'activeTab', 'history', 'downloads']) assert.ok(!manifest.permissions.includes(p), p);
  assert.equal(manifest.content_scripts, undefined);
});

test('the origins asked for are exactly the recipe origins, for both seeds', () => {
  for (const site of ['x', 'linkedin']) {
    const rec = seed(site);
    assert.deepEqual(permissionOrigins(rec), rec.needs_permission_origins);
  }
  assert.deepEqual(permissionOrigins(seed('x')), ['https://x.com/*', 'https://*.x.com/*', 'https://abs.twimg.com/*']);
  assert.deepEqual(permissionOrigins(seed('linkedin')), ['https://www.linkedin.com/*']);
});

test('an offered entry is checked the same way', () => {
  assert.deepEqual(permissionOrigins({ hosts: ['example.org'], needs_permission_origins: ['https://example.org/*'] }), ['https://example.org/*']);
});

test('a recipe can never widen the grant: foreign, feedql, non-https, wildcard-all and malformed origins are dropped', () => {
  const rec = {
    hosts: ['x.com', '*.x.com'],
    needs_permission_origins: ['https://x.com/*', 'https://evil.example/*', 'http://x.com/*', '<all_urls>', 'https://*/*', '*://x.com/*', 'https://x.com/path/*',
      'https://api.feedql.com/*', 'https://feedql.com/*', 'https://sub.x.com/*', 'https://*.x.com/*', 'https://x.com/*', 42, null],
  };
  assert.deepEqual(permissionOrigins(rec), ['https://x.com/*', 'https://sub.x.com/*', 'https://*.x.com/*']);
  assert.deepEqual(permissionOrigins({ hosts: ['feedql.com', 'api.feedql.com'], needs_permission_origins: ['https://api.feedql.com/*', 'https://feedql.com/*'] }), []);
  assert.deepEqual(permissionOrigins({ hosts: ['x.com'] }), []);
});

test('host matching', () => {
  assert.ok(hostAllowed(['x.com', '*.x.com'], 'api.x.com'));
  assert.ok(hostAllowed(['x.com'], 'X.com'));
  assert.ok(!hostAllowed(['x.com'], 'api.x.com'));
  assert.ok(!hostAllowed(['*.x.com'], 'x.com'));
  assert.ok(!hostAllowed(['x.com'], 'evilx.com'));
  assert.ok(!hostAllowed(['*.x.com'], 'evilx.com'));
  assert.ok(sameSite('x.com', 'api.x.com') && !sameSite('x.com', 'abs.twimg.com'));
});

test('header rules come from the recipes: Origin/Referer of the primary host, only for this extension\'s own fetches', () => {
  assert.equal(primaryHost(seed('x')), 'x.com');
  assert.equal(primaryHost(seed('linkedin')), 'www.linkedin.com');
  const rules = headerRules([seed('x'), seed('linkedin'), { hosts: ['*.only-wild.com'] }, { hosts: ['feedql.com'] }], 'EXTID');
  assert.equal(rules.length, 2);
  assert.deepEqual(rules.map((r) => r.id), [1, 2]);
  const [x, li] = rules;
  assert.deepEqual(x.condition, { requestDomains: ['x.com'], resourceTypes: ['xmlhttprequest'], initiatorDomains: ['EXTID'] });
  assert.deepEqual(x.action.requestHeaders.map((h) => [h.header, h.value]), [['origin', 'https://x.com'], ['referer', 'https://x.com/']]);
  assert.deepEqual(li.condition.requestDomains, ['www.linkedin.com']);
});

test('a recipe with a newer schema or an unknown transform is refused', () => {
  assert.doesNotThrow(() => checkRecipe(seed('x')));
  assert.doesNotThrow(() => checkRecipe(seed('linkedin')));
  const a = seed('x'); a.schema = 2;
  assert.throws(() => checkRecipe(a), /newer/);
  const b = seed('x'); b.steps[2].transform.name = 'eval';
  assert.throws(() => checkRecipe(b), /does not have/);
  const c = seed('x'); c.steps[2].transform.name = 'toString';
  assert.throws(() => checkRecipe(c), /does not have/);
});
