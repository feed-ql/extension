// The recipe interpreter: a generic, declarative executor. Port of backend/internal/extrecipe/run.go (the reference);
// it must give the same items on the same fixtures. No eval, no Function, no remote code: templates, JSON paths,
// CSS selectors (through an injected DOM engine) and regular expressions only, plus the named built-in transforms.
//
// env = {
//   fetch(req) -> {status, headers:{get(name)}, body, redirected?}   req = {stepId, method, url, headers, body, omit}
//   cookie(name, host) -> Promise<string>   read for ONE request's headers; the value is never kept (see request())
//   now() -> Date
//   transforms: {name: async (args, nowMs) => string}
//   html: {parse(body) -> docId, select(docId, nodeId|null, selector, attr) -> [{id, value}], release(docId)}  (HTML steps)
//   pause(pageIndex): optional, awaited between two pages of one task (pacing)
// }
import { parseJSON, Obj, scalar, compact } from './json.js';
import { parsePath, evalPath, isEmptyNode } from './jsonpath.js';
import { tpl, render, typed, hasEmptyCookie, cookiesOf, refs, stringify, List, CookieScopeError } from './template.js';
import { hostAllowed, sameSite, isFeedqlHost } from './hosts.js';

export const MAX_VAR = 4 << 20;
const MAX_BODY = 8 << 20;
const FORBIDDEN_HEADERS = new Set(['cookie', 'cookie2', 'host']);

/** Stops the whole site run: a rate limit, a block or a signed-out session. */
export class Refusal extends Error {
  constructor({ status, auth = false, step = '', retryAfterSec = 0, resetAtMs = 0 }) {
    super(auth ? `not signed in (${status}) at step ${step}` : `asked to slow down (${status}) at step ${step}`);
    this.status = status;
    this.auth = auth;
    this.step = step;
    this.retryAfterSec = retryAfterSec;
    this.resetAtMs = resetAtMs;
  }
}

/** Fails the task, not the site. */
import { checkRegex, timed, RegexBudgetError, MAX_REGEX_INPUT } from './regexguard.js';

export class StepError extends Error {
  constructor(step, msg) {
    super(`${step}: ${msg}`);
    this.step = step;
    this.msg = msg;
  }
}

/** Cached step variables (X's home page and script) for the tasks of one run; optionally persisted by `store`. */
export class Session {
  constructor(store = null) { this.mem = new Map(); this.store = store; }
  async get(key, nowMs) {
    let e = this.mem.get(key);
    if (!e && this.store) { e = await this.store.get(key); if (e) this.mem.set(key, e); }
    return e && nowMs < e.until ? e : null;
  }
  async set(key, entry) {
    this.mem.set(key, entry);
    if (this.store) await this.store.set(key, entry);
  }
}

// ---- small helpers ----

const pathCache = new Map();
function pathOf(s) {
  let p = pathCache.get(s);
  if (!p) {
    try { p = parsePath(s); } catch { p = { relative: false, steps: [{ kind: 0, key: '\0' }] }; }
    pathCache.set(s, p);
  }
  return p;
}

/** Go regexp -> JS RegExp (leading inline flags (?i)(?s)(?m) become flags). */
const reCache = new Map();
function regexOf(src, global = false) {
  const key = `${global ? 'g' : ''}/${src}`;
  let re = reCache.get(key);
  if (!re) {
    let flags = global ? 'g' : '';
    const m = /^\(\?([ims]+)\)/.exec(src);
    if (m) { flags += m[1]; src = src.slice(m[0].length); }
    const bad = checkRegex(src);
    if (bad) throw new StepError('regex', bad);
    re = new RegExp(src, flags);
    reCache.set(key, re);
  }
  re.lastIndex = 0;
  return re;
}
const quoteMeta = (s) => s.replace(/[\\.+*?()|[\]{}^$]/g, '\\$&');
const inList = (l, n) => (l || []).includes(n);
const group = (m, g) => (m && m[g || 0] != null ? m[g || 0] : '');
const toList = (v) => (typeof v === 'string' ? [v] : v instanceof List ? [...v] : []);
const compactAny = (v) => (typeof v === 'string' ? v : compact(v, false));

