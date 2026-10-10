// Debug "Capture request shape": per request of the last run - URL, method, request headers, body, status, response
// body - kept on this device and saved by the person as one JSON file. Never uploaded. Anything that is, or was
// derived from, a cookie is removed first: by header name and by value (the cookie values read for the run, in raw,
// URL-encoded and decoded form, wherever they turn up - header, URL, request body, response body).
export const MAX_BODY = 200 * 1024;
const DROP_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization', 'x-csrf-token', 'csrf-token', 'x-xsrf-token']);
export const MARK = '[redacted]';

/** Collects the cookie values read during a run. */
export class Secrets {
  constructor() { this.values = new Set(); }
  add(v) { if (typeof v === 'string' && v) this.values.add(v); }
  /** Every spelling of every value that could show up in a request or response. */
  forms() {
    const out = new Set();
    for (const v of this.values) {
      out.add(v);
      out.add(encodeURIComponent(v));
      out.add(encodeURI(v));
      try { out.add(decodeURIComponent(v)); } catch { /* not percent-encoded */ }
      out.add(v.replace(/^"|"$/g, ''));
      out.add(JSON.stringify(v).slice(1, -1));
    }
    out.delete('');
    return [...out].sort((a, b) => b.length - a.length);
  }
}

export function scrub(text, forms) {
  let s = String(text ?? '');
  for (const f of forms) if (s.includes(f)) s = s.split(f).join(MARK);
  return s;
}

function cut(s) { return s.length > MAX_BODY ? `${s.slice(0, MAX_BODY)}\n[truncated: ${s.length - MAX_BODY} more characters]` : s; }

function headerPairs(h) {
  if (!h) return [];
  if (typeof h.entries === 'function') return [...h.entries()];
  return Object.entries(h);
}

/** One captured request; redaction happens here, so nothing unredacted is ever stored. */
export function redactEntry({ stepId, method, url, headers, body, status, resp }, secrets) {
  const forms = secrets.forms();
  const rh = {};
  for (const [k, v] of headerPairs(headers)) {
    if (DROP_HEADERS.has(k.toLowerCase())) continue;
    const val = String(v);
    if (forms.some((f) => val.includes(f))) continue; // a header carrying a cookie-derived value: dropped whole
    rh[k] = val;
  }
  return {
    stepId: stepId || '',
    method: method || 'GET',
    url: scrub(url, forms),
    requestHeaders: rh,
    requestBody: body == null ? null : cut(scrub(body, forms)),
    status,
    responseBody: cut(scrub(resp ?? '', forms)),
  };
}
