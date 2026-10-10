// One collection pass: tasks from feedql -> fetch in the user's browser -> push to feedql, site by site, paced.
import { SITES, PACING, BATCH } from './config.js';
import { getSettings, getState, saveState, patchSite, saveRaw } from './store.js';
import { getTasks, pushItems, reportStatus, SignedOutError } from './api.js';
import { accessToken } from './auth.js';
import { due, clampInterval, jitter, nextBackoff, chunk, RefusedError } from './pacing.js';
import * as x from './sites/x.js';
import * as linkedin from './sites/linkedin.js';
import { xCt0, linkedinJsessionid } from './cookies.js';

const RUN_LOCK_MS = 15 * 60 * 1000;

/** Keeps the worker alive across a long pause: any extension API call resets Chrome's 30 s idle timer. */
export async function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, Math.min(20_000, end - Date.now())));
    await chrome.storage.local.get('ping');
  }
}

const NOISE = '-filter:retweets -filter:replies';
export const xQuery = (q) => (/-filter:/.test(q) ? q : `${q} ${NOISE}`);

function collectors(settings) {
  const onRaw = (site) => (settings.debug ? (t) => saveRaw(site, t) : undefined);
  return {
    x: (task) => x.search(xQuery(task.query), Math.min(task.max || 20, PACING.x.maxPerTask), { ct0: xCt0, onRaw: onRaw('x') }),
    linkedin: (task) => linkedin.search(task.query, Math.min(task.max || 10, PACING.linkedin.maxPerTask), { jsessionid: linkedinJsessionid, onRaw: onRaw('linkedin') }),
  };
}

async function runSite(site, siteTasks, run, now) {
  const st0 = (await getState()).sites[site];
  const tasks = (siteTasks.tasks || []).slice(0, PACING[site].maxTasksPerRun);
  let accepted = 0, duplicates = 0, fetched = 0;
  try {
    for (const [i, task] of tasks.entries()) {
      if (i > 0) await sleep(jitter(...PACING[site].gapMs));
      const items = await run(task);
      fetched += items.length;
      for (const part of chunk(items, BATCH)) {
        const r = await pushItems(site, part);
        accepted += r.accepted;
        duplicates += r.duplicates;
      }
    }
    await patchSite(site, { lastRunAt: now, lastOk: true, lastCount: accepted, lastDuplicates: duplicates, lastFetched: fetched, lastError: '', failures: 0, backoffUntil: 0, pushedTotal: (st0.pushedTotal || 0) + accepted });
    await reportStatus(site, { ok: true, count: accepted });
  } catch (e) {
    if (e instanceof SignedOutError) throw e;
    const refused = e instanceof RefusedError;
    const failures = st0.failures + 1;
    const backoffUntil = refused ? nextBackoff(failures, now, e) : now + jitter(10, 20) * 60_000;
    const error = refused ? (e.auth ? `not signed in to ${site} (${e.status})` : `${site} asked to slow down (${e.status})`) : e.message;
    await patchSite(site, { lastRunAt: now, lastOk: false, lastCount: accepted, lastError: error, failures, backoffUntil });
    await reportStatus(site, { ok: false, count: accepted, error, backoff_until: new Date(backoffUntil).toISOString() });
  }
}

/** force: "Run now" - ignores the interval, never the backoff. Returns false when nothing could run. */
export async function runAll({ force = false } = {}) {
  const st = await getState();
  if (st.running && Date.now() - st.runningSince < RUN_LOCK_MS) return { skipped: 'busy' };
  if (!(await accessToken())) return { skipped: 'signed-out' };
  await saveState({ ...st, running: true, runningSince: Date.now() });
  try {
    const settings = await getSettings();
    const server = await getTasks();
    const run = collectors(settings);
    for (const site of SITES) {
      const now = Date.now();
      const cur = (await getState()).sites[site];
      const srv = server[site];
      if (!srv || srv.enabled === false || !(srv.tasks || []).length) continue;
      const interval = clampInterval(srv.min_interval_sec, PACING[site].minIntervalSec);
      const on = { ...cur, enabled: settings.sites[site].enabled };
      if (force ? !on.enabled || on.backoffUntil > now : !due(on, now, interval)) continue;
      await runSite(site, srv, run[site], now);
    }
    return { ok: true };
  } catch (e) {
    return { error: e instanceof SignedOutError ? 'signed-out' : e.message };
  } finally {
    const cur = await getState();
    await saveState({ ...cur, running: false, runningSince: 0 });
  }
}
