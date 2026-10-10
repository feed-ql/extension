// Everything that names a host, a path or a limit lives here.
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
};
export const SITES = ['x', 'linkedin'];

export const ALARM = 'feedql-tick';
export const TICK_MINUTES = { min: 15, max: 30 };

// Conservative defaults; the server's tasks response may only make them slower, never faster.
export const PACING = {
  x: { minIntervalSec: 900, gapMs: [20000, 35000], maxTasksPerRun: 3, maxPerTask: 20 },
  linkedin: { minIntervalSec: 1800, gapMs: [45000, 90000], maxTasksPerRun: 2, maxPerTask: 10 },
};
export const BACKOFF = {
  baseMs: 30 * 60 * 1000,
  maxMs: 12 * 60 * 60 * 1000,
};
export const BATCH = 50;
