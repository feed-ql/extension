import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { animate, floatToHex, buildState, transactionId, onDemandUrl } from '../src/xct.js';

// Golden values printed by the Go implementation (xcli.animate / xctFloatToHex); the JS port must agree exactly.
const golden = readFileSync(new URL('./fixtures/xct-golden.go-output.txt', import.meta.url), 'utf8').trim().split('\n');

test('animate matches the Go port', () => {
  let n = 0;
  for (const line of golden.filter((l) => l.startsWith('A '))) {
    const m = /^A \[([^\]]*)\] (\S+) (\S*)$/.exec(line);
    const frame = m[1].split(' ').map(Number);
    assert.equal(animate(frame, Number(m[2])), m[3], line);
    n++;
  }
  assert.ok(n >= 15);
});

test('floatToHex matches the Go port', () => {
  for (const line of golden.filter((l) => l.startsWith('H '))) {
    const [, x, hex = ''] = line.split(' ');
    assert.equal(floatToHex(Number(x)), hex, line);
  }
});

test('transaction id is deterministic given time and random byte, and decodes to the key prefix', async () => {
  const state = { keyBytes: Array.from({ length: 70 }, (_, i) => i * 3 % 256), animKey: 'abc123' };
  const a = await transactionId(state, 'GET', '/i/api/graphql/x/SearchTimeline', 1_800_000_000_000, 77);
  const b = await transactionId(state, 'GET', '/i/api/graphql/x/SearchTimeline', 1_800_000_000_000, 77);
  assert.equal(a, b);
  assert.ok(!a.includes('='));
  const raw = Buffer.from(a, 'base64');
  assert.equal(raw.length, 1 + 70 + 4 + 16 + 1);
  assert.equal(raw[0], 77);
  assert.equal(raw[1] ^ 77, 0);
  assert.equal(raw[raw.length - 1] ^ 77, 3);
});

test('buildState and onDemandUrl on a minimal synthetic home page', () => {
  const key = Buffer.from(Array.from({ length: 70 }, (_, i) => (i * 7 + 1) % 256)).toString('base64');
  const path1 = 'M 10,10 C 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32';
  const rows = Array.from({ length: 16 }, () => ' C 12 200 45 90 130 250 77 10 200 30 255 0 128 64 99 180').join('');
  const svg = (i) => `<svg id="loading-x-anim-${i}"><g><path d="M 0 0 L 1 1"/><path d="M 1 2 L 3 ${rows}"/></g></svg>`;
  const home = `<meta name="twitter-site-verification" content="${key}">${[0, 1, 2, 3].map(svg).join('')}...,20:"ondemand.s",...,20:"abcdef0123"`;
  assert.equal(onDemandUrl(home), 'https://abs.twimg.com/responsive-web/client-web/ondemand.s.abcdef0123a.js');
  const js = 'x=(e[12], 16); y=(e[3], 16); z=(e[40], 16)';
  const st = buildState(home, js);
  assert.equal(st.keyBytes.length, 70);
  assert.match(st.animKey, /^[0-9a-f]+$/);
  assert.throws(() => buildState('<html>', js), /meta tag/);
  assert.equal(onDemandUrl('<html>'), null);
});
