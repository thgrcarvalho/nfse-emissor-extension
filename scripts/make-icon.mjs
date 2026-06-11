// Generates a simple 128x128 solid PNG icon (no external deps) so the unpacked
// extension has a valid icon. Run: node scripts/make-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZE = 128;
const [R, G, B] = [27, 107, 58]; // NFS-e green

const table = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type RGB
// rest 0: compression, filter, interlace

const row = Buffer.alloc(1 + SIZE * 3);
for (let x = 0; x < SIZE; x++) {
  row[1 + x * 3] = R;
  row[1 + x * 3 + 1] = G;
  row[1 + x * 3 + 2] = B;
}
const raw = Buffer.concat(Array.from({ length: SIZE }, () => row));
const idat = deflateSync(raw);

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
writeFileSync(new URL('../icons/icon128.png', import.meta.url), png);
console.log(`wrote icons/icon128.png (${png.length} bytes)`);
