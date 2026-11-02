// Gera os ícones do Lazulium (gema de lápis-lazúli) sem dependências externas.
// Uso: node scripts/generate-icons.mjs  ->  resources/icon.ico, resources/icon.png, resources/tray.ico
import { deflateSync } from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = 4; // Supersampling 4x4 para bordas suaves

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function encodePng(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const inPolygon = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// Coordenadas normalizadas (0..1). Ordem = pintura (o último vence).
const BG = { r: 13, g: 15, b: 23 };
const GEM = {
  crown: [[0.3, 0.3], [0.7, 0.3], [0.82, 0.43], [0.18, 0.43]],
  pavilion: [[0.18, 0.43], [0.82, 0.43], [0.5, 0.84]]
};
const FACETS = [
  { pts: [[0.3, 0.3], [0.5, 0.3], [0.42, 0.43], [0.18, 0.43]], color: [129, 140, 248] },
  { pts: [[0.5, 0.3], [0.7, 0.3], [0.82, 0.43], [0.58, 0.43]], color: [99, 102, 241] },
  { pts: [[0.42, 0.43], [0.5, 0.3], [0.58, 0.43]], color: [165, 180, 252] },
  { pts: [[0.18, 0.43], [0.42, 0.43], [0.5, 0.84]], color: [67, 56, 202] },
  { pts: [[0.42, 0.43], [0.58, 0.43], [0.5, 0.84]], color: [79, 70, 229] },
  { pts: [[0.58, 0.43], [0.82, 0.43], [0.5, 0.84]], color: [49, 46, 129] }
];
// Pontinhos dourados de pirita, típicos do lápis-lazúli
const PYRITE = [[0.36, 0.52, 0.018], [0.6, 0.6, 0.014], [0.5, 0.7, 0.012], [0.66, 0.37, 0.012]];

function samplePixel(x, y, withBackground) {
  const radius = 0.22;
  const dx = Math.max(0.04 + radius - x, 0, x - (0.96 - radius));
  const dy = Math.max(0.04 + radius - y, 0, y - (0.96 - radius));
  const inBg = withBackground && dx * dx + dy * dy <= radius * radius && x >= 0.04 && x <= 0.96 && y >= 0.04 && y <= 0.96;

  for (const [px, py, r] of PYRITE) {
    if ((x - px) ** 2 + (y - py) ** 2 <= r * r) return [251, 191, 36, 255];
  }
  for (let i = FACETS.length - 1; i >= 0; i--) {
    if (inPolygon(x, y, FACETS[i].pts)) return [...FACETS[i].color, 255];
  }
  if (inBg) {
    // Brilho radial suave atrás da gema
    const glow = Math.max(0, 1 - Math.hypot(x - 0.5, y - 0.5) / 0.55) * 0.35;
    return [BG.r + 70 * glow, BG.g + 60 * glow, BG.b + 160 * glow, 255];
  }
  return [0, 0, 0, 0];
}

function render(size, withBackground) {
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const [cr, cg, cb, ca] = samplePixel((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size, withBackground);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      const n = SAMPLES * SAMPLES;
      out[i] = a ? Math.round(r / a) : 0;
      out[i + 1] = a ? Math.round(g / a) : 0;
      out[i + 2] = a ? Math.round(b / a) : 0;
      out[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, out);
}

// ICO com entradas PNG (suportado desde o Windows Vista)
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const write = (rel, data) => {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`${rel} (${data.length} bytes)`);
};

const appIcons = [256, 64, 48, 32, 24, 16].map((size) => ({ size, data: render(size, true) }));
write('resources/icon.ico', encodeIco(appIcons));
write('resources/icon.png', render(512, true));
// Bandeja: só a gema (sem fundo) para ficar nítida em 16-32px
write('resources/tray.ico', encodeIco([32, 24, 16].map((size) => ({ size, data: render(size, false) }))));
