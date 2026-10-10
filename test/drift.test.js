// The fixtures here are copies of the Go reference's (see test/fixtures/README.md). When the backend checkout sits next
// to this repo, fail on any difference so the two interpreters keep testing the same inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const here = (p) => new URL(`./fixtures/${p}`, import.meta.url);
const backend = (p) => new URL(`../../backend/internal/extrecipe/${p}`, import.meta.url);

for (const [local, remote] of [
  ['seeds/x-search.json', 'seeds/x-search.json'],
  ['seeds/linkedin-search.json', 'seeds/linkedin-search.json'],
  ['x-search.recorded.json', 'testdata/x-search.recorded.json'],
  ['linkedin-search.synthetic.json', 'testdata/linkedin-search.synthetic.json'],
  ['seeds/medium-search.json', 'seeds/medium-search.json'],
  ['medium-search.handauthored.json', 'testdata/medium-search.handauthored.json'],
]) {
  test(`fixture ${local} matches the backend copy`, { skip: !existsSync(backend(remote)) && 'backend checkout not next to this repo' }, () => {
    assert.equal(readFileSync(here(local), 'utf8'), readFileSync(backend(remote), 'utf8'));
  });
}
