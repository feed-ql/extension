// The service worker has no DOM. HTML responses are parsed by the browser's DOMParser in an offscreen document
// (offscreen/dom.js); this is the client the interpreter's `env.html` uses. Created on first use, closed after the run.
let creating = null;

async function ensure() {
  const have = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (have.length) return;
  creating ||= chrome.offscreen.createDocument({
    url: 'offscreen/dom.html',
    reasons: ['DOM_PARSER'],
    justification: 'Parse the HTML of a site response with CSS selectors, as a feedql recipe asks',
  }).finally(() => { creating = null; });
  await creating;
}

async function call(op, payload) {
  await ensure();
  const r = await chrome.runtime.sendMessage({ target: 'offscreen-dom', op, ...payload });
  if (!r || r.error) throw new Error(r?.error || 'offscreen document did not answer');
  return r.ok;
}

export const offscreenHtml = {
  parse: (body) => call('parse', { body }),
  select: (doc, node, selector, attr) => call('select', { doc, node, selector, attr }),
  release: (doc) => call('release', { doc }),
};

export async function closeOffscreen() {
  try {
    const have = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (have.length) await chrome.offscreen.closeDocument();
  } catch { /* nothing to close */ }
}
