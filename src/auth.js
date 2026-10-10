// Sign in to feedql: OAuth 2.1 authorization code + PKCE (S256) through chrome.identity.launchWebAuthFlow.
// The extension holds only feedql's own tokens; it never sees or stores a LinkedIn / X credential.
import { OAUTH } from './config.js';
import { getAuth, saveAuth, clearAuth } from './store.js';

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function challengeOf(verifier) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function authorizeUrl({ redirect, state, challenge }) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: OAUTH.clientId, redirect_uri: redirect, scope: OAUTH.scope,
    state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return `${OAUTH.authorize}?${q}`;
}

async function tokenCall(params) {
  const resp = await fetch(OAUTH.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: OAUTH.clientId, ...params }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body.access_token) {
    const e = new Error(body.error_description || body.error || `token endpoint ${resp.status}`);
    e.invalidGrant = body.error === 'invalid_grant';
    throw e;
  }
  return {
    access: body.access_token,
    refresh: body.refresh_token || '',
    exp: Date.now() + (Number(body.expires_in) || 3600) * 1000,
  };
}

export async function signIn() {
  const verifier = rand(48);
  const state = rand(16);
  const redirect = chrome.identity.getRedirectURL();
  const url = authorizeUrl({ redirect, state, challenge: await challengeOf(verifier) });
  const back = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  const u = new URL(back);
  if (u.searchParams.get('state') !== state) throw new Error('state mismatch');
  if (u.searchParams.get('error')) throw new Error(u.searchParams.get('error_description') || u.searchParams.get('error'));
  const code = u.searchParams.get('code');
  if (!code) throw new Error('no code in the redirect');
  const tok = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier });
  await saveAuth(tok);
  return tok;
}

export async function signOut() {
  await clearAuth();
}

let refreshing = null;
/** A valid access token, refreshing (rotating refresh token) when it is about to expire. null when signed out. */
export async function accessToken() {
  const a = await getAuth();
  if (!a) return null;
  if (a.exp - Date.now() > 60_000) return a.access;
  if (!a.refresh) { await clearAuth(); return null; }
  refreshing ||= tokenCall({ grant_type: 'refresh_token', refresh_token: a.refresh })
    .then(async (t) => { await saveAuth({ ...t, refresh: t.refresh || a.refresh }); return t; })
    .finally(() => { refreshing = null; });
  try {
    return (await refreshing).access;
  } catch (e) {
    if (e.invalidGrant) await clearAuth();
    return null;
  }
}
