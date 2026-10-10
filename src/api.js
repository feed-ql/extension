// feedql ext API (Bearer token, X-Ext-Device). Data in, data out: the server hands out recipes (declarative data) and
// search tasks; nothing executable.
import { EXT_API, DEVICE_HEADER } from './config.js';
import { accessToken } from './auth.js';
import { deviceId } from './store.js';

export class SignedOutError extends Error {}

async function call(url, init = {}) {
  const tok = await accessToken();
  if (!tok) throw new SignedOutError('signed out');
  const resp = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), authorization: `Bearer ${tok}`, 'content-type': 'application/json', [DEVICE_HEADER]: await deviceId() },
  });
  if (resp.status === 401) throw new SignedOutError('feedql rejected the token');
  return resp;
}

/** {sites: {site: {enabled, recipe?, recipe_version, min_interval_sec, due, tasks, last_synced_at}}, offered: [...]}. */
export async function getTasks({ force = false } = {}) {
  const r = await call(force ? `${EXT_API.tasks}?force=1` : EXT_API.tasks);
  if (!r.ok) throw new Error(`tasks: HTTP ${r.status}`);
  const b = await r.json();
  return { sites: b.sites || {}, offered: b.offered || [] };
}

export async function setSite(site, enabled) {
  const r = await call(EXT_API.sites, { method: 'PUT', body: JSON.stringify({ site, enabled: !!enabled }) });
  if (!r.ok) throw new Error(`sites: HTTP ${r.status}`);
}

export async function pushItems(site, items) {
  const r = await call(EXT_API.items, { method: 'POST', body: JSON.stringify({ site, items }) });
  if (r.status === 429) throw new Error('feedql rate limit, will retry next run');
  if (!r.ok) throw new Error(`items: HTTP ${r.status}`);
  const b = await r.json();
  return { accepted: b.accepted | 0, duplicates: b.duplicates | 0, rejected: b.rejected || [] };
}

export async function reportStatus(site, body) {
  try {
    await call(EXT_API.status, { method: 'POST', body: JSON.stringify({ site, ...body }) });
  } catch { /* status is best-effort */ }
}

export async function getServerStatus() {
  const r = await call(EXT_API.status);
  return r.ok ? r.json() : null;
}
