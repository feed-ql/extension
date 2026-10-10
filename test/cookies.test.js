// A cookie is read for one request header and goes nowhere else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { Session, runTask, StepError, Refusal } from '../src/engine/exec.js';
import { seed, staticDoer, xDoer, env, CT0 } from './helpers.js';

const base = (patch) => {
  const r = seed('x');
  patch(r);
  return r;
};
const searchStep = (r) => r.steps.find((s) => s.id === 'search');

test('a cookie in a URL, query, body, extractor or item template is refused at run time', async () => {
  const cases = {
    url: (r) => { searchStep(r).request.url = 'https://x.com/i/api/graphql/a/b?c={cookie:ct0@x.com}'; },
    query: (r) => { searchStep(r).request.query.extra = '{cookie:ct0@x.com}'; },
    body: (r) => { const s = searchStep(r); s.request.method = 'POST'; s.request.body = '{cookie:ct0@x.com}'; },
    item: (r) => { r.items.map.text = '{item.text} {cookie:ct0@x.com}'; },
    transformArg: (r) => { r.steps[2].transform.args.path = '{cookie:ct0@x.com}'; },
  };
  for (const [name, patch] of Object.entries(cases)) {
    const d = xDoer();
    let items = null;
    try {
      items = (await runTask(new Session(), base(patch), { query: 'a', max: 5 }, env(d))).items;
    } catch (e) {
      assert.ok(e instanceof StepError || e instanceof Error, name);
    }
    // the only place the value may appear is the csrf header of a request to x.com
    const seen = JSON.stringify([items, d.calls.map((c) => [c.url, c.body, c.method, Object.entries(c.headers).filter(([k]) => k !== 'x-csrf-token')])]);
    assert.ok(!seen.includes(CT0), `${name}: the cookie value escaped`);
  }
});

test('a cookie for another host than the request is refused before it is read', async () => {
  const rec = base((r) => { searchStep(r).request.headers['x-csrf-token'] = '{cookie:ct0@abs.twimg.com}'; });
  let read = 0;
  const d = xDoer();
  await assert.rejects(runTask(new Session(), rec, { query: 'a', max: 5 }, env(d, { cookie: async () => { read++; return 'v'; } })), (e) => e instanceof StepError && /cannot go to/.test(e.msg));
  assert.equal(read, 0);
  const rec2 = base((r) => { searchStep(r).request.headers['x-csrf-token'] = '{cookie:ct0@evil.example}'; });
  await assert.rejects(runTask(new Session(), rec2, { query: 'a', max: 5 }, env(xDoer())), StepError);
});

test('the Cookie header cannot be set by a recipe', async () => {
  const rec = base((r) => { searchStep(r).request.headers.cookie = 'a=b'; });
  await assert.rejects(runTask(new Session(), rec, { query: 'a', max: 5 }, env(xDoer())), (e) => e instanceof StepError && /cannot be set/.test(e.msg));
});

test('the cookie is not in errors, step logs, or the result', async () => {
  const d = xDoer({ status: { search: 500 } });
  let err;
  try { await runTask(new Session(), seed('x'), { query: 'a', max: 5 }, env(d)); } catch (e) { err = e; }
  assert.ok(err instanceof StepError);
  assert.ok(!JSON.stringify({ m: err.message, s: err.step }).includes(CT0));
  const ok = await runTask(new Session(), seed('x'), { query: 'a', max: 5 }, env(xDoer()));
  assert.ok(!JSON.stringify(ok).includes(CT0));
});

test('a missing cookie is a signed-out refusal before the request is made', async () => {
  const d = xDoer();
  await assert.rejects(runTask(new Session(), seed('x'), { query: 'a', max: 5 }, env(d, { cookie: async () => '' })), (e) => e instanceof Refusal && e.auth);
  assert.equal(d.calls.filter((c) => c.stepId === 'search').length, 0);
});

test('source: chrome.cookies is read in src/cookies.js only, and nothing reads document.cookie', () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } };
  for (const dir of ['src', 'popup', 'offscreen']) walk(new URL(`../${dir}`, import.meta.url).pathname);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /document\.cookie/, f);
    if (!f.endsWith('/src/cookies.js')) assert.doesNotMatch(src, /chrome\.cookies/, f);
  }
  assert.ok(files.some((f) => f.endsWith('/src/cookies.js')));
});
