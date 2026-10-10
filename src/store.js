// Small typed wrapper over chrome.storage.local. State is in storage, never in worker memory: MV3 workers die.
import { SITES } from './config.js';

const DEFAULT_SETTINGS = () => ({ sites: Object.fromEntries(SITES.map((s) => [s, { enabled: false }])), debug: false, lang: 'auto' });
const DEFAULT_SITE_STATE = () => ({ lastRunAt: 0, lastOk: null, lastCount: 0, lastDuplicates: 0, lastError: '', failures: 0, backoffUntil: 0, pushedTotal: 0 });

async function get(key, def) {
  const o = await chrome.storage.local.get(key);
  return o[key] ?? def;
}
const set = (key, value) => chrome.storage.local.set({ [key]: value });

export async function getSettings() {
  const s = await get('settings', null);
  const d = DEFAULT_SETTINGS();
  return { ...d, ...s, sites: { ...d.sites, ...(s?.sites || {}) } };
}
export const saveSettings = (s) => set('settings', s);

export async function getState() {
  const st = await get('state', {});
  const sites = {};
  for (const s of SITES) sites[s] = { ...DEFAULT_SITE_STATE(), ...(st.sites?.[s] || {}) };
  return { sites, running: !!st.running, runningSince: st.runningSince || 0 };
}
export const saveState = (st) => set('state', st);

export async function patchSite(site, patch) {
  const st = await getState();
  st.sites[site] = { ...st.sites[site], ...patch };
  await saveState(st);
  return st;
}

export const getAuth = () => get('auth', null);
export const saveAuth = (a) => set('auth', a);
export const clearAuth = () => chrome.storage.local.remove('auth');

export const getRaw = () => get('raw', {});
export async function saveRaw(site, text) {
  const raw = await getRaw();
  raw[site] = { at: Date.now(), body: text.slice(0, 1_500_000) };
  await set('raw', raw);
}
export const clearRaw = () => chrome.storage.local.remove('raw');
