// One collection pass: tasks and recipes from feedql -> the generic executor fetches in the user's browser -> push to
// feedql, site by site, paced by each recipe. All site knowledge is in the recipe; nothing here names a site.
import { BATCH, SOFT_BACKOFF_MIN } from './config.js';
import * as api from './api.js';
import * as store from './store.js';
import { accessToken } from './auth.js';
import { readCookie } from './cookies.js';
import { syncHeaderRules } from './headers.js';
import { offscreenHtml, closeOffscreen } from './offscreen-client.js';
import { due, clampInterval, jitter, nextBackoff, chunk } from './pacing.js';
import { Session, runTask, Refusal, StepError } from './engine/exec.js';
import { TRANSFORMS, checkRecipe } from './engine/transforms.js';
import { permissionOrigins } from './engine/hosts.js';
import { Secrets, redactEntry } from './capture.js';

const RUN_LOCK_MS = 15 * 60 * 1000;

/** Keeps the worker alive across a long pause: any extension API call resets Chrome's 30 s idle timer. */
export async function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, Math.min(20_000, end - Date.now())));
    await chrome.storage.local.get('ping');
  }
}

/** Step variables survive a service-worker restart in session storage (X's home page is cached for 3 h). */
const sessionCache = {
  async get(key) { return (await chrome.storage.session.get(key))[key]; },
  async set(key, entry) {
    if (JSON.stringify(entry).length > 6_000_000) return;
    try { await chrome.storage.session.set({ [key]: entry }); } catch { /* quota: the in-memory copy still serves this run */ }
  },
};

/** The real world: chrome.* and fetch. Tests pass fakes with the same shape. */
export function liveDeps() {
  return {
    api, store,
    token: accessToken,
    now: () => new Date(),
    sleep,
    rnd: Math.random,
    cookie: readCookie,
    contains: (origins) => chrome.permissions.contains({ origins }),
    syncRules: syncHeaderRules,
    html: offscreenHtml,
    closeHtml: closeOffscreen,
    sessionStore: sessionCache,
    async fetch(req) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 60_000);
      try {
        // redirect: 'manual' - a redirect could carry a header value (a CSRF token) to a host the recipe did not name.
        const resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, credentials: req.omit ? 'omit' : 'include', redirect: 'manual', cache: 'no-store', signal: ctl.signal });
        if (resp.type === 'opaqueredirect') return { status: 0, headers: resp.headers, body: '', redirected: true };
        return { status: resp.status, headers: resp.headers, body: await resp.text() };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Recipe for a site: the one in the answer (cached by version), else the cached one with the same version. */
async function recipeFor(site, srv, deps, cache) {
  if (srv.recipe) {
    if (cache[site]?.version !== srv.recipe_version) cache[site] = { version: srv.recipe_version, recipe: srv.recipe };
    return srv.recipe;
  }
  if (cache[site] && cache[site].version === srv.recipe_version) return cache[site].recipe;
  return null;
}


async function runSite(site, srv, rec, session, ctx) {
  const { deps, settings } = ctx;
  const now = deps.now().getTime();
  const st0 = siteLocal(await deps.store.getState(), site);
  const pacing = rec.pacing;
  const tasks = (srv.tasks || []).slice(0, Math.max(1, rec.tasks?.per_run || 1));
  const env = {
    fetch: async (req) => {
      const out = await deps.fetch(req);
      if (settings.debug && ctx.shape) ctx.shape.push(redactEntry({ ...req, status: out.status, resp: out.body }, ctx.secrets));
      if (settings.debug && rec.items.source.includes(req.stepId) && out.status >= 200 && out.status < 300) await deps.store.saveRaw(site, out.body);
      return out;
    },
    cookie: async (name, host) => { const v = await deps.cookie(name, host); if (settings.debug) ctx.secrets.add(v); return v; },
    now: deps.now,
    transforms: TRANSFORMS,
    html: deps.html,
    pause: () => deps.sleep(jitter(pacing.min_gap_sec, pacing.max_gap_sec, deps.rnd) * 1000),
  };
  let accepted = 0, duplicates = 0, fetched = 0, okTasks = 0;
  let lastError = '';
  let refusal = null;
  const cursors = [];
  try {
    for (const [i, task] of tasks.entries()) {
      if (i > 0) await deps.sleep(jitter(pacing.min_gap_sec, pacing.max_gap_sec, deps.rnd) * 1000);
      try {
        const since = task.since ? new Date(task.since) : null;
        // The executor keeps page 1 on the newest; task.cursor only resumes an interrupted catch-up from page 2.
        const res = await runTask(session, rec, { query: task.query, max: task.max, since, pages: task.pages, cursor: task.cursor || '', catchup: !!task.catchup }, env);
        fetched += res.items.length;
        for (const part of chunk(res.items, BATCH)) {
          const r = await deps.api.pushItems(site, part.map((it) => ({ ...it, query: task.query })));
          accepted += r.accepted;
          duplicates += r.duplicates;
        }
        okTasks++;
        cursors.push(res.unfinished && res.nextCursor ? { id: task.id, cursor: res.nextCursor } : { id: task.id });
      } catch (e) {
        if (e instanceof Refusal) { refusal = e; break; }
        if (e instanceof api.SignedOutError) throw e;
        lastError = e instanceof StepError ? `${e.step}: ${e.msg}` : e.message;
      }
    }
  } finally {
    await deps.closeHtml?.();
  }
  const failed = !!refusal || (!okTasks && !!lastError);
  if (!failed) {
    await deps.store.patchSite(site, { lastRunAt: now, lastOk: true, lastCount: accepted, lastDuplicates: duplicates, lastFetched: fetched, lastError, failures: 0, backoffUntil: 0, pushedTotal: (st0.pushedTotal || 0) + accepted });
    await deps.api.reportStatus(site, { ok: true, count: accepted, tasks: cursors });
    return;
  }
  const failures = st0.failures + 1;
  let backoffUntil, error;
  if (refusal) {
    backoffUntil = nextBackoff(failures, now, refusal, pacing, deps.rnd);
    error = refusal.auth ? `not signed in to ${rec.label} (${refusal.status})` : `${rec.label} asked to slow down (${refusal.status})`;
  } else {
    backoffUntil = now + jitter(SOFT_BACKOFF_MIN.min, SOFT_BACKOFF_MIN.max, deps.rnd) * 60_000;
    error = lastError;
  }
  await deps.store.patchSite(site, { lastRunAt: now, lastOk: false, lastCount: accepted, lastDuplicates: duplicates, lastError: error, failures, backoffUntil });
  await deps.api.reportStatus(site, { ok: false, count: accepted, error: error.slice(0, 200), backoff_until: new Date(backoffUntil).toISOString() });
}

