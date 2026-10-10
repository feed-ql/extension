// Generates the toolbar icons (orange rounded tile with a white "f" bar mark) so no binary lives in git.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o; };

function png(n) {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  const r = n * 0.22;
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const dx = Math.max(r - x - 0.5, x + 0.5 - (n - r), 0), dy = Math.max(r - y - 0.5, y + 0.5 - (n - r), 0);
      const inside = dx * dx + dy * dy <= r * r;
      const u = x / n, v = y / n;
      const mark = (u > 0.34 && u < 0.46 && v > 0.22 && v < 0.78) || (u > 0.34 && u < 0.7 && v > 0.22 && v < 0.33) || (u > 0.34 && u < 0.62 && v > 0.45 && v < 0.55);
      const o = y * (n * 4 + 1) + 1 + x * 4;
      const c = !inside ? [0, 0, 0, 0] : mark ? [255, 255, 255, 255] : [229, 72, 28, 255];
      raw.set(c, o);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(dir, { recursive: true });
for (const n of [16, 32, 48, 128]) writeFileSync(join(dir, `${n}.png`), png(n));
