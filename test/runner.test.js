// The service-worker pass (runAll) with fake deps: leases/since/cursor/pages are passed through, status is reported,
// backoff is persisted, recipes are cached by version, a cookie value never leaves toward feedql. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAll } from '../src/runner.js';
import { SignedOutError } from '../src/api.js';
import { seed, fixture, xDoer, staticDoer, CT0, JSESSION, cookies } from './helpers.js';

function world({ sites, doer, granted = true, debug = false, token = true, recipes = {} } = {}) {
  const w = { t: Date.parse('2026-10-10T12:00:00Z'), pushed: [], reports: [], sleeps: [], rules: [], raw: [], saved: [], offered: null, recipes, state: { sites: {}, running: false, runningSince: 0 }, getTasksCalls: [] };
  w.sites = sites;
  w.deps = {
    api: {
      async getTasks(o) { w.getTasksCalls.push(o); return typeof w.sites === 'function' ? w.sites() : w.sites; },
      async pushItems(site, items) { w.pushed.push({ site, items }); return { accepted: items.length, duplicates: 0, rejected: [] }; },
      async reportStatus(site, body) { w.reports.push({ site, ...body }); },
    },
    store: {
      async getState() { return structuredClone(w.state); },
      async saveState(s) { w.state = structuredClone(s); w.saved.push(s); },
      async patchSite(site, patch) { w.state.sites[site] = { lastRunAt: 0, lastOk: null, lastCount: 0, lastDuplicates: 0, lastFetched: 0, lastError: '', failures: 0, backoffUntil: 0, pushedTotal: 0, ...w.state.sites[site], ...patch }; w.saved.push(w.state); },
      async getSettings() { return { debug, lang: 'auto' }; },
      async getRecipes() { return structuredClone(w.recipes); },
      async saveRecipes(r) { w.recipes = structuredClone(r); w.saved.push(r); },
      async saveOffered(o) { w.offered = o; w.saved.push(o); },
      async saveShape(v) { w.shape = v; },
      async saveRaw(site, text) { w.raw.push({ site, text }); w.saved.push(text); },
    },
    token: async () => (token ? 'tok' : null),
    now: () => new Date(w.t),
    sleep: async (ms) => { w.sleeps.push(ms); w.t += ms; },
    rnd: () => 0,
    cookie: async (n, h) => cookies(n, h),
    contains: async () => granted,
    syncRules: async (recs) => { w.rules.push(recs.map((r) => r.site)); },
    html: null,
    closeHtml: async () => {},
    sessionStore: null,
    fetch: (req) => doer.fetch(req),
  };
  return w;
}

const xServer = (over = {}) => ({
  sites: {
    x: {
      enabled: true, recipe: seed('x'), recipe_version: 3, min_interval_sec: 900, due: true, last_synced_at: null,
      tasks: [
        { id: 't1', kind: 'search', query: '"go" OR rust', max: 20, since: '2026-01-01T00:00:00Z', cursor: 'START', pages: 1, catchup: false },
        { id: 't2', kind: 'search', query: 'zig', max: 20, pages: 1 },
      ],
      ...over,
    },
  },
  offered: [{ site: 'x', label: 'X', hosts: ['x.com', '*.x.com', 'abs.twimg.com'], needs_permission_origins: ['https://x.com/*', 'https://*.x.com/*', 'https://abs.twimg.com/*'], enabled: true }],
});

const allStrings = (w) => JSON.stringify([w.pushed, w.reports, w.saved, w.raw, w.offered, w.recipes, w.state, w.getTasksCalls, w.rules]);

