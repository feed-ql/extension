// Host rules shared by the interpreter, the permission request and the header rules.

/** Whether host matches an entry of a recipe `hosts` list ("x.com" or "*.x.com"). */
export function hostAllowed(hosts, host) {
  host = String(host).toLowerCase();
  return (hosts || []).some((h) => h === host || (h.startsWith('*.') && host.endsWith(h.slice(1))));
}

/** One host is the other or a subdomain of the other. */
export function sameSite(a, b) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

const ORIGIN = /^https:\/\/(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?\/\*$/;

/** A host a recipe may never name: feedql itself (a recipe must not turn the extension against its own backend). */
export const isFeedqlHost = (h) => h === 'feedql.com' || h.endsWith('.feedql.com');

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
