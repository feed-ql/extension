// Templates, JSON paths and converters, mirrored from the Go reference tests (extrecipe validate_test.go).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplate, render, typed, List } from '../src/engine/template.js';
import { parseJSON, scalar, Obj } from '../src/engine/json.js';
import { parsePath, evalPath } from '../src/engine/jsonpath.js';
import { convert } from '../src/engine/exec.js';

const sc = {
  query: 'go & rust (v2)', count: 40, since: new Date('2026-10-09T05:00:00Z'), vars: { a: 'A', e: '' },
  consts: { o: { k: true } }, now: new Date(1_800_000_000_000), item: {},
};

test('templates render like the Go interpreter', () => {
  const cases = {
    '{query|url}': 'go%20%26%20rust%20(v2)',
    '{query|restli}': 'go%20%26%20rust%20%28v2%29',
    '{query|json}': '"go & rust (v2)"',
    'q={query} n={count}': 'q=go & rust (v2) n=40',
    '{var.e ?? var.a}': 'A',
    'x{?since_date} s:{since_date}{/}': 'x s:2026-10-09',
    'x{?var.e} s{/}y': 'xy',
    '{const.o}': '{"k":true}',
    '{"a":1}': '{"a":1}',
    '{{literal} {': '{literal} {',
    '{since_unix}|{now_unix}': '1791522000|1800000000',
    '{var.a|lower}': 'a',
  };
  for (const [src, want] of Object.entries(cases)) assert.equal(render(parseTemplate(src), sc), want, src);
});

test('templates refuse what the validator refuses', () => {
  for (const bad of ['{nope}', '{var.a|x}', '{?query}x', '{/}', '{cookie:a}', '{query']) assert.throws(() => parseTemplate(bad), undefined, bad);
});

test('a sole placeholder keeps its type; an empty one is reported empty', () => {
  assert.deepEqual(typed(parseTemplate('{count}'), sc), { ok: true, value: 40 });
  assert.deepEqual(typed(parseTemplate('{cursor}'), sc), { ok: true, value: null });
  assert.equal(typed(parseTemplate('n={count}'), sc).ok, false);
  assert.equal(typed(parseTemplate('{count|url}'), sc).ok, false);
});

test('unquote, uuid, rand, now', () => {
  assert.equal(render(parseTemplate('{var.q|unquote}'), { ...sc, vars: { q: '"ajax:1"' } }), 'ajax:1');
  assert.match(render(parseTemplate('{uuid}'), sc), /^[0-9a-f-]{36}$/);
  assert.match(render(parseTemplate('{rand}'), sc), /^[0-9a-f]{16}$/);
  assert.equal(render(parseTemplate('{now}'), sc), '2027-01-15T08:00:00Z');
  assert.equal(render(parseTemplate('{now_ms}'), sc), '1800000000000');
  assert.equal(render(parseTemplate('{var.l}'), { ...sc, vars: { l: List.from(['a', 'b']) } }), 'a,b');
});

test('a cookie placeholder fails closed unless a request header supplies the jar', () => {
  const t = parseTemplate('{cookie:ct0@x.com}');
  assert.throws(() => render(t, sc), /only allowed in a request header/);
  assert.equal(render(t, { ...sc, cookie: (n, h) => `${n}@${h}` }), 'ct0@x.com');
});

test('JSON path: counts, order, filter does not look inside a match', () => {
  const doc = parseJSON('{"a":[{"k":"x","v":1,"in":{"k":"x","v":9}},{"k":"y","v":2}],"b":{"k":"x","v":3},"t":true}');
  const n = (p) => evalPath(parsePath(p), doc, doc).length;
  const want = { '$.a[0].v': 1, '$.a[*].k': 2, '$..k': 4, '$..v': 4, "$..[?(@.k=='x')]": 2, '$.a[?(@.v)]': 2, "$.a[?(@.k=='z')]": 0, "$['b'].k": 1, '$.a[5]': 0, "$..[?(@.in.k=='x')]": 1 };
  for (const [p, c] of Object.entries(want)) assert.equal(n(p), c, p);
  const got = evalPath(parsePath("$..[?(@.k=='x')].v"), doc, doc).map(scalar);
  assert.equal(got.join(','), '1,3');
  for (const bad of ['', 'a.b', '$.a[', '$..[?(a)]', '$.a[-1]', '$..[?(@.k==x)]']) assert.throws(() => parsePath(bad), undefined, bad);
});

test('JSON parser keeps key order (even integer-like keys) and number text', () => {
  const o = parseJSON('{"b":1,"2":2,"1":3,"big":12345678901234567890,"f":1.50}');
  assert.ok(o instanceof Obj);
  assert.deepEqual(o.keys, ['b', '2', '1', 'big', 'f']);
  assert.equal(scalar(o.get('big')), '12345678901234567890');
  assert.equal(scalar(o.get('f')), '1.50');
  assert.throws(() => parseJSON('{"a":1} x'));
  assert.throws(() => parseJSON('{"a":'));
});

test('converters', () => {
  assert.equal(convert('int', ' 42 '), '42');
  assert.equal(convert('int', '3.9'), '3');
  assert.equal(convert('int', 'abc'), '');
  assert.equal(convert('time_x_created_at', 'Fri Oct 10 10:00:00 +0000 2026'), '2026-10-10T10:00:00Z');
  assert.equal(convert('time_x_created_at', 'Fri Oct 10 10:00:00 +0200 2026'), '2026-10-10T08:00:00Z');
  assert.equal(convert('time_x_created_at', 'nonsense'), '');
  assert.equal(convert('time_rfc3339', '2026-10-10T12:00:00.123+02:00'), '2026-10-10T10:00:00Z');
  assert.equal(convert('time_unix', '1800000000'), '2027-01-15T08:00:00Z');
  assert.equal(convert('time_unix_ms', '1800000000000'), '2027-01-15T08:00:00Z');
  assert.match(convert('time_snowflake_ms', '7249871234567890123'), /^2024-/);
  assert.equal(convert('time_snowflake_ms', '123'), '');
  assert.equal(convert('nonsense', 'x'), '');
});
