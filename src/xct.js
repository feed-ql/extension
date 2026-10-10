// X-Client-Transaction-Id generator, ported from backend/internal/sources/collectors/x/xcli/transaction.go
// (itself a port of iSarabjitDhiman/XClientTransaction, MIT). Needed by SearchTimeline only.
// Pure functions + one async fetcher; the page text is passed in so tests need no network.

const EPOCH_MS = 1682924400000;
const KEYWORD = 'obfiowerehiring';
const EXTRA = 3;

const ON_DEMAND_IDX = /,(\d+):["']ondemand\.s["']/;
const INDICES = /\(\w\[(\d{1,2})\],\s*16\)/g;
const META_KEY = /<meta\s+name=["']twitter-site-verification["']\s+content=["']([^"']+)["']/;
const ANIM_ELEM = /<svg[^>]*id=["']loading-x-anim-(\d+)["'][^>]*>([\s\S]*?)<\/svg>/g;
const PATH_D = /<path[^>]*d=["']([^"']+)["']/g;

function b64decode(s) {
  const bin = atob(s);
  return Array.from(bin, (c) => c.charCodeAt(0));
}

const isOdd = (n) => (n % 2 === 0 ? 0 : -1);
const solve = (v, min, max, rounding) => {
  const r = (v * (max - min)) / 255 + min;
  return rounding ? Math.floor(r) : Math.round(r * 100) / 100;
};

function cubic(c, t) {
  if (t <= 0) {
    let g = 0;
    if (c[0] > 0) g = c[1] / c[0];
    else if (c[1] === 0 && c[2] > 0) g = c[3] / c[2];
    return g * t;
  }
  if (t >= 1) {
    let g = 0;
    if (c[2] < 1) g = (c[3] - 1) / (c[2] - 1);
    else if (c[2] === 1 && c[0] < 1) g = (c[1] - 1) / (c[0] - 1);
    return 1 + g * (t - 1);
  }
  let start = 0, end = 1, mid = 0;
  const calc = (a, b, m) => 3 * a * (1 - m) * (1 - m) * m + 3 * b * (1 - m) * m * m + m * m * m;
  while (start < end) {
    mid = (start + end) / 2;
    const x = calc(c[0], c[2], mid);
    if (Math.abs(t - x) < 0.00001) return calc(c[1], c[3], mid);
    if (x < t) start = mid; else end = mid;
  }
  return calc(c[1], c[3], mid);
}

const lerp = (from, to, f) => from.map((v, i) => v * (1 - f) + to[i] * f);
const rotationMatrix = (deg) => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), -Math.sin(r), Math.sin(r), Math.cos(r)];
};

// Not standard hex: the Python original divides by 16 repeatedly (see the Go port).
export function floatToHex(x) {
  let result = '';
  let quotient = Math.trunc(x);
  let fraction = x - quotient;
  while (quotient > 0) {
    quotient = Math.trunc(x / 16);
    const rem = Math.trunc(x - quotient * 16);
    result = (rem > 9 ? String.fromCharCode(rem + 55) : String(rem)) + result;
    x = quotient;
  }
  if (fraction === 0) return result;
  result += '.';
  while (fraction > 0) {
    fraction *= 16;
    const integer = Math.trunc(fraction);
    fraction -= integer;
    result += integer > 9 ? String.fromCharCode(integer + 55) : String(integer);
  }
  return result;
}

// Go's math.Round rounds half away from zero; JS Math.round rounds half up. Differs for negatives only.
const goRound = (n) => (n < 0 ? -Math.round(-n) : Math.round(n));

export function animate(frame, targetTime) {
  if (frame.length < 7) return '';
  const fromColor = [frame[0], frame[1], frame[2], 1];
  const toColor = [frame[3], frame[4], frame[5], 1];
  const toRotation = [solve(frame[6], 60, 360, true)];
  const curves = frame.slice(7).map((v, i) => solve(v, isOdd(i), 1, false));
  const val = cubic(curves, targetTime);
  const color = lerp(fromColor, toColor, val).map((c) => Math.min(255, Math.max(0, c)));
  const rotation = lerp([0], toRotation, val);
  const matrix = rotationMatrix(rotation[0]);
  const parts = color.slice(0, -1).map((c) => goRound(c).toString(16));
  for (const v of matrix) {
    let r = goRound(v * 100) / 100;
    if (r < 0) r = -r;
    const h = floatToHex(r).toLowerCase();
    parts.push(h.startsWith('.') ? '0' + h : h !== '' ? h : '0');
  }
  parts.push('0', '0');
  return parts.join('').replace(/[.-]/g, '');
}

function get2DArray(homeHTML, keyBytes) {
  const n = keyBytes[5] % 4;
  const all = [...homeHTML.matchAll(ANIM_ELEM)];
  if (all.length <= n) return null;
  const paths = [...all[n][2].matchAll(PATH_D)];
  if (paths.length < 2) return null;
  const d = paths[1][1];
  if (d.length < 9) return null;
  return d.slice(9).split('C').map((p) => (p.match(/\d+/g) || []).map(Number)).filter((r) => r.length);
}

const xctRound = (n) => {
  let x = Math.floor(n);
  if (n - x >= 0.5) x = Math.ceil(n);
  return n < 0 ? -Math.abs(x) : x;
};

/** Locates the ondemand.s file hash in the logged-in home page; null if the chunk map is absent. */
export function onDemandUrl(home) {
  const m = ON_DEMAND_IDX.exec(home);
  if (!m) return null;
  const h = new RegExp(`,${m[1]}:"([0-9a-f]+)"`).exec(home);
  return h ? `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${h[1]}a.js` : null;
}

/** Builds the per-session state from the home HTML and the ondemand.s script. Throws a descriptive Error. */
export function buildState(home, js) {
  const km = META_KEY.exec(home);
  if (!km) throw new Error('twitter-site-verification meta tag not found');
  const keyBytes = b64decode(km[1]);
  const idx = [...js.matchAll(INDICES)].map((m) => Number(m[1]));
  if (idx.length < 2) throw new Error('KEY_BYTES indices not found in ondemand.s');
  const rowIndex = keyBytes[idx[0]] % 16;
  const frameTime = idx.slice(1).reduce((a, i) => a * (keyBytes[i] % 16), 1);
  const ft = xctRound(frameTime / 10) * 10;
  const arr = get2DArray(home, keyBytes);
  if (!arr || arr.length <= rowIndex) throw new Error('animation frames not found in home page');
  return { keyBytes, animKey: animate(arr[rowIndex], ft / 4096) };
}

async function sha256(str) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
}

/** The header value for one request. nowMs and randomByte are injectable for tests. */
export async function transactionId(state, method, path, nowMs = Date.now(), randomByte = crypto.getRandomValues(new Uint8Array(1))[0]) {
  const timeNow = Math.floor((nowMs - EPOCH_MS) / 1000);
  const timeBytes = [timeNow & 255, (timeNow >> 8) & 255, (timeNow >> 16) & 255, (timeNow >> 24) & 255];
  const hash = await sha256(`${method}!${path}!${timeNow}${KEYWORD}${state.animKey}`);
  const bytes = [...state.keyBytes, ...timeBytes, ...hash.slice(0, 16), EXTRA];
  const out = new Uint8Array(bytes.length + 1);
  out[0] = randomByte;
  bytes.forEach((b, i) => { out[i + 1] = b ^ randomByte; });
  let bin = '';
  out.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/=+$/, '');
}
