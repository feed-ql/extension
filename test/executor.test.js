// The generic executor on the same fixtures as the Go reference (backend/internal/extrecipe/extrecipe_test.go).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, runTask, Refusal, StepError } from '../src/engine/exec.js';
import { seed, fixture, staticDoer, xDoer, env, CT0, JSESSION, FIXED_NOW } from './helpers.js';

const run = (rec, task, e, session = new Session()) => runTask(session, rec, task, e);

test('X search on the recorded fixture', async () => {
  const d = xDoer();
  const res = await run(seed('x'), { query: '"go" OR rust', max: 20 }, env(d));
  assert.ok(res.items.length > 0, `no items; dropped ${res.dropped} skipped ${res.skipped}`);
  for (const it of res.items) {
    assert.ok(it.external_id && it.text && it.author && it.url.startsWith('http'), JSON.stringify(it));
    assert.match(it.published_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  }
  const first = res.items[0];
  assert.equal(first.author, 'Phil Eaton (@eatonphil)');
  assert.match(first.url, /^https:\/\/theconsensus\.dev\//, 'link-as-url: the article is the url');
  assert.equal(first.discussion_url, 'https://x.com/eatonphil/status/2096630185969803491');
  assert.ok(Object.keys(first).indexOf('discussion_url') === 2, 'discussion_url follows url like the Go struct');
  assert.equal(first.place, '@eatonphil');
  assert.equal(first.metrics.likes, 306);
  const search = d.calls.find((c) => c.stepId === 'search');
  assert.equal(search.headers['x-csrf-token'], CT0);
  assert.ok(search.headers['x-client-transaction-id']);
  assert.ok(search.headers.authorization.startsWith('Bearer '));
  assert.ok(!search.url.includes(CT0), 'the cookie must never reach the URL');
  assert.ok(search.url.includes('-filter%3Aretweets') && !search.url.includes('cursor') && search.url.startsWith('https://x.com/i/api/graphql/'), search.url);
  for (const s of res.steps) assert.ok(!(s.url || '').includes('?'), 'a step log must not hold a query string');
});

test('X: same original posts, unique ids, authors in the documented shape', async () => {
  const res = await run(seed('x'), { query: 'x', max: 50 }, env(xDoer()));
  const ids = new Set(res.items.map((i) => i.external_id));
  assert.equal(ids.size, res.items.length);
  for (const it of res.items) assert.ok(it.author.startsWith('@') || it.author.includes('(@'), it.author);
});

test('the transaction-id step is never cached, the home page is', async () => {
  const d = xDoer();
  const s = new Session();
  const e = env(d);
  await run(seed('x'), { query: 'a', max: 5 }, e, s);
  assert.equal(d.calls.length, 3);
  await run(seed('x'), { query: 'b', max: 5 }, e, s);
  const count = (id) => d.calls.filter((c) => c.stepId === id).length;
  assert.equal(count('home'), 1);
  assert.equal(count('search'), 2);
  const xcts = d.calls.filter((c) => c.stepId === 'search').map((c) => c.headers['x-client-transaction-id']);
  assert.notEqual(xcts[0], xcts[1]);
});

test('the step cache expires with cache_sec', async () => {
  const d = xDoer();
  const s = new Session();
  let t = FIXED_NOW.getTime();
  const e = env(d, { now: () => new Date(t) });
  await run(seed('x'), { query: 'a', max: 5 }, e, s);
  t += 3 * 3600_000 + 1000;
  await run(seed('x'), { query: 'a', max: 5 }, e, s);
  assert.equal(d.calls.filter((c) => c.stepId === 'home').length, 2);
});

test('X refusals: 429 with reset header, 403 signed out, 404 rotated id, no cookie, no chunk map', async () => {
  let d = xDoer({ status: { search: 429 }, headers: { search: { 'X-Rate-Limit-Reset': '1800000000' } } });
  await assert.rejects(run(seed('x'), { query: 'a', max: 5 }, env(d)), (e) => e instanceof Refusal && e.status === 429 && !e.auth && e.resetAtMs === 1800000000_000);
  d = xDoer({ status: { search: 403 } });
  await assert.rejects(run(seed('x'), { query: 'a', max: 5 }, env(d)), (e) => e instanceof Refusal && e.auth);
  d = xDoer({ status: { search: 404 } });
  await assert.rejects(run(seed('x'), { query: 'a', max: 5 }, env(d)), (e) => e instanceof StepError && /query id rotated/.test(e.msg));
  // no ct0: signed out before any request to the API
  d = xDoer();
  await assert.rejects(run(seed('x'), { query: 'a', max: 5 }, env(d, { cookie: async () => '' })), (e) => e instanceof Refusal && e.status === 401 && e.auth);
  assert.ok(!d.calls.some((c) => c.stepId === 'search'));
  // a home page without the chunk map
  d = xDoer();
  d.bodies.home = '<html>logged out</html>';
  await assert.rejects(run(seed('x'), { query: 'a', max: 5 }, env(d)), (e) => e instanceof StepError && /not signed in/.test(e.msg));
});

test('since adds the operator only when known', async () => {
  const d = xDoer();
  await run(seed('x'), { query: 'a', max: 5, since: new Date('2026-10-09T18:00:00Z') }, env(d));
  assert.ok(d.calls.find((c) => c.stepId === 'search').url.includes('since%3A2026-10-09'));
  const d2 = xDoer();
  await run(seed('x'), { query: 'a', max: 5 }, env(d2));
  assert.ok(!d2.calls.find((c) => c.stepId === 'search').url.includes('since'));
});

test('drop rules and the link rule', async () => {
  const body = `{"data":[{"__typename":"Tweet","rest_id":"1","legacy":{"full_text":"hello","created_at":"Fri Oct 10 10:00:00 +0000 2026","retweet_count":2,"favorite_count":5,"reply_count":0,"entities":{"urls":[{"expanded_url":"https://t.co/abc"},{"expanded_url":"https://x.com/a/status/9"}]}},"core":{"user_results":{"result":{"legacy":{"screen_name":"ann","name":""}}}}},
 {"__typename":"Tweet","rest_id":"2","legacy":{"full_text":"rt","created_at":"Fri Oct 10 10:00:00 +0000 2026","retweeted_status_result":{"result":{}}},"core":{"user_results":{"result":{"legacy":{"screen_name":"ann"}}}}},
 {"__typename":"Tweet","rest_id":"3","legacy":{"full_text":"reply","in_reply_to_status_id_str":"7","created_at":"Fri Oct 10 10:00:00 +0000 2026"},"core":{"user_results":{"result":{"legacy":{"screen_name":"ann"}}}}},
 {"__typename":"Tweet","rest_id":"4","legacy":{"full_text":"no date","created_at":"nonsense"},"core":{"user_results":{"result":{"legacy":{"screen_name":"ann"}}}}}]}`;
  const d = xDoer();
  d.bodies.search = body;
  const res = await run(seed('x'), { query: 'a', max: 10 }, env(d));
  assert.equal(res.items.length, 1);
  assert.equal(res.dropped, 3);
  const it = res.items[0];
  assert.equal(it.url, 'https://x.com/ann/status/1');
  assert.equal(it.author, '@ann');
  assert.equal(it.place, '@ann');
  assert.equal(it.metrics.reposts, 2);
  assert.equal(it.text, 'hello');
});

test('LinkedIn on the synthetic fixture', async () => {
  const d = staticDoer({ bodies: { search_graphql: fixture('linkedin-search.synthetic.json') } });
  const res = await run(seed('linkedin'), { query: 'event-driven', max: 10 }, env(d));
  assert.equal(res.items.length, 2);
  assert.equal(res.dropped, 1);
  const [it, b] = res.items;
  assert.equal(b.author, 'Acme Corp');
  assert.equal(b.metrics, undefined);
  assert.equal(it.external_id, '7249871234567890123');
  assert.equal(it.author, 'Jane Doe');
  assert.equal(it.url, 'https://www.linkedin.com/feed/update/urn:li:activity:7249871234567890123/');
  assert.equal(it.author_url, 'https://www.linkedin.com/in/jane-doe-123');
  assert.deepEqual(it.metrics, { likes: 128, reposts: 9, replies: 14 });
  assert.match(it.published_at, /^2024-/);
  const c = d.calls[0];
  assert.equal(c.headers['csrf-token'], 'ajax:123456-secret');
  assert.ok(c.url.includes('keywords:event-driven') && c.url.includes('count:10'), c.url);
  assert.ok(!c.url.includes('ajax:123456'), 'the cookie stays in the header');
});

test('LinkedIn falls back to the REST endpoint; both failing fails the task; 999 stops the site', async () => {
  let d = staticDoer({ bodies: { search_graphql: '', search_rest: fixture('linkedin-search.synthetic.json') }, status: { search_graphql: 400 } });
  const res = await run(seed('linkedin'), { query: 'a b', max: 10 }, env(d));
  assert.equal(res.items.length, 2);
  assert.equal(d.calls.length, 2);
  assert.ok(d.calls[1].url.includes('search/dash/clusters') && d.calls[1].url.includes('keywords:a%20b'), d.calls[1].url);
  d = staticDoer({ status: { search_graphql: 400, search_rest: 500 } });
  await assert.rejects(run(seed('linkedin'), { query: 'a', max: 10 }, env(d)), StepError);
  d = staticDoer({ status: { search_graphql: 999 } });
  await assert.rejects(run(seed('linkedin'), { query: 'a', max: 10 }, env(d)), (e) => e instanceof Refusal && e.status === 999 && !e.auth);
});

test('items older than since are dropped', async () => {
  const d = staticDoer({ bodies: { search_graphql: fixture('linkedin-search.synthetic.json') } });
  const res = await run(seed('linkedin'), { query: 'a', max: 10, since: new Date('2027-01-01T00:00:00Z') }, env(d));
  assert.equal(res.items.length, 0);
  assert.equal(res.old, 2);
});

test('pagination: offset steps, stop_at_since, catch-up page cap, task max', async () => {
  const body = fixture('linkedin-search.synthetic.json');
  const rec = seed('linkedin');
  // two pages requested, the fixture repeats: the second page adds nothing new (deduplicated), offsets advance
  let d = staticDoer({ bodies: { search_graphql: body } });
  const res = await run(rec, { query: 'a', max: 10, pages: 2 }, env(d, { pause: async () => {} }));
  assert.equal(res.pages, 2);
  assert.equal(res.items.length, 2);
  assert.ok(d.calls[0].url.includes('start:0') && d.calls[1].url.includes('start:10'), d.calls.map((c) => c.url).join('\n'));
  // pages above the recipe's catchup cap are cut to it
  d = staticDoer({ bodies: { search_graphql: body } });
  const r2 = await run(rec, { query: 'a', max: 10, pages: 99 }, env(d, { pause: async () => {} }));
  assert.ok(r2.pages <= rec.paginate.catchup_max_pages);
  // stop_at_since: a page holding an older item ends the paging
  d = staticDoer({ bodies: { search_graphql: body } });
  const r3 = await run(rec, { query: 'a', max: 10, pages: 3, since: new Date('2027-01-01T00:00:00Z') }, env(d));
  assert.equal(r3.pages, 1);
  // max cuts the list
  d = staticDoer({ bodies: { search_graphql: body } });
  const r4 = await run(rec, { query: 'a', max: 1 }, env(d));
  assert.equal(r4.items.length, 1);
});

test('the pause hook runs between pages only', async () => {
  const body = fixture('linkedin-search.synthetic.json');
  const d = staticDoer({ bodies: { search_graphql: body } });
  const pauses = [];
  await run(seed('linkedin'), { query: 'a', max: 10, pages: 3 }, env(d, { pause: async (i) => { pauses.push(i); } }));
  assert.deepEqual(pauses, [0, 1]);
});

test('cursor pagination: page 1 never has a cursor, a catch-up cursor opens page 2, page 3 follows the response', async () => {
  const rec = seed('x');
  const mk = (cursor) => JSON.stringify({ data: { tweets: [{ __typename: 'Tweet', rest_id: String(Math.random()).slice(2), legacy: { full_text: 'hi', created_at: 'Fri Oct 10 10:00:00 +0000 2026' }, core: { user_results: { result: { legacy: { screen_name: 'ann' } } } } }], c: { cursorType: 'Bottom', value: cursor } } });
  const d = xDoer();
  let n = 0;
  d.fetch = async (req) => {
    d.calls.push(req);
    if (req.stepId === 'search') return { status: 200, headers: new Headers(), body: mk(`CUR${++n}`) };
    return { status: 200, headers: new Headers(), body: d.bodies[req.stepId] };
  };
  const res = await run(rec, { query: 'a', max: 10, pages: 3, cursor: 'START', catchup: true }, env(d, { pause: async () => {} }));
  const searches = d.calls.filter((c) => c.stepId === 'search').map((c) => decodeURIComponent(c.url));
  assert.equal(searches.length, 3);
  assert.ok(!searches[0].includes('cursor') && !searches[0].includes('START'), searches[0]);
  assert.ok(searches[1].includes('"cursor":"START"'), searches[1]);
  assert.ok(searches[2].includes('"cursor":"CUR2"'), searches[2]);
  assert.equal(res.nextCursor, 'CUR3');
  assert.equal(res.unfinished, true);
  const res2 = await run(rec, { query: 'a', max: 10, pages: 3, catchup: false }, env(d, { pause: async () => {} }));
  assert.equal(res2.unfinished, false, 'only a catch-up can end unfinished');
});

test('Medium on the hand-authored fixture', async () => {
  const d = staticDoer({ bodies: { search: fixture('medium-search.handauthored.json') } });
  const res = await run(seed('medium'), { query: 'rate limiting', max: 10 }, env(d));
  assert.equal(res.items.length, 3);
  assert.equal(res.dropped, 1);
  const it = res.items[0];
  assert.equal(it.url, 'https://medium.com/p/1a2b3c4d5e6f');
  assert.equal(it.author, 'Ann Dev');
  assert.equal(it.author_url, 'https://medium.com/@anndev');
  assert.equal(it.text, 'A token bucket in forty lines.');
  assert.equal(it.metrics.likes, 420);
  assert.match(it.published_at, /^2025-/);
  assert.equal(res.items[2].author, 'Medium author');
  const c = d.calls[0];
  assert.equal(c.url, 'https://medium.com/_/graphql');
  assert.equal(c.headers['graphql-operation'], 'SearchQuery');
  assert.ok(String(c.body).includes('"query":"rate limiting"') && String(c.body).includes('"limit":10'), String(c.body));
});

test('YouTube list recipe: History and Watch later from the JSON embedded in the page', async () => {
  const rec = seed('youtube');
  let d = staticDoer({ bodies: { page: fixture('youtube-history.synthetic.html') } });
  let res = await run(rec, { query: 'feed/history', max: 50 }, env(d));
  assert.equal(d.calls[0].url, 'https://www.youtube.com/feed/history');
  assert.equal(res.items.length, 3, JSON.stringify(res.items));
  const a = res.items[0];
  assert.equal(a.external_id, 'dQw4w9WgXcQ');
  assert.equal(a.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(a.title, 'Never Gonna Give You Up');
  assert.equal(a.author, 'Rick Astley');
  assert.equal(a.published_at, '2026-10-10T12:00:00Z');
  assert.equal(res.items[2].author, 'YouTube channel');

  d = staticDoer({ bodies: { page: fixture('youtube-watchlater.synthetic.html') } });
  res = await run(rec, { query: 'playlist?list=WL', max: 50 }, env(d));
  assert.equal(d.calls[0].url, 'https://www.youtube.com/playlist?list=WL');
  assert.deepEqual(res.items.map((i) => [i.external_id, i.author]), [['eeeeeeeeeee', 'Gopher Academy'], ['fffffffffff', 'Systems Weekly']]);
});

test('YouTube list recipe: signed out, no document, broken document', async () => {
  const rec = seed('youtube');
  const go = (body) => run(rec, { query: 'feed/history', max: 50 }, env(staticDoer({ bodies: { page: body } })));
  await assert.rejects(go(fixture('youtube-history.signedout.synthetic.html')), /not signed in/);
  await assert.rejects(go('<html>"LOGGED_IN":true nothing</html>'), /between the markers/);
  await assert.rejects(go('"LOGGED_IN":true var ytInitialData = {oops;</script>'), /not JSON/);
});
