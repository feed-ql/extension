// `expect: "html"` steps: CSS selectors through the DOM engine (linkedom stands in for the offscreen DOMParser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, runTask } from '../src/engine/exec.js';
import { fixture, staticDoer, env, domEngine } from './helpers.js';

const recipe = () => ({
  schema: 1, id: 'forum-search', site: 'forum', kind: 'search', label: 'Forum', version: 1,
  hosts: ['forum.example'], item_hosts: ['forum.example'], needs_permission_origins: ['https://forum.example/*'],
  tasks: { per_run: 1, max: 10, terms: 3, max_query_len: 100 },
  steps: [{ id: 'list', request: { url: 'https://forum.example/search', query: { q: '{query}', page: '{cursor}' }, credentials: 'include' }, expect: 'html',
    extract: [{ var: 'site_meta', selector: 'meta[name=k]', attr: 'content' }, { var: 'ttl', selector: 'title' }] }],
  items: {
    source: ['list'],
    root: { selector: 'div.topic' },
    vars: [
      { name: 'id', selector: 'a.title', attr: 'href', regex: '/t/(\\d+)$', group: 1 },
      { name: 'title', selector: 'a.title' },
      { name: 'url', selector: 'a.title', attr: 'href' },
      { name: 'by', selector: 'span.by' },
      { name: 'when', selector: 'time', attr: 'datetime', as: 'time_rfc3339' },
      { name: 'n', selector: 'span.n', as: 'int' },
    ],
    drop_if: [{ var: 'by', empty: true }],
    map: { external_id: 't{item.id}', url: '{item.url}', title: '{item.title}', text: '{item.title} ({var.site_meta})', author: '{item.by}', published_at: '{item.when}', metrics: { replies: '{item.n}' } },
  },
  pacing: { min_interval_sec: 600, min_gap_sec: 5, max_gap_sec: 9, backoff_statuses: [429], backoff_base_sec: 600, max_backoff_sec: 7200 },
});

test('HTML root selector, attribute and text extraction, regex on an attribute, drop rule, step vars', async () => {
  const html = await domEngine();
  const d = staticDoer({ bodies: { list: fixture('html-sample.html') } });
  const res = await runTask(new Session(), recipe(), { query: 'rust async', max: 10 }, env(d, { html }));
  assert.equal(res.items.length, 2);
  assert.equal(res.dropped, 1);
  assert.deepEqual(res.items[0], {
    external_id: 't1', url: 'https://forum.example/t/1', title: 'First topic', text: 'First topic (meta-value)', author: 'ann',
    published_at: '2026-10-10T10:00:00Z', metrics: { replies: 12 },
  });
  assert.equal(res.items[1].metrics, undefined, 'a non-numeric count is omitted');
  assert.equal(d.calls[0].url, 'https://forum.example/search?q=rust+async');
});

test('an HTML step with no engine fails the task, it does not guess', async () => {
  const d = staticDoer({ bodies: { list: fixture('html-sample.html') } });
  await assert.rejects(runTask(new Session(), recipe(), { query: 'a', max: 5 }, env(d)), /not supported/);
});

test('documents are released after each page', async () => {
  const base = await domEngine();
  let open = 0;
  const html = { parse: (b) => { open++; return base.parse(b); }, select: (...a) => base.select(...a), release: (id) => { open--; return base.release(id); } };
  const d = staticDoer({ bodies: { list: fixture('html-sample.html') } });
  await runTask(new Session(), recipe(), { query: 'a', max: 5 }, env(d, { html }));
  assert.equal(open, 0);
});
