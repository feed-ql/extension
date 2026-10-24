// Shared test plumbing: fixtures, a static doer (answers from recorded bodies keyed by step id, like Go's StaticDoer),
// the environment the interpreter needs. No network anywhere.
import { readFileSync } from 'node:fs';
import { TRANSFORMS } from '../src/engine/transforms.js';
import { createDomEngine } from '../src/engine/dom.js';

export const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
export const seed = (site) => JSON.parse(fixture(`seeds/${{ x: 'x-search', medium: 'medium-search', youtube: 'youtube-list' }[site] ?? 'linkedin-search'}.json`));

/** Answers from `bodies[stepId]`; a step without a body answers 404. status/headers override per step. */
export function staticDoer({ bodies = {}, status = {}, headers = {} } = {}) {
  const d = {
    bodies, status, headers, calls: [],
    async fetch(req) {
      d.calls.push(req);
      let st = 200;
      if (!(req.stepId in d.bodies)) st = 404;
      if (req.stepId in d.status) st = d.status[req.stepId];
      return { status: st, headers: new Headers(d.headers[req.stepId] || {}), body: d.bodies[req.stepId] ?? '' };
    },
  };
  return d;
}

export const FIXED_NOW = new Date('2026-10-10T12:00:00Z');
export const CT0 = 'CT0VALUE-secret';
export const JSESSION = '"ajax:123456-secret"';

export function cookies(name, host) {
  if (name === 'ct0' && host === 'x.com') return CT0;
  if (name === 'JSESSIONID' && host === 'www.linkedin.com') return JSESSION;
  return '';
}

export function env(doer, extra = {}) {
  return { fetch: (r) => doer.fetch(r), cookie: async (n, h) => cookies(n, h), now: () => FIXED_NOW, transforms: TRANSFORMS, ...extra };
}

/** The synthetic x.com/home + ondemand.s the Go test builds (extrecipe_test.go syntheticHome). */
export function syntheticHome() {
  const key = Buffer.from(Array.from({ length: 70 }, (_, i) => (i * 7 + 3) % 256)).toString('base64');
  let svgs = '';
  for (let i = 0; i < 4; i++) {
    svgs += `<svg id="loading-x-anim-${i}"><g><path d="M 0 0"/><path d="M 10,10 C 1,2,3,4,5,6,7,8,9,10,11,12 C 20,30,40,50,60,70,80,90,100,110,120,130 C 5,9,200,255,17,3,44,123,12,99,1,2"/></g></svg>`;
  }
  const home = `<html><head><meta name="twitter-site-verification" content="${key}"/></head><body><script>x={1:"a",2:"b"};,5:"ondemand.s"; ,5:"0123abcd"</script>${svgs}</body></html>`;
  const script = 'function(a){return (a[2], 16)+(a[3], 16)+(a[4], 16)}';
  return { home, script };
}

export function xDoer(extra = {}) {
  const { home, script } = syntheticHome();
  return staticDoer({ bodies: { home, script, search: fixture('x-search.recorded.json') }, ...extra });
}

/** linkedom's DOMParser behind the same engine the offscreen document uses. */
export async function domEngine() {
  const { DOMParser } = await import('linkedom');
  return createDomEngine(DOMParser);
}
