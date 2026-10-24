// Host rules shared by the interpreter, the permission request and the header rules.

/** Whether host matches an entry of a recipe `hosts` list ("x.com" or "*.x.com"). */
export function hostAllowed(hosts, host) {
  host = String(host).toLowerCase();
  return (hosts || []).some((h) => h === host || (h.startsWith('*.') && host.endsWith(h.slice(1))));
}

// A small built-in list of public suffixes (the full Public Suffix List is too big to ship and goes stale). A wildcard
// grant on one of these would read every site under it. Anything with a suffix not listed here is still protected by the
// "at least two labels after *." rule, which covers every plain TLD.
const PUBLIC_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'co.nz', 'org.nz', 'net.nz', 'co.za', 'org.za',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'co.kr', 'or.kr', 'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
  'com.br', 'net.br', 'org.br', 'gov.br', 'com.ar', 'com.mx', 'com.co', 'com.pe', 'com.ve', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'com.hk', 'com.tw', 'com.sg', 'com.my', 'com.ph', 'com.vn', 'com.tr', 'com.sa', 'com.eg', 'com.pk', 'com.ng', 'co.il', 'co.id', 'co.th', 'co.ke',
  'com.ua', 'org.ua', 'net.ua', 'gov.ua', 'edu.ua', 'in.ua', 'kiev.ua', 'kyiv.ua', 'com.ru', 'org.ru', 'com.pl', 'net.pl', 'org.pl', 'com.de', 'com.es', 'com.pt', 'com.gr', 'com.ro', 'com.cy',
  'github.io', 'gitlab.io', 'herokuapp.com', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com', 'appspot.com', 'blogspot.com', 'cloudfront.net', 'amazonaws.com', 'azurewebsites.net', 'cloudapp.net', 'onrender.com', 'fly.dev', 'surge.sh', 'glitch.me', 'repl.co', 'ngrok.io', 'ngrok-free.app', 'trycloudflare.com', 'myshopify.com', 'wixsite.com', 'weebly.com', 'carrd.co', 'bubbleapps.io', 'webflow.io', 'framer.app', 'readthedocs.io',
]);

const LABEL = '[a-z0-9]([a-z0-9-]*[a-z0-9])?';
const HOST_RE = new RegExp(`^${LABEL}(\\.${LABEL})+$`);
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export const MAX_HOSTS = 10;

const isPublicSuffix = (d) => PUBLIC_SUFFIXES.has(d) || !d.includes('.');

/** The registrable domain of a host (eTLD+1 by the built-in list), or '' when the host is itself a public suffix. */
export function registrableDomain(host) {
  const labels = String(host).toLowerCase().split('.').filter(Boolean);
  if (labels.length < 2) return '';
  for (let n = 2; n <= labels.length; n++) {
    const suffix = labels.slice(-n).join('.');
    if (n === 2 && !PUBLIC_SUFFIXES.has(suffix)) return suffix;
    if (n >= 2 && PUBLIC_SUFFIXES.has(suffix) && n < labels.length && !PUBLIC_SUFFIXES.has(labels.slice(-(n + 1)).join('.'))) return labels.slice(-(n + 1)).join('.');
  }
  return '';
}

/** Cookie scope: the same host, or two hosts of one registrable domain (a public suffix is nobody's site). */
export function sameSite(a, b) {
  a = String(a).toLowerCase();
  b = String(b).toLowerCase();
  if (a === b) return !isPublicSuffix(a);
  const ra = registrableDomain(a);
  return ra !== '' && ra === registrableDomain(b);
}

/** A host a recipe may never name: feedql itself (a recipe must not turn the extension against its own backend). */
export const isFeedqlHost = (h) => h === 'feedql.com' || h.endsWith('.feedql.com') || h === 'feedql.app' || h.endsWith('.feedql.app');

/** Why a `hosts` entry is not acceptable, or ''. Exact host ("x.com") or "*.suffix" with at least two labels after "*." that is not a public suffix. */
export function checkHostEntry(h) {
  if (typeof h !== 'string' || h !== h.toLowerCase() || h !== h.trim()) return `host ${JSON.stringify(h)} must be lower-case without spaces`;
  const bare = h.startsWith('*.') ? h.slice(2) : h;
  if (bare.includes('*')) return `host ${h}: a wildcard is only allowed as the first label ("*.example.com")`;
  if (!HOST_RE.test(bare) || IP_RE.test(bare)) return `host ${h} is not a host name`;
  if (isFeedqlHost(bare)) return `host ${h}: a recipe may not name feedql hosts`;
  if (h.startsWith('*.') && (bare.split('.').length < 2 || isPublicSuffix(bare))) return `host ${h}: a wildcard on a public suffix or a bare TLD is not allowed`;
  if (!bare.includes('.')) return `host ${h} is a bare TLD`;
  return '';
}

const ORIGIN = /^https:\/\/(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?\/\*$/;


/**
 * The origins to ask Chrome for (chrome.permissions.request) for a recipe: exactly `needs_permission_origins`, and only
 * those that are well-formed https patterns covered by the recipe's `hosts`. Anything else is dropped, so a recipe can
 * never widen what the person is asked to grant. Works on a recipe and on an `offered` entry of GET /ext/tasks alike ({hosts, needs_permission_origins}).
 */
export function permissionOrigins(rec) {
  const out = [];
  for (const o of rec?.needs_permission_origins || []) {
    if (typeof o !== 'string' || !ORIGIN.test(o)) continue;
    const host = o.slice('https://'.length, -2);
    const bare = host.replace(/^\*\./, '');
    if (isFeedqlHost(bare)) continue;
    const covered = hostAllowed(rec.hosts, bare) || hostAllowed(rec.hosts, host);
    if (covered && !out.includes(o)) out.push(o);
  }
  return out;
}

/** Throws naming the first reason a recipe's hosts or permission origins are unacceptable (13.15). */
export function checkRecipeHosts(rec) {
  const hosts = rec?.hosts;
  if (!Array.isArray(hosts) || hosts.length < 1) throw new Error('recipe refused: hosts: at least one');
  if (hosts.length > MAX_HOSTS) throw new Error(`recipe refused: hosts: at most ${MAX_HOSTS} hosts`);
  for (const h of hosts) { const m = checkHostEntry(h); if (m) throw new Error(`recipe refused: ${m}`); }
  for (const o of rec.needs_permission_origins || []) {
    if (typeof o !== 'string' || !ORIGIN.test(o)) throw new Error(`recipe refused: permission origin ${JSON.stringify(o)} is not https://host/*`);
    const host = o.slice('https://'.length, -2);
    const m = checkHostEntry(host);
    if (m) throw new Error(`recipe refused: permission origin ${o}: ${m}`);
    if (!hostAllowed(hosts, host.replace(/^\*\./, '')) && !hostAllowed(hosts, host)) throw new Error(`recipe refused: permission origin ${o} is not covered by hosts`);
  }
}
