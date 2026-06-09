// Genererar platshållar-PWA-ikoner (solid mörk bakgrund med en ljus ring).
// Avsiktligt enkelt och beroende-fritt: riktiga, designade ikoner kommer i T2.
// Vi skriver giltiga PNG-filer för hand så att vite-plugin-pwa får installerbara
// ikoner utan att vi drar in ett bildbibliotek för något som är tillfälligt.
//
// Kör: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

// Bakgrund (mörk marin) och accent (ljus). Matchar theme_color i manifestet.
const BG = [11, 18, 32]; // #0b1220
const FG = [248, 250, 252]; // #f8fafc

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Ritar en enkel cirkelring (accent) centrerad på mörk bakgrund.
function makePng(size) {
  const center = size / 2;
  const outer = size * 0.34;
  const inner = size * 0.24;

  // RGBA-rader med filter-byte (0) först på varje rad, det PNG kräver.
  const bytesPerPixel = 4;
  const stride = size * bytesPerPixel + 1;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type none
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isRing = dist <= outer && dist >= inner;
      const [r, g, b] = isRing ? FG : BG;
      const off = y * stride + 1 + x * bytesPerPixel;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['pwa-maskable-512x512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of files) {
  writeFileSync(join(publicDir, name), makePng(size));
  console.log(`Skrev public/${name} (${size}x${size})`);
}
