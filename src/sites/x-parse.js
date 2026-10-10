// Pure parser for X GraphQL timeline responses (SearchTimeline, UserTweets). Port of walkTimeline/parseTweet in
// backend/internal/sources/collectors/x/xcli. Defensive: a missing field is skipped, never thrown.

const str = (o, k) => (o && typeof o[k] === 'string' ? o[k] : '');
const num = (o, k) => {
  const v = o && o[k];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseInt(v, 10) || 0;
  return 0;
};

export function tweetAuthor(m) {
  const res = m?.core?.user_results?.result;
  let screen = str(res?.legacy, 'screen_name');
  let name = str(res?.legacy, 'name');
  if (!screen) screen = str(res?.core, 'screen_name');
  if (!name) name = str(res?.core, 'name');
  return { screen, name };
}

export function parseTweet(m) {
  const id = str(m, 'rest_id');
  const legacy = m?.legacy;
  if (!id || !legacy || typeof legacy !== 'object') return null;
  const { screen, name } = tweetAuthor(m);
  const urls = [];
  for (const u of legacy.entities?.urls || []) {
    const e = str(u, 'expanded_url');
    if (e) urls.push(e);
  }
  // Long posts: the full text lives in note_tweet.
  const note = m.note_tweet?.note_tweet_results?.result?.text;
  return {
    id,
    author: screen,
    authorName: name,
    text: typeof note === 'string' && note ? note : str(legacy, 'full_text'),
    createdAt: str(legacy, 'created_at'),
    likes: num(legacy, 'favorite_count'),
    replies: num(legacy, 'reply_count'),
    retweets: num(legacy, 'retweet_count'),
    quotes: num(legacy, 'quote_count'),
    views: num(m.views, 'count'),
    isReply: !!str(legacy, 'in_reply_to_status_id_str'),
    isRetweet: 'retweeted_status_result' in legacy,
    lang: str(legacy, 'lang'),
    urls,
  };
}

/** Every Tweet node of a response; a tweet nested in another (retweet/quote) is not returned on its own. */
export function walkTimeline(v, out = []) {
  if (Array.isArray(v)) {
    for (const x of v) walkTimeline(x, out);
  } else if (v && typeof v === 'object') {
    if (v.__typename === 'Tweet') {
      const t = parseTweet(v);
      if (t) { out.push(t); return out; }
    }
    for (const k of Object.keys(v)) walkTimeline(v[k], out);
  }
  return out;
}

const OWN = /^https?:\/\/((www|mobile)\.)?(x|twitter)\.com\//i;
const SHORT = /^https?:\/\/t\.co\//i;

/** Ext item for the feedql contract, or null for what must be dropped (retweets, plain replies, no text). */
export function toItem(t, query) {
  if (!t || t.isRetweet || t.isReply || !t.text || !t.author) return null;
  const status = `https://x.com/${t.author}/status/${t.id}`;
  const published = Date.parse(t.createdAt);
  if (Number.isNaN(published)) return null;
  const link = t.urls.find((u) => !OWN.test(u) && !SHORT.test(u));
  const item = {
    external_id: t.id,
    // A post with an outbound link is that page (same article from other sources dedupes), as in the server collector.
    url: link || status,
    text: link ? `${t.text}\n\nDiscussion: ${status}` : t.text,
    author: t.authorName ? `${t.authorName} (@${t.author})` : `@${t.author}`,
    author_url: `https://x.com/${t.author}`,
    published_at: new Date(published).toISOString(),
    metrics: { likes: t.likes, reposts: t.retweets, replies: t.replies },
  };
  if (t.lang && t.lang !== 'und') item.lang = t.lang;
  if (query) item.query = query;
  return item;
}

export function parseSearch(json, query, max = 20) {
  const seen = new Set();
  const items = [];
  for (const t of walkTimeline(json)) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const it = toItem(t, query);
    if (it) items.push(it);
    if (items.length >= max) break;
  }
  return items;
}
