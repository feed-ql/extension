// The site list the popup shows. GET /ext/tasks leases tasks to this device and moves the query rotation, so opening
// the popup must never call it. The list comes from the read-only GET /ext/offered: when the cache is empty (fresh
// install) or older than OFFERED_TTL_MS. Per-site run info (recipe version, last synced) stays from the last run.
// Never throws.
import { OFFERED_TTL_MS } from './config.js';

export async function listOffered({ getOffered, saveOffered, api, now }, { force = false } = {}) {
  let cached = await getOffered();
  if (!cached || force || now() - cached.at > OFFERED_TTL_MS) {
    try {
      const offered = await api.getOffered();
      const sites = { ...(cached?.sites || {}) };
      for (const k of Object.keys(sites)) if (!offered.some((o) => o.site === k)) delete sites[k];
      for (const o of offered) sites[o.site] = { ...(sites[o.site] || {}), enabled: !!o.enabled };
      cached = { at: now(), offered, sites };
      await saveOffered(cached);
    } catch { /* offline or signed out: show the cache */ }
  }
  return cached;
}