/** Go's url.QueryEscape: space is +, only A-Za-z0-9 - _ . ~ stay. */
function queryEscape(s) {
  const b = new TextEncoder().encode(s.toWellFormed ? s.toWellFormed() : s);
  let out = '';
  for (const c of b) {
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 95 || c === 46 || c === 126) out += String.fromCharCode(c);
    else if (c === 32) out += '+';
    else out += `%${c.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
function iso(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RFC3339 = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|[+-]\d\d:\d\d)$/;
const X_CREATED = /^([A-Z][a-z]{2}) ([A-Z][a-z]{2}) (\d\d) (\d\d):(\d\d):(\d\d) ([+-])(\d\d)(\d\d) (\d{4})$/;

/** `as` converters v1 (docs/sources/extension-recipes.md section 3). */
export function convert(as, s) {
  switch (as) {
    case '': case undefined: case 'string': case 'json': case 'exists': return s;
    case 'lower': return s.toLowerCase();
    case 'int': {
      const t = s.trim();
      if (/^[+-]?\d+$/.test(t)) return BigInt(t).toString();
      if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) {
        const f = Math.trunc(Number(t));
        return Number.isFinite(f) ? BigInt(f).toString() : '';
      }
      return '';
    }
    case 'time_rfc3339': {
      const m = RFC3339.exec(s);
      if (!m) return '';
      const t = Date.parse(s);
      return Number.isNaN(t) ? '' : iso(t);
    }
    case 'time_x_created_at': {
      const m = X_CREATED.exec(s);
      if (!m || !DAYS.includes(m[1]) || !MONTHS.includes(m[2])) return '';
      const off = (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9]));
      const t = Date.UTC(Number(m[10]), MONTHS.indexOf(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) - off * 60000;
      return iso(t);
    }
    case 'time_unix': return /^\d+$/.test(s) && Number(s) > 0 ? iso(Number(s) * 1000) : '';
    case 'time_unix_ms': return /^\d+$/.test(s) && Number(s) > 0 ? iso(Number(s)) : '';
    case 'time_snowflake_ms': {
      if (!/^\d+$/.test(s) || s.length > 20) return '';
      const n = BigInt(s);
      if (n >= 1n << 64n) return '';
      const ms = Number(n >> 22n);
      return ms > 1_200_000_000_000 && ms < 4_000_000_000_000 ? iso(ms) : '';
    }
    default: return '';
  }
}

// ---- extraction ----

/** x = {resp, node, hnode, sc, joins, env}. Returns null, a string or a List. */
async function evalExtractor(x, e) {
  let cands = [];
  if (e.any_of && e.any_of.length) {
    for (const leaf of e.any_of) {
      const v = await evalExtractor(x, leaf);
      if (v !== null) { cands = toList(v); break; }
    }
  } else if (e.template) {
    cands = [render(tpl(e.template), x.sc)];
  } else if (e.join) {
    const node = x.joins?.[e.join]?.get(render(tpl(e.key), x.sc));
    if (node !== undefined) cands = fromPath(e, node, node);
  } else if (e.from) {
    if (e.from === 'body') cands = [x.resp.body];
    else if (e.from === 'status') cands = [String(x.resp.status)];
    else cands = [x.resp.headers?.get(e.from.replace(/^header:/, '')) || ''];
  } else if (e.path) {
    cands = fromPath(e, x.resp?.json, x.node);
  } else if (e.selector) {
    cands = await fromSelector(x, e);
  } else {
    const re = regexOf(regexSource(x, e.regex), !!e.all);
    const body = x.resp.body.slice(0, MAX_REGEX_INPUT);
    if (e.all) cands = timed(() => [...body.matchAll(re)].map((m) => group(m, e.group)));
    else {
      const m = timed(() => re.exec(body));
      if (m) cands = [group(m, e.group)];
    }
    return finish(x, e, cands);
  }
  if (e.regex) {
    const re = regexOf(e.regex);
    const kept = [];
    timed(() => {
      for (const c of cands) {
        const m = re.exec(c.slice(0, MAX_REGEX_INPUT));
        if (m) kept.push(group(m, e.group));
      }
    });
    cands = kept;
  }
  return finish(x, e, cands);
}

/** Renders {var.x} placeholders inside a regex, each value quoted. */
function regexSource(x, re) {
  const t = tpl(re);
  if (!refs(t).length) return re;
  const q = { vars: {}, consts: {}, now: x.sc.now };
  for (const [k, v] of Object.entries(x.sc.vars)) q.vars[k] = quoteMeta(stringify(v));
  for (const [k, v] of Object.entries(x.sc.consts || {})) q.consts[k] = quoteMeta(stringify(v));
  return render(t, q);
}

function fromPath(e, root, cur) {
  const nodes = evalPath(pathOf(e.path), root, cur);
  if (e.as === 'exists') return nodes.some((n) => !isEmptyNode(n)) ? ['true'] : [];
  const out = [];
  for (const n of nodes) {
    const s = scalar(n);
    if (s !== null) out.push(s);
    else if (e.as === 'json' && n !== null && n !== undefined) out.push(compact(n, true));
  }
  return out;
}

async function fromSelector(x, e) {
  const doc = x.resp?.doc;
  if (doc == null) return [];
  const hits = await x.env.html.select(doc, x.hnode ?? null, e.selector, e.attr || '');
  return hits.map((h) => h.value).filter((s) => s !== '');
}

function finish(x, e, cands) {
  let out = [];
  for (let c of cands) {
    if (c === '' || c == null || inList(e.ignore, c)) continue;
    c = convert(e.as, c);
    if (c === '') continue;
    if (e.truncate > 0) {
      const r = [...c];
      if (r.length > e.truncate) c = r.slice(0, e.truncate).join('');
    }
    out.push(c);
  }
  if (!out.length && e.default) {
    const d = render(tpl(e.default), x.sc);
    if (d) out = [d];
  }
  if (!out.length) {
    if (e.required) throw new Error(e.required);
    return null;
  }
  if (e.join_with) return out.join(e.join_with);
  if (e.all) return List.from(out);
  return out[0];
}

// ---- requests ----

function renderValue(v, sc) {
  if (typeof v === 'string') {
    const t = tpl(v);
    const ty = typed(t, sc);
    if (ty.ok) return ty.value === null ? { v: '', omit: true } : { v: ty.value, omit: false };
    return { v: render(t, sc), omit: false };
  }
  if (Array.isArray(v)) return { v: v.map((e) => renderValue(e, sc).v), omit: false };
  if (v && typeof v === 'object') {
    const m = {};
    for (const [k, e] of Object.entries(v)) {
      const r = renderValue(e, sc);
      if (!r.omit) m[k] = r.v;
    }
    return { v: m, omit: false };
  }
  return { v, omit: false };
}

function logURL(u) { return `${u.protocol}//${u.host}${u.pathname}`; }

async function request(rec, st, env, sc, res) {
  const rq = st.request;
  const fail = (m) => new StepError(st.id, m);
  let u;
  try {
    u = render(tpl(rq.url), sc);
    if (rq.query && Object.keys(rq.query).length) {
      const pairs = [];
      for (const k of Object.keys(rq.query).sort()) {
        const r = renderValue(rq.query[k], sc);
        if (r.omit) continue;
        pairs.push(`${queryEscape(k)}=${queryEscape(typeof r.v === 'string' ? r.v : compactAny(r.v))}`);
      }
      u += (u.includes('?') ? '&' : '?') + pairs.join('&');
    }
  } catch (e) {
    if (e instanceof CookieScopeError) throw fail('cookies may only be read in request headers');
    throw e;
  }
  let pu;
  try { pu = new URL(u); } catch { pu = null; }
  if (!pu || pu.protocol !== 'https:' || !hostAllowed(rec.hosts, pu.hostname)) throw fail("the request address is not allowed by the recipe's hosts");
  if (isFeedqlHost(pu.hostname)) throw fail('a recipe may not call feedql hosts');
  // The person granted Chrome access per site; every request host must still be inside that grant (13.15).
  if (env.hostGranted && !(await env.hostGranted(pu.hostname))) throw fail(`access to ${pu.hostname} was not granted`);
  const req = { stepId: st.id, method: rq.method || 'GET', url: u, headers: {}, body: undefined, omit: rq.credentials === 'omit' };

  // Cookies: read here, for this request's headers only. The jar is a local that dies with this function; the values
  // are never stored, logged, put in a URL/body/variable or sent to feedql.
  const jar = new Map();
  for (const name of Object.keys(rq.headers || {})) {
    for (const c of cookiesOf(tpl(rq.headers[name]))) {
      if (isFeedqlHost(c.host) || !hostAllowed(rec.hosts, c.host) || !sameSite(c.host, pu.hostname)) throw fail(`a cookie of ${c.host} cannot go to ${pu.hostname}`);
      const key = `${c.name}@${c.host}`;
      if (!jar.has(key)) jar.set(key, (await env.cookie(c.name, c.host)) || '');
    }
  }
  const hsc = { ...sc, cookie: (n, h) => jar.get(`${n}@${h}`) || '' };
  for (const k of Object.keys(rq.headers || {}).sort()) {
    if (FORBIDDEN_HEADERS.has(k.toLowerCase())) throw fail(`header ${k} cannot be set`);
    const t = tpl(rq.headers[k]);
    if (hasEmptyCookie(t, hsc)) throw new Refusal({ status: 401, auth: true, step: st.id });
    req.headers[k.toLowerCase()] = render(t, hsc);
  }
  try {
    if (typeof rq.body === 'string') req.body = render(tpl(rq.body), sc);
    else if (rq.body !== undefined && rq.body !== null) {
      req.body = compactAny(renderValue(rq.body, sc).v);
      if (!req.headers['content-type']) req.headers['content-type'] = 'application/json';
    }
  } catch (e) {
    if (e instanceof CookieScopeError) throw fail('cookies may only be read in request headers');
    throw e;
  }
  let out;
  try { out = await env.fetch(req); } catch (e) { throw fail(e.message || 'request failed'); }
  res.steps.push({ step: st.id, url: logURL(pu), status: out.status });
  if (out.redirected) throw fail('the request was redirected (not followed)');
  const body = typeof out.body === 'string' ? out.body.slice(0, MAX_BODY) : '';
  return { status: out.status, headers: out.headers, body, json: undefined, doc: undefined };
}

function refuse(rec, st, r) {
  const p = rec.pacing || {};
  if (inList(p.backoff_statuses, r.status)) {
    const ref = new Refusal({ status: r.status, auth: inList(p.auth_statuses, r.status), step: st.id });
    for (const h of p.retry_after_headers || []) {
      const v = r.headers?.get(h);
      if (v && /^[+-]?\d+$/.test(v.trim()) && Number(v) > 0) ref.retryAfterSec = Math.max(ref.retryAfterSec, Number(v));
    }
    for (const h of p.reset_headers || []) {
      const v = r.headers?.get(h);
      if (v && /^[+-]?\d+$/.test(v.trim()) && Number(v) > 0) ref.resetAtMs = Number(v) * 1000;
    }
    return ref;
  }
  return new StepError(st.id, st.errors?.[String(r.status)] || `HTTP ${r.status}`);
}

/** Runs the steps once; returns the parsed responses by step id. */
async function page(s, rec, env, sc, res) {
  const resps = {};
  const soft = new Set();
  for (const st of rec.steps) {
    if (st.fallback_for && !soft.has(st.fallback_for)) continue;
    const ckey = `${rec.site}/${st.id}@${rec.version}`;
    if (st.cache_sec > 0) {
      const ce = await s.get(ckey, env.now().getTime());
      if (ce) {
        Object.assign(sc.vars, ce.vars);
        res.steps.push({ step: st.id, cached: true });
        continue;
      }
    }
    const fresh = [];
    if (st.request) {
      const r = await request(rec, st, env, sc, res);
      if (r.status >= 200 && r.status < 300) resps[st.id] = r;
      else if (inList(st.soft_fail_statuses, r.status)) { soft.add(st.id); continue; } else throw refuse(rec, st, r);
      if (st.expect === 'json') {
        let body = r.body;
        if (st.json_between) {
          const b = st.json_between;
          const i = body.indexOf(b.start);
          const j = i < 0 ? -1 : body.indexOf(b.end, i + b.start.length);
          if (j < 0) throw new StepError(st.id, 'no JSON document between the markers');
          body = body.slice(i + b.start.length, j);
        }
        try { r.json = parseJSON(body); } catch { throw new StepError(st.id, 'response is not JSON'); }
      } else if (st.expect === 'html') {
        if (!env.html) throw new StepError(st.id, 'HTML responses are not supported here');
        r.doc = await env.html.parse(r.body);
      }
      for (const e of st.extract || []) {
        let v;
        try { v = await evalExtractor({ resp: r, sc, env }, e); } catch (err) { throw new StepError(st.id, err.message); }
        if (typeof v === 'string' && v.length > MAX_VAR) v = v.slice(0, MAX_VAR);
        sc.vars[e.var] = v;
        fresh.push(e.var);
      }
    }
    if (st.transform) {
      const tr = st.transform;
      const fn = env.transforms?.[tr.name];
      if (!fn) throw new StepError(st.id, `unknown transform ${tr.name}`);
      const args = {};
      for (const [k, t] of Object.entries(tr.args || {})) args[k] = render(tpl(t), sc);
      try { sc.vars[tr.out] = await fn(args, env.now().getTime()); } catch (e) { throw new StepError(st.id, e.message); }
    }
    if (st.cache_sec > 0) {
      const vars = {};
      for (const k of fresh) vars[k] = sc.vars[k];
      await s.set(ckey, { vars, until: env.now().getTime() + st.cache_sec * 1000 });
    }
  }
  return resps;
}

// ---- items ----

const truthy = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v !== '' && v !== 'false' && v !== '0';
  if (v instanceof List) return v.length > 0;
  return true;
};

