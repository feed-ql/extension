// Section 11 of docs/sources/extension-recipes.md; a port of backend/internal/extrecipe/regexguard.go. A recipe whose
// patterns break these rules is refused before anything runs (a browser regex backtracks).
export const MAX_REGEX_LEN = 200;
export const MAX_REGEX_INPUT = 2_000_000;
export const REGEX_BUDGET_MS = 250;

export class RegexBudgetError extends Error {
  constructor() { super('regex budget exceeded'); this.msg = 'regex budget exceeded'; this.step = 'regex'; }
}

function braces(rs, i) {
  let j = i + 1;
  const num = () => {
    let n = 0, d = 0;
    while (j < rs.length && rs[j] >= '0' && rs[j] <= '9' && d < 6) { n = n * 10 + (rs[j].charCodeAt(0) - 48); j++; d++; }
    return d > 0 ? n : null;
  };
  const lo = num();
  if (lo === null) return null;
  if (rs[j] === '}') return { lo, hi: lo };
  if (rs[j] !== ',') return null;
  j++;
  if (rs[j] === '}') return { lo, hi: -1 };
  const hi = num();
  if (hi === null || rs[j] !== '}') return null;
  return { lo, hi };
}

function quantAt(rs, i) {
  if (i >= rs.length) return { is: false, unb: false };
  const c = rs[i];
  if (c === '*' || c === '+') return { is: true, unb: true };
  if (c === '?') return { is: true, unb: false };
  if (c === '{') { const b = braces(rs, i); if (b) return { is: true, unb: b.hi < 0 }; }
  return { is: false, unb: false };
}

function upperBound(rs, i) {
  if (i < rs.length) {
    if (rs[i] === '?') return 1;
    if (rs[i] === '{') { const b = braces(rs, i); if (b) return b.hi; }
  }
  return 0;
}

/** Returns an error message, or '' when the pattern passes (placeholders already rendered). */
export function checkRegex(p) {
  const rs = [...p];
  if (rs.length > MAX_REGEX_LEN) return `regex is longer than ${MAX_REGEX_LEN} characters`;
  const stack = [];
  let inClass = false;
  for (let i = 0; i < rs.length; i++) {
    const c = rs[i];
    if (c === '\\') {
      const n = rs[i + 1];
      if (n !== undefined && !inClass && ((n >= '1' && n <= '9') || n === 'k')) return 'regex back-references are not allowed';
      i++;
      continue;
    }
    if (inClass) { if (c === ']') inClass = false; continue; }
    switch (c) {
      case '[':
        inClass = true;
        if (rs[i + 1] === '^') i++;
        if (rs[i + 1] === ']') i++;
        break;
      case '(': {
        const rest = rs.slice(i, i + 4).join('');
        if (rest.startsWith('(?=') || rest.startsWith('(?!') || rest.startsWith('(?<=') || rest.startsWith('(?<!')) return 'regex look-around is not allowed';
        stack.push({ unbounded: false });
        break;
      }
      case ')': {
        if (!stack.length) return 'unbalanced )';
        const g = stack.pop();
        const { is, unb } = quantAt(rs, i + 1);
        if (g.unbounded && is && unb) return 'regex has a nested unbounded quantifier (like (a+)+): not allowed';
        if (g.unbounded && is && !unb && upperBound(rs, i + 1) > 3) return 'regex repeats a group holding an unbounded quantifier more than 3 times';
        if (stack.length && (g.unbounded || (is && unb))) stack[stack.length - 1].unbounded = true;
        break;
      }
      case '*': case '+':
        if (stack.length) stack[stack.length - 1].unbounded = true;
        break;
      case '{': {
        const b = braces(rs, i);
        if (b && b.hi < 0 && stack.length) stack[stack.length - 1].unbounded = true;
        break;
      }
      default:
    }
  }
  return '';
}

/** Placeholders ({var.x}, {const.x}, ...) are replaced by an empty string before the static check. */
export const withoutPlaceholders = (p) => p.replace(/\{(?:var|const|item|query|count|cursor|offset|since|now)[^}]*\}/g, '');

/** Every regex a recipe holds (extract[].regex, drop_if[].matches) must pass; throws naming the first that does not. */
export function checkRecipeRegexes(rec) {
  const bad = (where, p) => { const m = checkRegex(withoutPlaceholders(p)); if (m) throw new Error(`recipe refused: ${where}: ${m}`); };
  const scan = (o, where) => {
    if (Array.isArray(o)) { o.forEach((x) => scan(x, where)); return; }
    if (!o || typeof o !== 'object') return;
    if (typeof o.regex === 'string') bad(where, o.regex);
    if (typeof o.matches === 'string') bad(where, o.matches);
    for (const v of Object.values(o)) scan(v, where);
  };
  scan(rec, rec.site || 'recipe');
}

/** Runs f; fails when it took longer than the budget (the executor cannot interrupt a running regex in the worker). */
export function timed(f, now = () => performance.now()) {
  const t = now();
  const r = f();
  if (now() - t > REGEX_BUDGET_MS) throw new RegexBudgetError();
  return r;
}
