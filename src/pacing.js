// Pure scheduling helpers: jitter, backoff, who may run now. No chrome.* here, so node tests cover them.
// The numbers come from the recipe's `pacing` (docs/sources/extension-recipes.md section 6); these only apply them.

export function jitter(min, max, rnd = Math.random) {
  return Math.round(min + (max - min) * rnd());
}

/**
 * Next backoff after a refusal: base * 2^(failures-1), capped at max, raised to Retry-After / the reset time, +0..20%.
 * pacing: {backoff_base_sec, max_backoff_sec}. Returns the epoch ms until which the site stays paused.
 */
export function nextBackoff(failures, now, { retryAfterSec = 0, resetAtMs = 0 } = {}, pacing, rnd = Math.random) {
  const baseMs = (pacing?.backoff_base_sec || 1800) * 1000;
  const maxMs = (pacing?.max_backoff_sec || 43200) * 1000;
  const exp = Math.min(baseMs * 2 ** Math.max(0, Math.min(failures, 60) - 1), maxMs);
  const named = Math.max(retryAfterSec * 1000, resetAtMs ? resetAtMs - now : 0);
  const wait = Math.min(Math.max(exp, named), maxMs);
  return now + Math.round(wait * (1 + 0.2 * rnd()));
}

/** Whether a site may run now. st: {enabled, lastRunAt, backoffUntil}; minIntervalSec: the larger of server and recipe. */
export function due(st, now, minIntervalSec) {
  if (!st || !st.enabled) return false;
  if (st.backoffUntil && st.backoffUntil > now) return false;
  return !st.lastRunAt || now - st.lastRunAt >= minIntervalSec * 1000;
}

/** Server and recipe limits may only slow us down: the larger one wins. */
export function clampInterval(serverSec, recipeSec) {
  return Math.max(Number(serverSec) || 0, Number(recipeSec) || 0);
}

/** Chunks of at most n. */
export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
