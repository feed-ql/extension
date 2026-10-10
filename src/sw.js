// Service worker: wakes on an alarm (every 15-30 min, jittered; only while the browser is open), and on popup messages.
import { ALARM, TICK_MINUTES } from './config.js';
import { jitter } from './pacing.js';
import { runAll } from './runner.js';
import { signIn, signOut } from './auth.js';
import { getSettings, saveSettings, getState, getAuth, getRaw, clearRaw } from './store.js';
import { getServerStatus } from './api.js';

async function schedule() {
  await chrome.alarms.create(ALARM, { delayInMinutes: jitter(TICK_MINUTES.min, TICK_MINUTES.max) });
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== ALARM) return;
  await schedule(); // re-arm first: a crash in the run must not stop the cycle
  await runAll();
});

async function snapshot() {
  const [settings, state, auth] = await Promise.all([getSettings(), getState(), getAuth()]);
  return { settings, state, signedIn: !!auth };
}

const handlers = {
  state: snapshot,
  async signIn() { await signIn(); return snapshot(); },
  async signOut() { await signOut(); return snapshot(); },
  async toggle({ site, enabled }) {
    const s = await getSettings();
    s.sites[site] = { ...s.sites[site], enabled: !!enabled };
    await saveSettings(s);
    return snapshot();
  },
  async debug({ on }) {
    const s = await getSettings();
    s.debug = !!on;
    await saveSettings(s);
    if (!on) await clearRaw();
    return snapshot();
  },
  async lang({ lang }) {
    const s = await getSettings();
    s.lang = lang;
    await saveSettings(s);
    return snapshot();
  },
  async runNow() {
    runAll({ force: true }); // fire and forget: the popup watches state
    return snapshot();
  },
  async serverStatus() { return getServerStatus().catch(() => null); },
  raw: getRaw,
};

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  h(msg).then(send, (e) => send({ error: e.message }));
  return true;
});