async function buildItems(rec, r, sc, env) {
  const st = { skipped: 0, dropped: 0 };
  const it = rec.items;
  const nodes = [];
  const root = it.root || {};
  if (root.any_of?.length) {
    for (const l of root.any_of) {
      for (const n of evalPath(pathOf(l.path), r.json, r.json)) nodes.push({ j: n });
      if (nodes.length) break;
    }
  } else if (root.path) for (const n of evalPath(pathOf(root.path), r.json, r.json)) nodes.push({ j: n });
  else if (root.selector && r.doc != null) for (const h of await env.html.select(r.doc, null, root.selector, '')) nodes.push({ h: h.id });
  const joins = {};
  for (const [name, j] of Object.entries(it.joins || {})) {
    const tab = new Map();
    for (const n of evalPath(pathOf(j.root.path), r.json, r.json)) {
      let k = null;
      try { k = await evalExtractor({ resp: r, sc, env, node: n }, j.key); } catch (err) { if (err instanceof RegexBudgetError) throw err; k = null; }
      if (typeof k === 'string' && !tab.has(k)) tab.set(k, n);
    }
    joins[name] = tab;
  }
  const out = [];
  for (const n of nodes) {
    const item = Object.create(null);
    const isc = { ...sc, item };
    const ix = { resp: r, sc: isc, env, node: n.j, hnode: n.h, joins };
    for (const nv of it.vars || []) {
      let v;
      try { v = await evalExtractor(ix, nv); } catch (err) { if (err instanceof RegexBudgetError) throw err; v = null; }
      item[nv.name] = v;
    }
    let dropped = false;
    for (const rule of it.drop_if || []) {
      const v = item[rule.var] ?? null;
      const s = stringify(v);
      if ((rule.truthy && truthy(v)) || (rule.empty && s === '') || (rule.equals && s === rule.equals) || (rule.matches && timed(() => regexOf(rule.matches).test(s.slice(0, MAX_REGEX_INPUT))))) { dropped = true; break; }
    }
    if (dropped) { st.dropped++; continue; }
    const pl = it.pick_link;
    if (pl) {
      item[pl.into] = null;
      for (const cand of toList(item[pl.var])) {
        let cu = null;
        try { cu = new URL(cand); } catch { /* not a URL */ }
        if (cu && (cu.protocol === 'https:' || cu.protocol === 'http:') && !(pl.skip_hosts || []).some((h) => cu.hostname === h || cu.hostname.endsWith(`.${h}`))) { item[pl.into] = cand; break; }
      }
    }
    const m = it.map;
    const R = (t) => (t ? render(tpl(t), isc) : '');
    const o = { external_id: R(m.external_id), url: R(m.url), discussion_url: R(m.discussion_url), title: R(m.title), text: R(m.text), author: R(m.author), author_url: R(m.author_url), published_at: R(m.published_at), lang: R(m.lang), place: R(m.place) };
    if (!o.external_id || !o.url || !o.text.trim() || !o.author || !o.published_at) { st.skipped++; continue; }
    const item2 = { external_id: o.external_id, url: o.url };
    if (o.discussion_url) item2.discussion_url = o.discussion_url;
    if (o.title) item2.title = o.title;
    item2.text = o.text;
    item2.author = o.author;
    if (o.author_url) item2.author_url = o.author_url;
    item2.published_at = o.published_at;
    if (o.lang) item2.lang = o.lang;
    if (o.place) item2.place = o.place;
    const metrics = {};
    for (const [k, t] of Object.entries(m.metrics || {})) {
      const v = R(t);
      if (/^[+-]?\d+$/.test(v) && (k === 'likes' || k === 'reposts' || k === 'replies')) metrics[k] = parseInt(v, 10);
    }
    if (Object.keys(metrics).length) item2.metrics = metrics;
    out.push(item2);
  }
  return { items: out, ...st };
}

