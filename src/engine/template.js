// Recipe templates, port of backend/internal/extrecipe/template.go (docs/sources/extension-recipes.md section 2).
// No eval: a template is parsed into literal parts and named sources, rendered by lookups and fixed filters.
import { Num, compact } from './json.js';

/** A list of extracted strings (distinct from an array constant, which renders as JSON). */
export class List extends Array {}

const FILTERS = new Set(['url', 'restli', 'json', 'lower', 'trim', 'unquote']);
const PLAIN = new Set(['query', 'count', 'cursor', 'offset', 'since', 'since_date', 'since_unix', 'uuid', 'now', 'now_ms', 'now_unix', 'rand']);

const isNameStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const abbreviate = (s) => (s.length > 60 ? `${s.slice(0, 60)}...` : s);
const NAME = /^[\p{L}\p{N}_]+$/u;

/** Thrown when a cookie placeholder is rendered anywhere but a request header. */
export class CookieScopeError extends Error {}

function parseSource(s) {
  if (PLAIN.has(s)) return { kind: s };
  const m = /^(var|const|item)\.(.*)$/s.exec(s);
  if (m) {
    if (!NAME.test(m[2])) throw new Error(`bad name in {${s}}`);
    return { kind: m[1], name: m[2] };
  }
  if (s.startsWith('cookie:')) {
    const rest = s.slice(7);
    const at = rest.indexOf('@');
    const name = at < 0 ? '' : rest.slice(0, at);
    const host = at < 0 ? '' : rest.slice(at + 1);
    if (!name || !host || /[ /?#]/.test(name + host)) throw new Error(`a cookie is {cookie:NAME@HOST}, got {${s}}`);
    return { kind: 'cookie', name, host: host.toLowerCase() };
  }
  throw new Error(`unknown source {${s}}`);
}

function parseExpr(body) {
  const segs = body.split('|');
  const sources = segs[0].split('??').map((c) => parseSource(c.trim()));
  const filters = [];
  for (const f of segs.slice(1)) {
    const name = f.trim();
    if (!FILTERS.has(name)) throw new Error(`unknown filter "${name}"`);
    filters.push(name);
  }
  return { kind: 'expr', sources, filters };
}

/** Parsed template. Throws on a syntax error or an unknown source or filter. */
export function parseTemplate(s) {
  const parts = [];
  let lit = '';
  const flush = () => { if (lit) { parts.push({ kind: 'lit', lit }); lit = ''; } };
  let open = 0;
  const bad = (m) => new Error(`template ${JSON.stringify(abbreviate(s))}: ${m}`);
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c !== '{') { lit += c; i++; continue; }
    if (s[i + 1] === '{') { lit += '{'; i += 2; continue; }
    if (i + 1 >= s.length || !(isNameStart(s[i + 1]) || s[i + 1] === '?' || s[i + 1] === '/')) { lit += '{'; i++; continue; }
    const end = s.indexOf('}', i) - i;
    if (end < 0) throw bad('unclosed {');
    const body = s.slice(i + 1, i + end);
    if (body.includes('{')) throw bad('nested {');
    i += end + 1;
    flush();
    if (body === '/') {
      if (open === 0) throw bad('{/} without {?name}');
      open--;
      parts.push({ kind: 'close' });
    } else if (body.startsWith('?')) {
      if (open > 0) throw bad('optional sections do not nest');
      let src;
      try { src = parseSource(body.slice(1).trim()); } catch (e) { throw bad(e.message); }
      if (src.kind === 'cookie') throw bad('a cookie cannot be a condition');
      open++;
      parts.push({ kind: 'open', sources: [src] });
    } else {
      try { parts.push(parseExpr(body)); } catch (e) { throw bad(e.message); }
    }
  }
  if (open !== 0) throw bad('{?name} without {/}');
  flush();
  return { raw: s, parts };
}

const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const nonEmpty = (s) => (s === '' || s == null ? null : s);

function emptyToNil(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return nonEmpty(v);
  if (v instanceof List && v.length === 0) return null;
  return v;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
export const rfc3339 = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;

export function newUUID() {
  return crypto.randomUUID();
}
export function randHex() {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => pad(b.toString(16))).join('');
}

