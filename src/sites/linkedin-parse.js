// Pure parser for LinkedIn Voyager content-search responses (normalized JSON: { data, included: [...] }).
// Written against the shape documented by open-source Voyager clients; NOT verified against a live session by the
// author. It is deliberately shape-tolerant: it looks for feed Update entities by what they contain, not by $type.

const ACTIVITY = /urn:li:(?:activity|ugcPost|share):(\d{10,25})/;

const text = (v) => (v && typeof v.text === 'string' ? v.text : v && v.text && typeof v.text.text === 'string' ? v.text.text : '');

/** LinkedIn activity ids are snowflake-like: the top bits are a millisecond timestamp. */
export function activityTime(id) {
  try {
    const ms = Number(BigInt(id) >> 22n);
    return ms > 1.2e12 && ms < 4e12 ? new Date(ms).toISOString() : '';
  } catch {
    return '';
  }
}

function activityId(o) {
  for (const s of [o?.metadata?.backendUrn, o?.updateMetadata?.urn, o?.entityUrn, o?.preDashEntityUrn, o?.['*socialDetail']]) {
    const m = typeof s === 'string' ? ACTIVITY.exec(s) : null;
    if (m) return m[1];
  }
  return '';
}

function cleanProfileUrl(u) {
  if (typeof u !== 'string' || !/^https:\/\/www\.linkedin\.com\//.test(u)) return '';
  return u.split('?')[0];
}

export function parseSearch(json, query, max = 10) {
  const included = Array.isArray(json?.included) ? json.included : [];
  const counts = new Map();
  for (const o of included) {
    if (o && typeof o === 'object' && ('numLikes' in o || 'numComments' in o)) {
      const id = activityId(o);
      if (id) counts.set(id, o);
    }
  }
  const seen = new Set();
  const items = [];
  for (const o of included) {
    if (!o || typeof o !== 'object') continue;
    const body = text(o.commentary);
    if (!body) continue;
    const id = activityId(o);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const published = activityTime(id);
    if (!published) continue;
    const name = text(o.actor?.name);
    const c = counts.get(id) || {};
    const item = {
      external_id: id,
      url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`,
      text: body.slice(0, 8000),
      author: name || 'LinkedIn member',
      published_at: published,
      metrics: { likes: c.numLikes | 0, reposts: c.numShares | 0, replies: c.numComments | 0 },
    };
    const au = cleanProfileUrl(o.actor?.navigationContext?.actionTarget || o.actor?.navigationUrl);
    if (au) item.author_url = au;
    if (query) item.query = query;
    items.push(item);
    if (items.length >= max) break;
  }
  return items;
}
