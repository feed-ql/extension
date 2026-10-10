// feedql ext API (Bearer token). Data in, data out: tasks are search queries, nothing executable.
import { EXT_API } from './config.js';
import { accessToken } from './auth.js';

export class SignedOutError extends Error {}

async function call(url, init = {}) {
  const tok = await accessToken();
  if (!tok) throw new SignedOutError('signed out');
  const resp = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${tok}`, 'content-type': 'application/json' } });
  if (resp.status === 401) throw new SignedOutError('feedql rejected the token');
  return resp;
}

export async function getTasks() {
  const r = await call(EXT_API.tasks);
  if (!r.ok) throw new Error(`tasks: HTTP ${r.status}`);
  return (await r.json()).sites || {};
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
