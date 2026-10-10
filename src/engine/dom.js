// CSS-selector engine for `expect: "html"` steps. The MV3 service worker has no DOM, so the real one runs in an
// offscreen document (offscreen/dom.js) that calls createDomEngine(DOMParser). Tests pass linkedom's DOMParser.
// Nodes are handed back as numeric ids; the document and its nodes are released with release().

const norm = (s) => s.split(/\s+/).filter(Boolean).join(' ');

export function createDomEngine(DOMParserCtor) {
  const docs = new Map();
  let next = 1;
  return {
    parse(body) {
      const id = next++;
      docs.set(id, { doc: new DOMParserCtor().parseFromString(body, 'text/html'), nodes: new Map(), n: 1 });
      return id;
    },
    /** Matches below nodeId (or the whole document when null); value is the attribute, or the whitespace-folded text. */
    select(docId, nodeId, selector, attr) {
      const d = docs.get(docId);
      if (!d) return [];
      const base = nodeId == null ? d.doc : d.nodes.get(nodeId);
      if (!base) return [];
      let list;
      try { list = base.querySelectorAll(selector); } catch { return []; }
      const out = [];
      for (const el of list) {
        const id = d.n++;
        d.nodes.set(id, el);
        out.push({ id, value: attr ? (el.getAttribute(attr) || '') : norm(el.textContent || '') });
      }
      return out;
    },
    release(docId) { docs.delete(docId); },
  };
}