test('a run: tasks in, items out with query, status reported, paced between tasks, nothing secret leaves', async () => {
  const d = xDoer();
  const w = world({ sites: xServer(), doer: d, debug: true });
  const r = await runAll({}, w.deps);
  assert.deepEqual(r, { ok: true });
  assert.equal(w.pushed.length, 2);
  assert.ok(w.pushed[0].items.length > 0);
  assert.ok(w.pushed.every((p) => p.site === 'x' && p.items.every((i) => typeof i.query === 'string' && i.query)));
  assert.equal(w.pushed[0].items[0].query, '"go" OR rust');
  assert.equal(w.pushed[1].items[0].query, 'zig');
  assert.equal(w.sleeps.length, 1);
  assert.ok(w.sleeps[0] >= 20_000 && w.sleeps[0] <= 35_000, String(w.sleeps));
  const rep = w.reports.at(-1);
  assert.equal(rep.ok, true);
  assert.equal(rep.count, w.pushed[0].items.length + w.pushed[1].items.length);
  assert.equal(w.state.sites.x.lastOk, true);
  assert.equal(w.state.sites.x.failures, 0);
  assert.deepEqual(w.rules, [['x']]);
  assert.equal(w.recipes.x.version, 3);
  assert.equal(w.offered.sites.x.recipe_version, 3);
  // since/cursor of the lease went into the request
  const first = decodeURIComponent(d.calls.find((c) => c.stepId === 'search').url);
  assert.ok(first.includes('since:2026-01-01') && !first.includes('START'), first); // page 1 is the newest: the stored cursor is not sent
  // the cookie value: in the one request header to x.com, nowhere else
  const text = allStrings(w);
  assert.ok(!text.includes(CT0) && !text.includes(JSESSION), 'a cookie value leaked into what the extension keeps or sends to feedql');
  for (const c of d.calls) {
    assert.ok(new URL(c.url).hostname.endsWith('x.com') || new URL(c.url).hostname === 'abs.twimg.com');
    assert.ok(!c.url.includes(CT0) && !(c.body || '').includes(CT0));
    for (const [k, v] of Object.entries(c.headers)) if (v.includes(CT0)) assert.equal(k, 'x-csrf-token');
  }
});

test('debug captures the raw response of the items step only', async () => {
  const w = world({ sites: xServer(), doer: xDoer(), debug: true });
  await runAll({}, w.deps);
  assert.ok(w.raw.length >= 1 && w.raw.every((r) => r.site === 'x' && r.text === fixture('x-search.recorded.json')));
  const w2 = world({ sites: xServer(), doer: xDoer(), debug: false });
  await runAll({}, w2.deps);
  assert.equal(w2.raw.length, 0);
});

test('429 backs the site off, persisted, doubles on the next failure, Run now never overrides it', async () => {
  const d = xDoer({ status: { search: 429 }, headers: { search: { 'Retry-After': '7200' } } });
  const w = world({ sites: xServer(), doer: d });
  await runAll({}, w.deps);
  const s1 = w.state.sites.x;
  assert.equal(s1.lastOk, false);
  assert.equal(s1.failures, 1);
  assert.equal(s1.backoffUntil, w.t + 7200_000, 'Retry-After raises the wait above base 1800 s (rnd=0: no jitter)');
  assert.match(s1.lastError, /asked to slow down \(429\)/);
  const rep = w.reports.at(-1);
  assert.equal(rep.ok, false);
  assert.equal(rep.backoff_until, new Date(s1.backoffUntil).toISOString());
  assert.equal(w.pushed.length, 0);
  // the second task did not run: a refusal stops the whole site
  assert.equal(d.calls.filter((c) => c.stepId === 'search').length, 1);
  // inside the backoff: neither a normal pass nor Run now fetches
  const calls = d.calls.length;
  await runAll({}, w.deps);
  await runAll({ force: true }, w.deps);
  assert.equal(d.calls.length, calls);
  assert.equal(w.getTasksCalls.at(-1).force, true);
  // after it: runs again, fails again, base * 2 (no Retry-After this time)
  w.t = s1.backoffUntil + 1000;
  d.headers = {};
  await runAll({}, w.deps);
  const s2 = w.state.sites.x;
  assert.equal(s2.failures, 2);
  assert.equal(s2.backoffUntil, w.t + 3600_000);
});

