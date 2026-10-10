// JSONPath subset, port of backend/internal/extrecipe/jsonpath.go. $ root, @ current, .key, ['key'], [n], [*], ..key,
// ..[*] and filters [?(@.a.b=='v')] / [?(@.a.b)]. A recursive filter does not descend into a node it matched.
import { Obj, scalar } from './json.js';

const CHILD = 0, INDEX = 1, WILD = 2, DESCEND = 3, DESCEND_FILTER = 4, FILTER = 5, DESCEND_WILD = 6;

export function isEmptyNode(n) {
  if (n === null || n === undefined) return true;
  if (typeof n === 'string') return n === '';
  if (typeof n === 'boolean') return !n;
  if (n instanceof Obj) return n.keys.length === 0;
  if (Array.isArray(n)) return n.length === 0;
  return false;
}

function parseBracket(whole, inner, desc) {
  if (inner === '*') return { kind: desc ? DESCEND_WILD : WILD };
  if (inner.startsWith('?(') && inner.endsWith(')')) {
    const expr = inner.slice(2, -1);
    const st = { kind: desc ? DESCEND_FILTER : FILTER, fequal: false, fval: '' };
    let lhs = expr;
    const eq = expr.indexOf('==');
    if (eq >= 0) {
      lhs = expr.slice(0, eq).trim();
      const r = expr.slice(eq + 2).trim();
      if (r.length < 2 || (r[0] !== "'" && r[0] !== '"') || r[r.length - 1] !== r[0]) throw new Error(`JSON path ${JSON.stringify(whole)}: filter value must be a quoted string`);
      st.fval = r.slice(1, -1);
      st.fequal = true;
    }
    lhs = lhs.trim();
    if (!lhs.startsWith('@.') || lhs.length < 3) throw new Error(`JSON path ${JSON.stringify(whole)}: a filter tests @.key[.key]`);
    st.fpath = lhs.slice(2).split('.');
    if (st.fpath.some((k) => k === '')) throw new Error(`JSON path ${JSON.stringify(whole)}: empty key in filter`);
    return st;
  }
  if (inner.length >= 2 && (inner[0] === "'" || inner[0] === '"') && inner[inner.length - 1] === inner[0]) {
    return { kind: desc ? DESCEND : CHILD, key: inner.slice(1, -1) };
  }
  if (/^\d+$/.test(inner) && !desc) return { kind: INDEX, idx: Number(inner) };
  throw new Error(`JSON path ${JSON.stringify(whole)}: unsupported [${inner}]`);
}

/** Parses a path. Throws on a malformed one. */
export function parsePath(s) {
  if (!s) throw new Error('empty JSON path');
  const p = { raw: s, relative: false, steps: [] };
  if (s[0] === '@') p.relative = true;
  else if (s[0] !== '$') throw new Error(`JSON path ${JSON.stringify(s)} must start with $ or @`);
  let i = 1;
  while (i < s.length) {
    let desc = false;
    if (s.startsWith('..', i)) { desc = true; i += 2; } else if (s[i] === '.') i++;
    else if (s[i] !== '[') throw new Error(`JSON path ${JSON.stringify(s)}: unexpected ${JSON.stringify(s[i])} at ${i}`);
    if (i < s.length && s[i] === '[') {
      let j = s.indexOf(']', i) - i;
      if (j < 0) throw new Error(`JSON path ${JSON.stringify(s)}: unclosed [`);
      if (s.startsWith('[?(', i)) {
        const e = s.indexOf(')]', i) - i;
        if (e < 0) throw new Error(`JSON path ${JSON.stringify(s)}: unclosed filter`);
        j = e + 1;
      }
      const inner = s.slice(i + 1, i + j);
      i += j + 1;
      p.steps.push(parseBracket(s, inner, desc));
      continue;
    }
    let j = i;
    while (j < s.length && s[j] !== '.' && s[j] !== '[') j++;
    if (j === i) throw new Error(`JSON path ${JSON.stringify(s)}: empty name at ${i}`);
    const name = s.slice(i, j);
    i = j;
    if (name === '*') p.steps.push({ kind: desc ? DESCEND_WILD : WILD });
    else p.steps.push({ kind: desc ? DESCEND : CHILD, key: name });
  }
  return p;
}

function children(n, out) {
  if (n instanceof Obj) for (const k of n.keys) out.push(n.m.get(k));
  else if (Array.isArray(n)) for (const e of n) out.push(e);
  return out;
}

function matches(st, n) {
  if (!(n instanceof Obj)) return false;
  let cur = n;
  for (const k of st.fpath) {
    if (!(cur instanceof Obj) || !cur.m.has(k)) return false;
    cur = cur.m.get(k);
  }
  if (st.fequal) {
    const s = scalar(cur);
    return s !== null && s === st.fval;
  }
  return !isEmptyNode(cur);
}

function apply(st, n, out) {
  switch (st.kind) {
    case CHILD:
      if (n instanceof Obj && n.m.has(st.key)) out.push(n.m.get(st.key));
      break;
    case INDEX:
      if (Array.isArray(n) && st.idx < n.length) out.push(n[st.idx]);
      break;
    case WILD:
      children(n, out);
      break;
    case DESCEND: {
      const walk = (v) => {
        if (v instanceof Obj && v.m.has(st.key)) out.push(v.m.get(st.key));
        for (const c of children(v, [])) walk(c);
      };
      walk(n);
      break;
    }
    case DESCEND_WILD: {
      const walk = (v) => { for (const c of children(v, [])) { out.push(c); walk(c); } };
      walk(n);
      break;
    }
    case FILTER:
      for (const c of children(n, [])) if (matches(st, c)) out.push(c);
      break;
    case DESCEND_FILTER: {
      const walk = (v) => {
        for (const c of children(v, [])) {
          if (matches(st, c)) out.push(c);
          else walk(c);
        }
      };
      walk(n);
      break;
    }
    default:
  }
  return out;
}

/** The nodes the path selects, in document order. root: the document; cur: the current node for @ paths. */
export function evalPath(p, root, cur) {
  let nodes = [p.relative ? cur : root];
  for (const st of p.steps) {
    const next = [];
    for (const n of nodes) apply(st, n, next);
    nodes = next;
    if (!nodes.length) break;
  }
  return nodes;
}
