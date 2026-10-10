// Offscreen document: parses response HTML with the browser's own DOMParser for the service worker.
// It only answers messages addressed to it and never touches the network, cookies or storage.
import { createDomEngine } from '../src/engine/dom.js';

const engine = createDomEngine(DOMParser);

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.target !== 'offscreen-dom') return false;
  try {
    if (msg.op === 'parse') send({ ok: engine.parse(String(msg.body)) });
    else if (msg.op === 'select') send({ ok: engine.select(msg.doc, msg.node, String(msg.selector), String(msg.attr || '')) });
    else if (msg.op === 'release') { engine.release(msg.doc); send({ ok: true }); } else send({ error: 'unknown op' });
  } catch (e) {
    send({ error: e.message });
  }
  return false;
});
