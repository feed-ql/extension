// LinkedIn collector: Voyager content search, the API the logged-in web app itself calls, with the user's own session.
// csrf-token must equal the JSESSIONID cookie; it is read for the one request and never stored, logged or uploaded.
import { RefusedError } from '../pacing.js';
import { parseSearch } from './linkedin-parse.js';

// Query ids and decoration ids rotate with LinkedIn deploys; both are tried, newest first.
export const GRAPHQL_QUERY_ID = 'voyagerSearchDashClusters.b0928897b71bd00a5a7291755dcd64f0';
export const REST_DECORATION = 'com.linkedin.voyager.dash.deco.search.SearchClusterCollection-186';

// Rest.li wants ( ) , : ' and ! literal as syntax, so inside values they must be percent-encoded.
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function graphqlUrl(keywords, start, count) {
  const vars = `(start:${start},count:${count},origin:GLOBAL_SEARCH_HEADER,query:(keywords:${enc(keywords)},flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:resultType,value:List(CONTENT)),(key:sortBy,value:List(date_posted))),includeFiltersInResponse:false))`;
  return `https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=${vars}&queryId=${GRAPHQL_QUERY_ID}`;
}

export function restUrl(keywords, start, count) {
  const query = `(keywords:${enc(keywords)},flagshipSearchIntent:SEARCH_SRP,queryParameters:(resultType:List(CONTENT),sortBy:List(date_posted)),includeFiltersInResponse:false)`;
  return `https://www.linkedin.com/voyager/api/search/dash/clusters?decorationId=${REST_DECORATION}&origin=GLOBAL_SEARCH_HEADER&q=all&query=${query}&start=${start}&count=${count}`;
}

/** 999 is LinkedIn's "we think you are a bot" status; 429 a rate limit; 401/403 a signed-out or checkpointed session. */
export function refusal(resp) {
  if ([999, 429, 401, 403].includes(resp.status)) {
    return new RefusedError('linkedin', resp.status, { retryAfterSec: Number(resp.headers.get('retry-after')) || 0 });
  }
  return new Error(`linkedin: HTTP ${resp.status}`);
}

function headers(csrf) {
  return {
    accept: 'application/vnd.linkedin.normalized+json+2.1',
    'csrf-token': csrf,
    'x-restli-protocol-version': '2.0.0',
    'x-li-lang': 'en_US',
  };
}

/** deps: { jsessionid(): Promise<string>, fetch, onRaw(text) }. */
export async function search(keywords, max, deps) {
  const fetchFn = deps.fetch || fetch;
  const csrf = (await deps.jsessionid() || '').replace(/^"|"$/g, '');
  if (!csrf) throw new RefusedError('linkedin', 401);
  let resp = await fetchFn(graphqlUrl(keywords, 0, Math.min(max, 10)), { credentials: 'include', headers: headers(csrf) });
  if (resp.status === 400 || resp.status === 404 || resp.status === 500) {
    resp = await fetchFn(restUrl(keywords, 0, Math.min(max, 10)), { credentials: 'include', headers: headers(csrf) });
  }
  if (!resp.ok) throw refusal(resp);
  const body = await resp.text();
  if (deps.onRaw) await deps.onRaw(body);
  let json;
  try { json = JSON.parse(body); } catch { throw new Error('linkedin: response is not JSON'); }
  return parseSearch(json, keywords, max);
}