test('401/403 is reported as not signed in; a 404 fails the tasks softly with the recipe text and a short pause', async () => {
  let w = world({ sites: xServer(), doer: xDoer({ status: { search: 403 } }) });
  await runAll({}, w.deps);
  assert.match(w.state.sites.x.lastError, /not signed in to X \(403\)/);
  w = world({ sites: xServer(), doer: xDoer({ status: { search: 404 } }) });
  const t0 = w.t;
  await runAll({}, w.deps);
  assert.match(w.state.sites.x.lastError, /query id rotated/);
  assert.equal(w.state.sites.x.backoffUntil, t0 + 10 * 60_000);
  assert.equal(w.reports.at(-1).ok, false);
});

test('a missing permission is reported, nothing is fetched', async () => {
  const d = xDoer();
  const w = world({ sites: xServer(), doer: d, granted: false });
  await runAll({}, w.deps);
  assert.equal(d.calls.length, 0);
  assert.match(w.state.sites.x.lastError, /permission/);
  assert.equal(w.state.sites.x.backoffUntil, 0);
  assert.equal(w.reports.at(-1).ok, false);
});

test('a site that is off, or not due, or has no tasks does nothing', async () => {
  for (const over of [{ enabled: false }, { tasks: [] }, { due: false, tasks: [] }]) {
    const d = xDoer();
    const w = world({ sites: xServer(over), doer: d });
    await runAll({}, w.deps);
    assert.equal(d.calls.length, 0, JSON.stringify(over));
  }
});

test('the local interval is never shorter than the recipe/server interval', async () => {
  const d = xDoer();
  const w = world({ sites: xServer(), doer: d });
  await runAll({}, w.deps);
  const n = d.calls.length;
  w.t += 600_000; // 10 min < 15 min
  await runAll({}, w.deps);
  assert.equal(d.calls.length, n);
  w.t += 400_000; // 16+ min
  await runAll({}, w.deps);
  assert.ok(d.calls.length > n);
});

test('recipes are cached by recipe_version; an answer without a recipe and a new version is refused', async () => {
  const w = world({ sites: xServer(), doer: xDoer() });
  await runAll({}, w.deps);
  assert.equal(w.recipes.x.version, 3);
  // same version, recipe omitted: the cached copy runs
  w.sites = xServer({ recipe: undefined });
  w.t += 3600_000;
  const d = xDoer();
  w.deps.fetch = (r) => d.fetch(r);
  await runAll({}, w.deps);
  assert.ok(d.calls.length > 0);
  // new version, recipe omitted: cannot run
  w.sites = xServer({ recipe: undefined, recipe_version: 4 });
  w.t += 3600_000;
  const d2 = xDoer();
  w.deps.fetch = (r) => d2.fetch(r);
  await runAll({}, w.deps);
  assert.equal(d2.calls.length, 0);
  assert.match(w.state.sites.x.lastError, /recipe missing/);
});

test('a recipe this build cannot run (newer schema, unknown transform) is refused before any request', async () => {
  for (const edit of [(r) => { r.schema = 2; }, (r) => { r.steps[2].transform.name = 'eval'; }]) {
    const rec = seed('x');
    edit(rec);
    const d = xDoer();
    const w = world({ sites: xServer({ recipe: rec }), doer: d });
    await runAll({}, w.deps);
    assert.equal(d.calls.length, 0);
    assert.match(w.state.sites.x.lastError, /newer than this extension|does not have/);
  }
});

test('LinkedIn through the same pass: catch-up pages, 999 back-off', async () => {
  const server = {
    sites: { linkedin: { enabled: true, recipe: seed('linkedin'), recipe_version: 2, min_interval_sec: 1800, due: true, tasks: [{ id: 'l1', kind: 'search', query: 'event driven', max: 10, pages: 3, catchup: true }] } },
    offered: [],
  };
  const d = staticDoer({ bodies: { search_graphql: fixture('linkedin-search.synthetic.json') } });
  const w = world({ sites: server, doer: d });
  await runAll({}, w.deps);
  assert.equal(w.pushed[0].site, 'linkedin');
  assert.equal(w.pushed[0].items.length, 2);
  assert.ok(w.sleeps.length >= 1 && w.sleeps.every((s) => s >= 45_000 && s <= 90_000), 'page pause uses the recipe gap');
  const w2 = world({ sites: server, doer: staticDoer({ status: { search_graphql: 999 } }) });
  await runAll({}, w2.deps);
  assert.match(w2.state.sites.linkedin.lastError, /LinkedIn asked to slow down \(999\)/);
  assert.equal(w2.state.sites.linkedin.backoffUntil, w2.t + 1800_000);
});

