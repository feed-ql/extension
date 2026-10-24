// Story 13.15: what a site will touch (Details), the grant it is compared with, and the popup panel that shows it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { detailsOf, footprintOf, added, widens, narrows } from '../src/engine/details.js';
import { detailsFor } from '../src/grants.js';
import { detailsEl, needsOkEl } from '../popup/details.js';
import { STRINGS } from '../src/i18n.js';
import { seed } from './helpers.js';

test('details of the YouTube list recipe: hosts, the two lists, no cookie, the fields sent', () => {
  const d = detailsOf(seed('youtube'));
  assert.deepEqual(d.hosts, ['www.youtube.com']);
  assert.deepEqual(d.pages, ['www.youtube.com/feed/history', 'www.youtube.com/playlist?list=WL']);
  assert.deepEqual(d.cookies, [], 'the browser sends the session itself; the recipe names no cookie');
  assert.ok(d.sends.includes('title') && d.sends.includes('query') && d.sends.includes('url') && !d.sends.includes('discussion_url'));
});

test('details name cookies by name and host only, never a value', () => {
  assert.deepEqual(detailsOf(seed('x')).cookies, ['ct0@x.com']);
  assert.deepEqual(detailsOf(seed('linkedin')).cookies, ['JSESSIONID@www.linkedin.com']);
  const text = JSON.stringify(detailsOf(seed('x')));
  assert.ok(!text.includes('CT0VALUE'));
  assert.deepEqual(detailsOf(seed('x')).pages.filter((p) => p.includes('?')), [], 'a search page is listed without its query string');
});

test('a recipe about text is carried; a recipe without one has none', () => {
  const r = seed('youtube');
  delete r.about;
  assert.deepEqual(detailsOf(r).about, {});
  r.about = { en: 'your YouTube History and Watch later', uk: 'ваші Історія та Дивитися пізніше' };
  assert.equal(detailsOf(r).about.uk, 'ваші Історія та Дивитися пізніше');
});

test('added / widens / narrows compare against the grant', () => {
  const g = footprintOf(detailsOf(seed('x')));
  const same = detailsOf(seed('x'));
  assert.equal(widens(added(g, same)), false);
  assert.equal(narrows(g, same), false);
  const wide = detailsOf({ ...seed('x'), hosts: [...seed('x').hosts, 'cdn.example.com'] });
  assert.deepEqual(added(g, wide).hosts, ['cdn.example.com']);
  assert.equal(widens(added(g, wide)), true);
  const narrow = detailsOf({ ...seed('x'), hosts: ['x.com'] });
  assert.equal(widens(added(g, narrow)), false);
  assert.equal(narrows(g, narrow), true);
});

test('before a site is on, details come from the server offer; without them the extension says so', () => {
  const off = { site: 'x', hosts: ['x.com'], details: { hosts: ['x.com'], cookies: ['ct0@x.com'], pages: ['x.com/i/api'], sends: ['text'], about: { en: 'X' } } };
  assert.deepEqual(detailsFor(off, null).cookies, ['ct0@x.com']);
  const bare = detailsFor({ site: 'x', hosts: ['b.com', 'a.com'] }, null);
  assert.deepEqual(bare.hosts, ['a.com', 'b.com']);
  assert.equal(bare.unknown, true);
  assert.deepEqual(detailsFor(off, { recipe: seed('x') }).cookies, ['ct0@x.com'], 'the recipe we hold wins once it is on');
});

const doc = () => parseHTML('<!doctype html><html><body></body></html>').document;

test('the Details panel lists hosts, pages, cookies, fields, who sees it and how to switch off (EN and UK)', () => {
  const d = { ...detailsOf(seed('x')), about: { en: 'Searches X for your topics', uk: 'Шукає в X за вашими темами' } };
  for (const lang of ['en', 'uk']) {
    const T = STRINGS[lang];
    const el = detailsEl(doc(), T, d, { lang, on: false });
    const text = el.textContent;
    assert.ok(text.includes(T.detIfOn) && text.includes(T.detHosts) && text.includes(T.detPages) && text.includes(T.detCookies) && text.includes(T.detSends) && text.includes(T.detWho) && text.includes(T.detOff), lang);
    assert.ok(text.includes('x.com') && text.includes('abs.twimg.com') && text.includes('ct0@x.com'));
    assert.ok(text.includes(T.fields.text) && text.includes(T.fields.query));
    assert.ok(text.includes(lang === 'uk' ? 'Шукає в X' : 'Searches X'));
    assert.equal(detailsEl(doc(), T, d, { lang, on: true }).textContent.includes(T.detNow), true, 'after enabling it says what the site does now');
  }
});

