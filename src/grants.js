// What the person switched on. A site runs only when the person granted it on THIS install (popup switch, Chrome
// permission); nothing the server says (enabled flags, default_enabled, a new recipe) can turn a site on (Story 13.15).
// A grant is the footprint the person saw when they said yes; a recipe update that asks for more pauses the site until
// they approve ("Needs your OK"); one that asks for less runs and narrows the grant.
import { detailsOf, footprintOf, added, widens, narrows } from './engine/details.js';
import { permissionOrigins } from './engine/hosts.js';

/** What the person is shown for a site: the recipe when this install has it, else the server's `details` for the offer. */
export function detailsFor(offer, recipeEntry) {
  if (recipeEntry?.recipe) return detailsOf(recipeEntry.recipe);
  const d = offer?.details;
  if (d) return { hosts: d.hosts || [], cookies: d.cookies || [], pages: d.pages || [], sends: d.sends || [], about: d.about || {} };
  return { hosts: [...(offer?.hosts || [])].sort(), cookies: [], pages: [], sends: [], about: {}, unknown: true };
}

/** Makes the grant for a site the person just switched on. */
export async function grant(store, site, details, now) {
  const g = (await store.getGrants()) || {};
  g[site] = { at: now, fp: footprintOf(details) };
  await store.saveGrants(g);
  // Switching on is a fresh start the person asked for: a pause, error or interval left from an earlier run does not hold it.
  await store.patchSite(site, { backoffUntil: 0, failures: 0, lastError: '', lastRunAt: 0 });
}

export async function revoke(store, site) {
  const g = (await store.getGrants()) || {};
  delete g[site];
  await store.saveGrants(g);
  await store.patchSite(site, { needsOk: null });
}

/**
 * First start after an update from a build without grants: the sites that were on AND had Chrome access are adopted
 * with the recipe this install already holds (trust on first use, once). Returns the grants.
 */
export async function adoptLegacy(deps) {
  let g = await deps.store.getGrants();
  if (g) return g;
  g = {};
  const offered = (await deps.store.getOffered?.()) || null;
  const recipes = (await deps.store.getRecipes?.()) || {};
  for (const o of offered?.offered || []) {
    if (!offered.sites?.[o.site]?.enabled) continue;
    const origins = permissionOrigins(o);
    if (origins.length && !(await deps.contains(origins))) continue;
    g[o.site] = { at: deps.now().getTime(), fp: footprintOf(detailsFor(o, recipes[o.site])) };
  }
  await deps.store.saveGrants(g);
  return g;
}

/**
 * Decides a granted site's recipe: {ok:true} to run, or {ok:false, needsOk} when it asks for more than was granted.
 * Narrows the stored grant when the recipe asks for less, and clears an old pause when it no longer applies.
 */
export async function review(deps, site, rec, grants) {
  const d = detailsOf(rec);
  const g = grants[site];
  const add = added(g.fp, d);
  if (widens(add)) {
    const needsOk = { added: add, version: rec.version ?? 0, fp: footprintOf(d), origins: permissionOrigins(rec), at: deps.now().getTime() };
    await deps.store.patchSite(site, { needsOk });
    return { ok: false, needsOk };
  }
  if (narrows(g.fp, d)) { grants[site] = { ...g, fp: footprintOf(d) }; await deps.store.saveGrants(grants); }
  const cur = (await deps.store.getState()).sites[site];
  if (cur?.needsOk) await deps.store.patchSite(site, { needsOk: null });
  return { ok: true };
}

/** The person approved the widened recipe (the popup already asked Chrome for the new origins). */
export async function approve(deps, site) {
  const st = (await deps.store.getState()).sites[site];
  const n = st?.needsOk;
  if (!n) return false;
  if (n.origins?.length && !(await deps.contains(n.origins))) throw new Error('permission');
  const g = (await deps.store.getGrants()) || {};
  if (!g[site]) return false;
  g[site] = { at: deps.now().getTime(), fp: n.fp };
  await deps.store.saveGrants(g);
  await deps.store.patchSite(site, { needsOk: null, backoffUntil: 0 });
  return true;
}

/** How long a click on a switch waits for Chrome's access prompt to be answered. */
export const PENDING_MS = 10 * 60_000;

/**
 * Chrome's access prompt can close the popup before the click reaches the worker, so the popup records the click
 * first (pending) and the worker finishes it once Chrome holds the access. Returns {finish, drop}: sites to switch on
 * now, and sites whose click is too old to act on.
 */
export async function settlePending(pending, offers, contains, now) {
  const finish = [];
  const drop = [];
  for (const [site, at] of Object.entries(pending || {})) {
    const offer = offers.find((o) => o.site === site);
    if (!offer || now - at > PENDING_MS) { drop.push(site); continue; }
    const origins = permissionOrigins(offer);
    if (!origins.length || await contains(origins)) finish.push(site);
  }
  return { finish, drop };
}
