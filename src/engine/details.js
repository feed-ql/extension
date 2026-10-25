// What a recipe will touch, in a form the person can read and the extension can compare (Story 13.15). The server sends
// the same shape for a site that is still off (GET /ext/offered `details`), computed by the same rules in Go
// (extrecipe.Details); the extension recomputes it from the real recipe before every run.
import { tpl, cookiesOf } from './template.js';

const uniq = (a) => [...new Set(a)].sort();

/** "host/path" of a step URL, with {query} filled from a list task, or without its query string for a search task. */
function pageOf(url, query) {
  let u = url.replace(/^https:\/\//, '');
  if (query !== undefined) return uniq([u.replaceAll('{query}', query)])[0];
  const q = u.indexOf('?');
  if (q >= 0) u = u.slice(0, q);
  return u;
}

/**
 * {hosts, cookies, pages, sends, about}.
 * hosts: the recipe's hosts. cookies: "NAME@host" for every cookie a request header uses (names only, never values).
 * pages: "host/path" of every request (a list recipe: one per list, e.g. "www.youtube.com/feed/history").
 * sends: the item fields pushed to feedql, plus "query". about: the recipe's plain-words description by language.
 */
export function detailsOf(rec) {
  const cookies = [];
  const pages = [];
  const lists = rec.kind === 'list' ? (rec.tasks?.lists || []) : null;
  for (const st of [...(rec.steps || []), ...(rec.detail?.steps || [])]) {
    const rq = st.request;
    if (!rq) continue;
    for (const name of Object.keys(rq.headers || {})) for (const c of cookiesOf(tpl(rq.headers[name]))) cookies.push(`${c.name}@${c.host}`);
    if (rq.url.includes('{item.')) pages.push(`${pageOf(rq.url)} (each new item)`);
    else if (lists && rq.url.includes('{query}')) for (const l of lists) pages.push(pageOf(rq.url, l.query));
    else pages.push(pageOf(rq.url));
  }
  const sends = [...Object.keys(rec.items?.map || {}).filter((k) => rec.items.map[k] !== '' && rec.items.map[k] !== null), ...Object.keys(rec.detail?.map || {}).map((k) => `detail:${k}`)];
  return {
    hosts: uniq(rec.hosts || []),
    cookies: uniq(cookies),
    pages: uniq(pages),
    sends: uniq([...sends, 'query']),
    about: rec.about && typeof rec.about === 'object' ? { ...rec.about } : {},
  };
}

/** The part of details a grant is made of and compared on. */
export const footprintOf = (d) => ({ hosts: [...d.hosts], cookies: [...d.cookies], pages: [...d.pages] });

/** What `now` adds over a granted footprint, per kind ([] when nothing). */
export function added(grant, now) {
  const out = {};
  for (const k of ['hosts', 'cookies', 'pages']) out[k] = (now[k] || []).filter((x) => !(grant?.[k] || []).includes(x));
  return out;
}
export const widens = (a) => !!(a.hosts.length || a.cookies.length || a.pages.length);
/** True when `now` asks for strictly less than the grant in some kind and more in none. */
export const narrows = (grant, now) => !widens(added(grant, now)) && ['hosts', 'cookies', 'pages'].some((k) => (grant[k] || []).some((x) => !now[k].includes(x)));
