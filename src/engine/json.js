// Order-preserving JSON parser. JSON.parse reorders integer-like keys and rounds big numbers; the recipe
// interpreter needs document order ("the first N items") and exact number text, like the Go reference
// (backend/internal/extrecipe/jsonpath.go: Obj + json.Number).

/** A JSON object that remembers key order. */
export class Obj {
  constructor() { this.keys = []; this.m = new Map(); }
  set(k, v) { if (!this.m.has(k)) this.keys.push(k); this.m.set(k, v); }
  get(k) { return this.m.get(k); }
  has(k) { return this.m.has(k); }
}

/** A JSON number kept as its literal text. */
export class Num {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const WS = /[ \t\n\r]/;
const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/** Parses text into Obj, array, string, Num, boolean, null. Throws on invalid or trailing input. */
export function parseJSON(text) {
  let i = 0;
  const fail = (m) => { throw new SyntaxError(`${m} at ${i}`); };
  const ws = () => { while (i < text.length && WS.test(text[i])) i++; };
  function str() {
    const start = i;
    i++; // opening quote
    for (;;) {
      if (i >= text.length) fail('unterminated string');
      const c = text[i];
      if (c === '\\') i += 2;
      else if (c === '"') { i++; break; } else i++;
    }
    return JSON.parse(text.slice(start, i));
  }
  function value(depth) {
    if (depth > 512) fail('too deep');
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const o = new Obj();
      ws();
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('expected a key');
        const k = str();
        ws();
        if (text[i++] !== ':') fail('expected :');
        o.set(k, value(depth + 1));
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return o; }
        fail('expected , or }');
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      ws();
      if (text[i] === ']') { i++; return a; }
      for (;;) {
        a.push(value(depth + 1));
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return a; }
        fail('expected , or ]');
      }
    }
    if (c === '"') return str();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    NUM.lastIndex = i;
    const m = NUM.exec(text);
    if (!m) fail('unexpected character');
    i += m[0].length;
    return new Num(m[0]);
  }
  const v = value(0);
  ws();
  if (i < text.length) fail('trailing data after the JSON value');
  return v;
}

/** A JSON scalar as a string; null for objects, arrays and null. */
export function scalar(n) {
  if (typeof n === 'string') return n;
  if (n instanceof Num) return n.s;
  if (typeof n === 'boolean') return n ? 'true' : 'false';
  return null;
}

const escHtml = (s) => s.replace(/[<>&]/g, (c) => '\\u00' + c.charCodeAt(0).toString(16));
const esc2028 = (s) => s.split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
function quote(s, html) {
  let q = esc2028(JSON.stringify(s));
  if (html) q = escHtml(q);
  return q;
}

/**
 * Compact JSON of any value the interpreter holds (Obj, Num, plain recipe values). Plain objects get sorted keys
 * (Go marshals maps that way), Obj keeps document order. html: escape < > & like Go's json.Marshal.
 */
export function compact(v, html = false) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return quote(v, html);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Num) return v.s;
  if (Array.isArray(v)) return '[' + v.map((e) => compact(e, html)).join(',') + ']';
  if (v instanceof Obj) return '{' + v.keys.map((k) => quote(k, html) + ':' + compact(v.m.get(k), html)).join(',') + '}';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => quote(k, html) + ':' + compact(v[k], html)).join(',') + '}';
  return 'null';
}
