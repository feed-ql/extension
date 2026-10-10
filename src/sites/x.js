// X collector: SearchTimeline through the internal GraphQL the web app uses, with the user's own session.
// The extension never reads cookie values except ct0 (X's CSRF double-submit token), which is copied into the
// x-csrf-token header of the one request and never stored or sent anywhere but x.com.
import { RefusedError } from '../pacing.js';
import { buildState, onDemandUrl, transactionId } from '../xct.js';
import { parseSearch } from './x-parse.js';

const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
export const SEARCH_PATH = '/i/api/graphql/099UqLkXma7fhT81Jv4n9g/SearchTimeline';

export const FEATURES = {
  rweb_video_screen_enabled: false, rweb_cashtags_enabled: true, profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false, rweb_tipjar_consumption_enabled: false, verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true, responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false, premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true, c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false, responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true, responsive_web_jetfuel_frame: true, responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true, articles_preview_enabled: true, responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false, graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true, longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true, content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true, responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true, post_ctas_fetch_enabled: true, freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true, tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true, longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true, responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true, responsive_web_enhance_cards_enabled: false,
};

export function searchUrl(query, count) {
  const vars = {
    rawQuery: query, count, querySource: 'typed_query', product: 'Top',
    withGrokTranslatedBio: false, withQuickPromoteEligibilityTweetFields: false,
  };
  const q = new URLSearchParams({ variables: JSON.stringify(vars), features: JSON.stringify(FEATURES) });
  return `https://x.com${SEARCH_PATH}?${q}`;
}

/** Turns a failed response into a RefusedError (rate limit, auth) or a plain Error (query id rotated, other). */
export function refusal(resp) {
  const reset = Number(resp.headers.get('x-rate-limit-reset'));
  const opts = { resetAtMs: reset > 0 ? reset * 1000 : 0, retryAfterSec: Number(resp.headers.get('retry-after')) || 0 };
  if ([401, 403, 420, 429, 226].includes(resp.status)) return new RefusedError('x', resp.status, opts);
  if (resp.status === 404) return new Error('x: SearchTimeline answered 404 (query id rotated or transaction id rejected)');
  return new Error(`x: HTTP ${resp.status}`);
}

let xctCache = null; // { state, at }
const XCT_TTL = 3 * 60 * 60 * 1000;

async function xctState(fetchFn) {
  if (xctCache && Date.now() - xctCache.at < XCT_TTL) return xctCache.state;
  const home = await (await fetchFn('https://x.com/home', { credentials: 'include' })).text();
  const js = onDemandUrl(home);
  if (!js) throw new Error('x: not signed in on x.com (no chunk map on /home)');
  const script = await (await fetchFn(js)).text();
  const state = buildState(home, script);
  xctCache = { state, at: Date.now() };
  return state;
}

/**
 * Runs one search. deps: { ct0(): Promise<string>, fetch, onRaw(text) } so the service worker supplies the cookie
 * read and the debug capture; tests inject fakes.
 */
export async function search(query, max, deps) {
  const fetchFn = deps.fetch || fetch;
  const ct0 = await deps.ct0();
  if (!ct0) throw new RefusedError('x', 401);
  const state = await xctState(fetchFn);
  const xct = await transactionId(state, 'GET', SEARCH_PATH);
  const resp = await fetchFn(searchUrl(query, Math.min(40, max * 2)), {
    credentials: 'include',
    headers: {
      authorization: `Bearer ${BEARER}`,
      'content-type': 'application/json',
      'x-csrf-token': ct0,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
      'x-client-transaction-id': xct,
    },
  });
  if (!resp.ok) throw refusal(resp);
  const text = await resp.text();
  if (deps.onRaw) await deps.onRaw(text);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('x: response is not JSON'); }
  return parseSearch(json, query, max);
}

export function resetXct() { xctCache = null; }
