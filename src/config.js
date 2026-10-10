// Everything that names a feedql host or a limit of the extension itself lives here. Which OTHER sites are fetched,
// and how (hosts, paths, pacing), is decided by the server's recipes, never by this file.
export const EXTENSION_ID = 'plhenichcpggbflpgkalannbmfjhbmpd';
export const API_BASE = 'https://api.feedql.com';
export const OAUTH = {
  clientId: 'feedql-extension',
  authorize: 'https://app.feedql.com/oauth/authorize',
  token: `${API_BASE}/oauth/token`,
  scope: 'ext',
};
export const EXT_API = {
  items: `${API_BASE}/api/v1/ext/items`,
  tasks: `${API_BASE}/api/v1/ext/tasks`,
  status: `${API_BASE}/api/v1/ext/status`,
  offered: `${API_BASE}/api/v1/ext/offered`,
  sites: `${API_BASE}/api/v1/ext/sites`,
};
export const DEVICE_HEADER = 'X-Ext-Device';

export const ALARM = 'feedql-tick';
export const TICK_MINUTES = { min: 15, max: 30 };

/** How long a cached list of offered sites is trusted before the popup asks the server again. */
export const OFFERED_TTL_MS = 6 * 60 * 60 * 1000;
/** A failed run that is not a refusal pauses its site for this long (minutes, jittered). */
export const SOFT_BACKOFF_MIN = { min: 10, max: 20 };
export const BATCH = 50;