test('no cookies reads "none"; hostile text is shown as text, never as markup', () => {
  const T = STRINGS.en;
  const d = { hosts: ['<img src=x onerror=alert(1)>.example.com'], cookies: [], pages: ['<b>x</b>'], sends: ['title'], about: { en: '<script>1</script>' } };
  const el = detailsEl(doc(), T, d, {});
  assert.ok(el.textContent.includes(T.detNoCookies));
  assert.equal(el.querySelectorAll('img, script, b:not(.tag)').length, 0);
  assert.ok(el.textContent.includes('<script>1</script>'));
});

test('an update that adds things marks them and opens the panel; the Approve button calls back', () => {
  const T = STRINGS.uk;
  const d = detailsOf({ ...seed('x'), hosts: [...seed('x').hosts, 'cdn.example.com'] });
  const el = detailsEl(doc(), T, d, { lang: 'uk', on: true, added: { hosts: ['cdn.example.com'], cookies: [], pages: [] }, open: true });
  assert.ok(el.hasAttribute('open'));
  const marked = [...el.querySelectorAll('li.add')];
  assert.equal(marked.length, 1);
  assert.ok(marked[0].textContent.includes('cdn.example.com') && marked[0].textContent.includes(T.added));
  let clicked = 0;
  const box = needsOkEl(doc(), T, { added: { hosts: ['cdn.example.com'], pages: [], cookies: ['auth_token@x.com'] } }, () => { clicked++; });
  assert.ok(box.textContent.includes(T.needsOk) && box.textContent.includes('cdn.example.com') && box.textContent.includes('auth_token@x.com'));
  box.querySelector('button').click();
  assert.equal(clicked, 1);
});

test('the popup shows a site as on only from the local grant, never from the server flag', () => {
  const src = readFileSync(new URL('../popup/popup.js', import.meta.url), 'utf8');
  assert.ok(!/offer\.enabled/.test(src), 'popup.js must not read the server enabled flag');
  assert.ok(/snap\.grants\?\.\[site\]/.test(src));
  const sw = readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8');
  assert.ok(/await grant\(store, site/.test(sw) && /await revoke\(store, site\)/.test(sw), 'the popup switch is what grants');
  const runner = readFileSync(new URL('../src/runner.js', import.meta.url), 'utf8');
  assert.ok(/!grants\[site\]/.test(runner), 'the runner skips a site without a grant');
});

import { grant } from '../src/grants.js';

test('switching a site on clears a stale pause, error and interval so it runs at once', async () => {
  const calls = { grants: null, patch: null };
  const store = { getGrants: async () => null, saveGrants: async (g) => { calls.grants = g; }, patchSite: async (s, p) => { calls.patch = [s, p]; } };
  await grant(store, 'youtube', detailsOf(seed('youtube')), 5);
  assert.deepEqual(Object.keys(calls.grants), ['youtube']);
  assert.deepEqual(calls.patch, ['youtube', { backoffUntil: 0, failures: 0, lastError: '', lastRunAt: 0 }]);
});

test('a switch clicked while Chrome\'s access prompt closed the popup is finished once access is granted', async () => {
  const { settlePending, PENDING_MS } = await import('../src/grants.js');
  const offers = [
    { site: 'medium', hosts: ['medium.com'], needs_permission_origins: ['https://medium.com/*'] },
    { site: 'x', hosts: ['x.com'], needs_permission_origins: ['https://x.com/*'] },
  ];
  const granted = new Set(['https://medium.com/*']);
  const contains = async (o) => o.every((x) => granted.has(x));
  const now = 1_000_000_000;
  const r = await settlePending({ medium: now - 1000, x: now - 1000, gone: now, old: now - PENDING_MS - 1 }, offers, contains, now);
  assert.deepEqual(r.finish, ['medium']); // granted: switch on
  assert.deepEqual(r.drop.sort(), ['gone', 'old']); // no longer offered, or the click is too old
  // x: prompt not answered yet, stays pending (neither list)
});
