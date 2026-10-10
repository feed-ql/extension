// Small typed wrapper over chrome.storage.local. State is in storage, never in worker memory: MV3 workers die.
// Keys: settings (debug, lang), state (per-site local run state + the run lock), offered (the server's site list),
// recipes (cached by recipe_version), device (this install's id), auth (feedql tokens), raw (debug captures).

const DEFAULT_SETTINGS = () => ({ debug: false, lang: 'auto' });
export const DEFAULT_SITE_STATE = () => ({ lastRunAt: 0, lastOk: null, lastCount: 0, lastDuplicates: 0, lastFetched: 0, lastError: '', failures: 0, backoffUntil: 0, pushedTotal: 0 });

async function get(key, def) {
  const o = await chrome.storage.local.get(key);
  return o[key] ?? def;
}
const set = (key, value) => chrome.storage.local.set({ [key]: value });

export async function getSettings() {
  return { ...DEFAULT_SETTINGS(), ...(await get('settings', null)) };
}
export const saveSettings = (s) => set('settings', { debug: !!s.debug, lang: s.lang });

export async function getState() {
  const st = await get('state', {});
  const sites = {};
  for (const [k, v] of Object.entries(st.sites || {})) sites[k] = { ...DEFAULT_SITE_STATE(), ...v };
  return { sites, running: !!st.running, runningSince: st.runningSince || 0 };
}
export const saveState = (st) => set('state', st);
export const siteState = (state, site) => state.sites[site] || DEFAULT_SITE_STATE();

export async function patchSite(site, patch) {
  const st = await getState();
  st.sites[site] = { ...siteState(st, site), ...patch };
  await saveState(st);
  return st;
}

/** {at, offered: [...], sites: {site: {...}}} - the last GET /ext/tasks, minus tasks and recipes. */
export const getOffered = () => get('offered', null);
export const saveOffered = (o) => set('offered', o);

/** {site: {version, recipe}} - recipes cached by recipe_version. */
export const getRecipes = () => get('recipes', {});
export const saveRecipes = (r) => set('recipes', r);

/** This install's id for the X-Ext-Device header: generated once, random, carries nothing about the person. */
export async function deviceId() {
  let d = await get('device', '');
  if (!/^[a-f0-9]{32}$/.test(d)) {
    d = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await set('device', d);
  }
  return d;
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