const siteLocal = (state, site) => store.siteState(state, site);

/** Remembers the server's site list for the popup (labels, hosts, permission origins, last synced). */
export async function cacheOffered(deps, server) {
  const sites = {};
  for (const [k, v] of Object.entries(server.sites)) {
    sites[k] = { enabled: v.enabled !== false, recipe_version: v.recipe_version, min_interval_sec: v.min_interval_sec, due: !!v.due, last_synced_at: v.last_synced_at || null };
  }
  await deps.store.saveOffered({ at: deps.now().getTime(), offered: server.offered, sites });
}

/**
 * force: "Run now" - ?force=1 and ignores the local interval, never the backoff. only: a site tag to run just that site.
 * Returns {ok}, {skipped} or {error}.
 */
export async function runAll({ force = false, only = null } = {}, deps = liveDeps()) {
  const st = await deps.store.getState();
  if (st.running && deps.now().getTime() - st.runningSince < RUN_LOCK_MS) return { skipped: 'busy' };
  if (!(await deps.token())) return { skipped: 'signed-out' };
  await deps.store.saveState({ ...st, running: true, runningSince: deps.now().getTime() });
  try {
    const settings = await deps.store.getSettings();
    const server = await deps.api.getTasks({ force });
    const recipes = await deps.store.getRecipes();
    const before = JSON.stringify(recipes);
    const active = [];
    const jobs = [];
    for (const [site, srv] of Object.entries(server.sites)) {
      if (srv.enabled === false) continue;
      const rec = await recipeFor(site, srv, deps, recipes);
      if (rec) { try { checkRecipe(rec); active.push(rec); jobs.push([site, srv, rec]); } catch (e) { await failSite(deps, site, e.message); } } else if ((srv.tasks || []).length) await failSite(deps, site, 'recipe missing from the answer');
    }
    for (const k of Object.keys(recipes)) if (!server.sites[k] || server.sites[k].enabled === false) delete recipes[k];
    if (JSON.stringify(recipes) !== before) await deps.store.saveRecipes(recipes);
    await cacheOffered(deps, server);
    await deps.syncRules(active);
    const session = new Session(deps.sessionStore);
    const secrets = new Secrets();
    const shape = [];
    for (const [site, srv, rec] of jobs) {
      if (only && site !== only) continue;
      if (!(srv.tasks || []).length) continue;
      const now = deps.now().getTime();
      const cur = siteLocal(await deps.store.getState(), site);
      const interval = clampInterval(srv.min_interval_sec, rec.pacing.min_interval_sec);
      const on = { ...cur, enabled: true };
      if (force ? on.backoffUntil > now : !due(on, now, interval)) continue;
      const origins = permissionOrigins(rec);
      if (origins.length && !(await deps.contains(origins))) {
        await failSite(deps, site, 'permission to read this site was not granted: switch it off and on again in the popup', { backoff: false });
        continue;
      }
      await runSite(site, srv, rec, session, { deps, settings, secrets, shape });
    }
    if (settings.debug && shape.length) await deps.store.saveShape?.({ at: deps.now().getTime(), requests: shape });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof api.SignedOutError ? 'signed-out' : e.message };
  } finally {
    const cur = await deps.store.getState();
    await deps.store.saveState({ ...cur, running: false, runningSince: 0 });
  }
}

async function failSite(deps, site, error, { backoff = true } = {}) {
  const now = deps.now().getTime();
  const st = siteLocal(await deps.store.getState(), site);
  await deps.store.patchSite(site, { lastRunAt: now, lastOk: false, lastError: error, failures: st.failures + (backoff ? 1 : 0), backoffUntil: backoff ? now + jitter(SOFT_BACKOFF_MIN.min, SOFT_BACKOFF_MIN.max, deps.rnd) * 60_000 : st.backoffUntil });
  await deps.api.reportStatus(site, { ok: false, count: 0, error: error.slice(0, 200) });
}
