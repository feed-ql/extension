// Pure scheduling helpers: jitter, backoff, who may run now. No chrome.* here, so node tests cover them.
import { BACKOFF } from './config.js';

export function jitter(min, max, rnd = Math.random) {
  return Math.round(min + (max - min) * rnd());
}

/** Next backoff after a refusal: doubles per consecutive failure, honours Retry-After / reset, capped. */
export function nextBackoff(failures, now, { retryAfterSec = 0, resetAtMs = 0 } = {}, rnd = Math.random) {
  const exp = Math.min(BACKOFF.baseMs * 2 ** Math.max(0, failures - 1), BACKOFF.maxMs);
  const named = Math.max(retryAfterSec * 1000, resetAtMs ? resetAtMs - now : 0);
  const wait = Math.min(Math.max(exp, named), BACKOFF.maxMs);
  return now + Math.round(wait * (1 + 0.2 * rnd()));
}

/** Whether a site may run now. st: {enabled, lastRunAt, backoffUntil}; minIntervalSec comes from the server. */
export function due(st, now, minIntervalSec) {
  if (!st || !st.enabled) return false;
  if (st.backoffUntil && st.backoffUntil > now) return false;
  return !st.lastRunAt || now - st.lastRunAt >= minIntervalSec * 1000;
}

/** Server limits may only slow us down. */
export function clampInterval(serverSec, defaultSec) {
  return Math.max(Number(serverSec) || 0, defaultSec);
}

/** Chunks of at most n. */
export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** A refusal that must stop the whole site for a while (never retried in the same run). */
export class RefusedError extends Error {
  constructor(site, status, opts = {}) {
    super(`${site} answered ${status}`);
    this.site = site;
    this.status = status;
    this.retryAfterSec = opts.retryAfterSec || 0;
    this.resetAtMs = opts.resetAtMs || 0;
    this.auth = status === 401 || status === 403;
  }
}