test('signed out, busy', async () => {
  const w = world({ sites: xServer(), doer: xDoer(), token: false });
  assert.deepEqual(await runAll({}, w.deps), { skipped: 'signed-out' });
  const w2 = world({ sites: xServer(), doer: xDoer() });
  w2.state.running = true;
  w2.state.runningSince = w2.t - 1000;
  assert.deepEqual(await runAll({}, w2.deps), { skipped: 'busy' });
  const w3 = world({ sites: () => { throw new SignedOutError('x'); }, doer: xDoer() });
  assert.deepEqual(await runAll({}, w3.deps), { error: 'signed-out' });
  assert.equal(w3.state.running, false, 'the lock is released');
});

test('the status report carries a cursor only for an unfinished catch-up', async () => {
  const body = JSON.stringify({ data: { c: { cursorType: 'Bottom', value: 'NEXT1' }, t: [{ __typename: 'Tweet', rest_id: '9', legacy: { full_text: 'hi', created_at: 'Fri Oct 10 10:00:00 +0000 2026' }, core: { user_results: { result: { legacy: { screen_name: 'ann' } } } } }] } });
  const d = xDoer();
  d.bodies.search = body;
  const server = xServer();
  server.sites.x.tasks = [{ ...server.sites.x.tasks[0], catchup: true, pages: 1 }, { ...server.sites.x.tasks[1], id: 't2' }];
  const w = world({ sites: server, doer: d });
  await runAll({}, w.deps);
  // only the unfinished catch-up carries a cursor; the normal task is reported without one
  assert.deepEqual(w.reports.at(-1).tasks, [{ id: 't1', cursor: 'NEXT1' }, { id: 't2' }]);
});

test('a catch-up resumes at page 2; page 1 of every task is the newest', async () => {
  const body = (c) => JSON.stringify({ data: { c: { cursorType: 'Bottom', value: c }, t: [{ __typename: 'Tweet', rest_id: String(Math.random()).slice(2), legacy: { full_text: 'hi', created_at: 'Fri Oct 10 10:00:00 +0000 2026' }, core: { user_results: { result: { legacy: { screen_name: 'ann' } } } } }] } });
  const d = xDoer();
  const f = d.fetch;
  d.fetch = async (req) => (req.stepId === 'search' ? (d.calls.push(req), { status: 200, headers: new Headers(), body: body('NEXT') }) : f(req));
  const w = world({ sites: xServer({ tasks: [{ id: 'c1', kind: 'search', query: 'old', max: 20, since: '2026-01-01T00:00:00Z', cursor: 'RESUME', pages: 2, catchup: true }] }), doer: d });
  await runAll({}, w.deps);
  const q = d.calls.filter((c) => c.stepId === 'search').map((c) => decodeURIComponent(c.url));
  assert.equal(q.length, 2);
  assert.ok(!q[0].includes('RESUME') && q[1].includes('"cursor":"RESUME"'), q.join('\n'));
});

test('debug: the captured request shape holds the requests and no cookie value', async () => {
  const w = world({ sites: xServer(), doer: xDoer(), debug: true });
  await runAll({}, w.deps);
  assert.ok(w.shape.requests.length >= 2);
  const out = JSON.stringify(w.shape);
  assert.ok(!out.includes(CT0) && !out.includes(JSESSION));
  for (const r of w.shape.requests) assert.ok(!Object.keys(r.requestHeaders).some((k) => /cookie|authorization|csrf/i.test(k)));
});
