// The site list the popup shows. GET /ext/tasks leases tasks to this device and moves the query rotation, so opening
// the popup must never call it: the list is the cache that runs fill. When the cache is older than OFFERED_TTL_MS,
// labels and on/off are refreshed read-only from GET /ext/status. Never throws.
import { OFFERED_TTL_MS } from './config.js';

export async function listOffered({ getOffered, saveOffered, api, now }, { force = false } = {}) {
  let cached = await getOffered();
  if (cached && (force || now() - cached.at > OFFERED_TTL_MS)) {
    try {
      const st = await api.getSiteStates();
      cached = {
        ...cached, at: now(),
        offered: cached.offered.filter((o) => st[o.site]).map((o) => ({ ...o, label: st[o.site].label || o.label, enabled: !!st[o.site].enabled })),
      };
      for (const [k, v] of Object.entries(cached.sites || {})) if (st[k]) v.enabled = !!st[k].enabled;
      await saveOffered(cached);
    } catch { /* offline or signed out: show the cache */ }
  }
  return cached;
}
