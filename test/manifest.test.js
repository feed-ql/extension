import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EXTENSION_ID } from '../src/config.js';
import { STRINGS, pickLang } from '../src/i18n.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));

test('pinned extension id matches the manifest key', () => {
  const der = Buffer.from(manifest.key, 'base64');
  const id = [...createHash('sha256').update(der).digest('hex').slice(0, 32)].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('');
  assert.equal(id, EXTENSION_ID);
});

test('no remote code, no eval, no cookie upload path', () => {
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } };
  walk(new URL('src', root).pathname); walk(new URL('popup', root).pathname); walk(new URL('offscreen', root).pathname);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /\beval\(|new Function\(|importScripts\(|import\(['"]https?:/, f);
    assert.doesNotMatch(src, /document\.cookie/, f);
  }
  // cookie values may only be read in cookies.js
  for (const f of files.filter((f) => !f.endsWith('/cookies.js'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /chrome\.cookies/, f);
});

test('no per-site code: only the named transform and the recipe model ship in the extension', () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } };
  walk(new URL('src', root).pathname); walk(new URL('popup', root).pathname); walk(new URL('offscreen', root).pathname);
  assert.ok(!files.some((f) => /\/sites\//.test(f)), 'src/sites is gone');
  // X's transaction-id algorithm is the one named built-in; everything else must be site-agnostic
  for (const f of files.filter((f) => !/\/(xct|i18n)\.js$/.test(f))) {
    assert.doesNotMatch(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /linkedin|twimg|x\.com|twitter|voyager|SearchTimeline/i, f);
  }
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('uk and en have the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.uk).sort(), Object.keys(STRINGS.en).sort());
  assert.equal(pickLang('auto', 'uk-UA'), 'uk');
  assert.equal(pickLang('auto', 'de'), 'en');
});
