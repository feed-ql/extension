import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRegex, checkRecipeRegexes, timed, RegexBudgetError } from '../src/engine/regexguard.js';
import { checkRecipe } from '../src/engine/transforms.js';
import { seed } from './helpers.js';

const bad = ['a'.repeat(201), '(a)\\1', '(?<n>a)\\k<n>', '(?=a)', '(?!a)', '(?<=a)b', '(?<!a)b', '(a+)+', '(.*)*', '(\\d+)*', '((ab)+)+', '(a*){2,}', '(a+){4}', '(a|b+)+',
  // 13.15: alternation or any quantifier inside a quantified group
  '^(a|aa)+$', '(a|aa)*', '(a|b)+', '(?:a|b){2}', '((a|b))+', '(a+)?', '(a+){1,3}', '(a?)+', '(a{2})+', '(x(a|b)y)?'];
const good = ['(ab)+', '(a|b)', '(a|b)c', 'x(?:foo|bar):\\d{4}', '(\\d{4})-(\\d{2})', '(ab)?', '(a)(b+)', '[(a+)+]', '[a|b]+', '\\(a+\\)+', 'a+b*', '(?i)foo(bar)?', 'x{2,}', '\\d{4}-\\d{2}'];

test('regex guard refuses what the Go CheckRegex refuses and passes what it passes', () => {
  for (const p of bad) assert.notEqual(checkRegex(p), '', p);
  for (const p of good) assert.equal(checkRegex(p), '', p);
});

test('a recipe with a forbidden pattern is refused before anything runs', () => {
  const rec = seed('medium');
  rec.items.drop_if = [...(rec.items.drop_if || []), { var: 'text', matches: '(a+)+$' }];
  assert.throws(() => checkRecipe(rec), /nested unbounded/);
  assert.throws(() => checkRecipeRegexes({ steps: [{ extract: [{ regex: '(?=x)' }] }] }), /look-around/);
  for (const s of ['x', 'linkedin', 'medium']) assert.doesNotThrow(() => checkRecipe(seed(s)), s);
});

test('the time budget fails with "regex budget exceeded"', () => {
  let t = 0;
  assert.throws(() => timed(() => 1, () => (t += 300)), (e) => e instanceof RegexBudgetError && e.message === 'regex budget exceeded');
  assert.equal(timed(() => 7, () => 0), 7);
});