/**
 * The data a template renders against. since/now: Date or null. vars/consts/item: plain objects.
 * cookie(name, host) is a SYNC lookup into the per-request jar, present only while request headers render.
 */
export function scopeValue(sc, s) {
  switch (s.kind) {
    case 'query': return nonEmpty(sc.query);
    case 'count': return sc.count ?? 0;
    case 'cursor': return nonEmpty(sc.cursor);
    case 'offset': return sc.offset ?? 0;
    case 'since': return sc.since ? rfc3339(sc.since) : null;
    case 'since_date': return sc.since ? rfc3339(sc.since).slice(0, 10) : null;
    case 'since_unix': return sc.since ? Math.floor(sc.since.getTime() / 1000) : null;
    case 'var': return hasOwn(sc.vars, s.name) ? emptyToNil(sc.vars[s.name]) : null;
    case 'const': return hasOwn(sc.consts, s.name) ? emptyToNil(sc.consts[s.name]) : null;
    case 'item': return hasOwn(sc.item, s.name) ? emptyToNil(sc.item[s.name]) : null;
    case 'cookie':
      if (!sc.cookie) throw new CookieScopeError('a cookie placeholder is only allowed in a request header');
      return nonEmpty(sc.cookie(s.name, s.host));
    case 'uuid': return (sc.uuid || newUUID)();
    case 'now': return rfc3339(sc.now);
    case 'now_ms': return sc.now.getTime();
    case 'now_unix': return Math.floor(sc.now.getTime() / 1000);
    case 'rand': return (sc.rand || randHex)();
    default: return null;
  }
}

function chainValue(sc, srcs) {
  for (const s of srcs) {
    const v = scopeValue(sc, s);
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** A value in a string context. */
export function stringify(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Num) return v.s;
  if (v instanceof List) return v.join(',');
  return compact(v, true);
}

const wf = (s) => (s.toWellFormed ? s.toWellFormed() : s);
const encode = (s) => encodeURIComponent(wf(s));

export function applyFilter(f, s) {
  switch (f) {
    case 'url': return encode(s);
    case 'restli': return encode(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
    case 'json': return compact(s, false);
    case 'lower': return s.toLowerCase();
    case 'trim': return s.trim();
    case 'unquote': return s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"' ? s.slice(1, -1) : s;
    default: return s;
  }
}

/** Renders into a string. */
export function render(t, sc) {
  let out = '';
  let skip = false;
  for (const p of t.parts) {
    if (p.kind === 'lit') { if (!skip) out += p.lit; } else if (p.kind === 'open') skip = scopeValue(sc, p.sources[0]) === null;
    else if (p.kind === 'close') skip = false;
    else if (!skip) {
      let s = stringify(chainValue(sc, p.sources));
      for (const f of p.filters) s = applyFilter(f, s);
      out += s;
    }
  }
  return out;
}

/** A template that is exactly one placeholder with no filters renders as the source's own type. */
export function typed(t, sc) {
  if (t.parts.length !== 1 || t.parts[0].kind !== 'expr' || t.parts[0].filters.length) return { ok: false, value: null };
  return { ok: true, value: chainValue(sc, t.parts[0].sources) };
}

/** All sources a template names (conditions and fallbacks included). */
export function refs(t) {
  return t.parts.flatMap((p) => p.sources || []);
}
export const cookiesOf = (t) => refs(t).filter((s) => s.kind === 'cookie');

/** Whether any cookie placeholder of the template renders empty (a signed-out session). */
export function hasEmptyCookie(t, sc) {
  return cookiesOf(t).some((c) => scopeValue(sc, c) === null);
}

const cache = new Map();
/** Parsed-template cache. An unparseable template (validated server-side) renders as itself. */
export function tpl(s) {
  let t = cache.get(s);
  if (!t) {
    try { t = parseTemplate(s); } catch { t = { raw: s, parts: [{ kind: 'lit', lit: s }] }; }
    cache.set(s, t);
  }
  return t;
}

