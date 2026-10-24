// Service worker: wakes on an alarm (every 15-30 min, jittered; only while the browser is open), at browser start and
// install (run what is due now), and on popup messages.
import { ALARM, TICK_MINUTES, OFFERED_TTL_MS } from './config.js';
import { jitter } from './pacing.js';
import { runAll } from './runner.js';
import { listOffered } from './offered.js';
import { signIn, signOut } from './auth.js';
import * as store from './store.js';
import { getSettings, saveSettings, getState, getAuth, getRaw, clearRaw, getOffered, saveOffered, getRecipes, getShape, clearShape, getResults, saveResults, getGrants } from './store.js';
import { detailsFor, grant, revoke, approve } from './grants.js';
import * as api from './api.js';
import { permissionOrigins } from './engine/hosts.js';
import { syncHeaderRules } from './headers.js';

async function schedule() {
  await chrome.alarms.create(ALARM, { delayInMinutes: jitter(TICK_MINUTES.min, TICK_MINUTES.max) });
}
const ensureAlarm = async () => { if (!(await chrome.alarms.get(ALARM))) await schedule(); };

chrome.runtime.onInstalled.addListener(async () => { await schedule(); runAll(); });
chrome.runtime.onStartup.addListener(async () => { await schedule(); runAll(); });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== ALARM) return;
  await schedule(); // re-arm first: a crash in the run must not stop the cycle
  await runAll();
});
ensureAlarm();

const offeredList = (o) => listOffered({ getOffered, saveOffered, api, now: Date.now }, o);

async function snapshot() {
  const [settings, state, auth] = await Promise.all([getSettings(), getState(), getAuth()]);
  const offered = auth ? await offeredList() : null;
  // Details per site (what it reads, before and after switching it on) and what the person has switched on here.
  const recipes = await getRecipes();
  const grants = (await getGrants()) || {};
  const details = {};
  for (const o of offered?.offered || []) details[o.site] = detailsFor(o, grants[o.site] ? recipes[o.site] : null);
  return { settings, state, signedIn: !!auth, offered, results: await getResults(), grants, details };
}

/** Origins other enabled sites still need (so switching one off does not revoke what another uses). */
async function neededByOthers(except, cached) {
  const keep = new Set();
  const grants = (await getGrants()) || {};
  for (const o of cached?.offered || []) {
    if (o.site !== except && grants[o.site]) for (const x of permissionOrigins(o)) keep.add(x);
  }
  return keep;
}

const handlers = {
  state: snapshot,
  async signIn() { await signIn(); await offeredList({ force: true }); runAll(); return snapshot(); },
  async signOut() { await signOut(); return snapshot(); },
  /** The popup has already asked Chrome for the origins (that needs its click). Here: tell the server, tidy up. */
  async toggle({ site, enabled }) {
    const cached = await offeredList();
    const offer = (cached?.offered || []).find((o) => o.site === site);
    if (!offer) throw new Error('unknown site');
    const origins = permissionOrigins(offer);
    if (enabled && origins.length && !(await chrome.permissions.contains({ origins }))) throw new Error('permission');
    // The local switch is the only thing that starts a site: grant (or revoke) here first, then tell the server.
    if (enabled) {
      const recipes = await getRecipes();
      await grant(store, site, detailsFor(offer, recipes[site]), Date.now());
      // Switching on is a fresh start the person asked for: a pause or error left from an earlier run does not hold it.
      await store.patchSite(site, { backoffUntil: 0, failures: 0, lastError: '', lastRunAt: 0 });
    } else await revoke(store, site);
    await api.setSite(site, enabled);
    cached.sites[site] = { ...(cached.sites[site] || {}), enabled: !!enabled };
    cached.offered = cached.offered.map((o) => (o.site === site ? { ...o, enabled: !!enabled } : o));
    await saveOffered(cached);
    if (!enabled) {
      const keep = await neededByOthers(site, cached);
      const drop = origins.filter((o) => !keep.has(o));
      if (drop.length) await chrome.permissions.remove({ origins: drop }).catch(() => {});
      const recipes = await getRecipes();
      const grants = (await getGrants()) || {};
      await syncHeaderRules(Object.entries(recipes).filter(([s]) => s !== site && grants[s]).map(([, v]) => v.recipe));
    } else {
      runAll({ only: site });
    }
    return snapshot();
  },
  /** The person approved a recipe that asks for more; the popup has already asked Chrome for the new origins. */
  async approve({ site }) {
    const ok = await approve({ store, contains: (origins) => chrome.permissions.contains({ origins }), now: () => new Date() }, site);
    if (!ok) throw new Error('nothing to approve');
    runAll({ only: site });
    return snapshot();
  },
  async debug({ on }) {
    const s = await getSettings();
    s.debug = !!on;
    await saveSettings(s);
    if (!on) { await clearRaw(); await clearShape(); }
    return snapshot();
  },
  async lang({ lang }) {
    const s = await getSettings();
    s.lang = lang;
    await saveSettings(s);
    return snapshot();
  },
  async runNow() {
    // The pass records its outcome per site in storage ('results'); the popup watches it. Written first so the popup
    // never shows a stale outcome while the worker wakes up.
    await saveResults({ at: Date.now(), done: false, sites: {} });
    runAll({ force: true }).catch((e) => saveResults({ at: Date.now(), done: true, general: e.message, sites: {} }));
    return snapshot();
  },
  async serverStatus() { return api.getServerStatus().catch(() => null); },
  raw: getRaw,
  shape: getShape,
};

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  h(msg).then(send, (e) => send({ error: e.message }));
  return true;
});