// ---- the run ----

/**
 * Executes the recipe for one task. task = {query, max, since (Date|null), pages, cursor}.
 * Returns {items, pages, skipped, dropped, old, nextCursor, steps}. Throws Refusal (stop the site) or StepError (fail the task).
 */
export async function runTask(session, rec, task, env) {
  const t = { ...task };
  if (!(t.max >= 1)) t.max = rec.tasks.max;
  t.max = Math.min(t.max, rec.tasks.max);
  const since = task.since instanceof Date && !Number.isNaN(task.since.getTime()) ? task.since : null;
  let pages = 1;
  const pg = rec.paginate;
  if (pg) {
    pages = pg.max_pages;
    if (t.pages > 0) pages = Math.min(t.pages, Math.max(pg.max_pages, pg.catchup_max_pages || 0));
  }
  const factor = Math.max(rec.tasks.count_factor || 0, 1);
  const size = rec.tasks.page_size || 50;
  const res = { items: [], pages: 0, skipped: 0, dropped: 0, old: 0, nextCursor: '', unfinished: false, steps: [] };
  const vars = Object.create(null);
  const seen = new Set();
  let cursor = '';
  for (let pageIx = 0; pageIx < pages; pageIx++) {
    if (pageIx === 1 && t.cursor) cursor = t.cursor; // resumes an interrupted catch-up; page 1 never uses a cursor
    const sc = { query: t.query, count: Math.min(t.max * factor, size), cursor, offset: pg ? pageIx * (pg.offset_step || 0) : 0, since, now: env.now(), vars, consts: rec.consts || {} };
    const resps = await page(session, rec, env, sc, res);
    try {
      res.pages++;
      let src = null;
      for (const id of rec.items.source) if (resps[id]) { src = resps[id]; break; }
      if (!src) throw new StepError(rec.items.source[0], res.steps.length ? `HTTP ${res.steps[res.steps.length - 1].status}` : 'no response');
      const b = await buildItems(rec, src, sc, env);
      res.skipped += b.skipped;
      res.dropped += b.dropped;
      let older = 0;
      for (const it of b.items) {
        if (seen.has(it.external_id)) continue;
        seen.add(it.external_id);
        if (since) {
          const pt = Date.parse(it.published_at);
          if (!Number.isNaN(pt) && pt < since.getTime()) { older++; res.old++; continue; }
        }
        if (res.items.length < t.max) res.items.push(it);
      }
      cursor = '';
      if (pg && pg.cursor && resps[pg.step]) {
        const v = await evalExtractor({ resp: resps[pg.step], sc, env }, pg.cursor).catch((err) => { if (err instanceof RegexBudgetError) throw err; return null; });
        cursor = typeof v === 'string' ? v : '';
      }
      res.nextCursor = cursor;
      res.unfinished = !!t.catchup && !!pg && !!pg.cursor && older === 0 && cursor !== '' && (pageIx === pages - 1 || res.items.length >= t.max);
      if (res.items.length >= t.max || !pg || (pg.stop_at_since && older > 0) || (cursor === '' && !pg.offset_step) || b.items.length === 0) break;
    } finally {
      for (const r of Object.values(resps)) if (r.doc != null) await env.html.release(r.doc);
    }
    if (env.pause && pageIx + 1 < pages) await env.pause(pageIx);
  }
  return res;
}

