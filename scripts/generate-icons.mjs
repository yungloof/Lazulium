// Gera os ícones do Lazulium a partir da logo (resources/logo.png), sem dependências externas.
// Uso: node scripts/generate-icons.mjs  ->  resources/icon.ico, resources/icon.png, resources/tray.ico e a logo da interface
import { deflateSync, inflateSync } from 'zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHANNELS = 4;

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
  const raw = Buffer.alloc((size * CHANNELS + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * CHANNELS + 1)] = 0;
    rgba.copy(raw, y * (size * CHANNELS + 1) + 1, y * size * CHANNELS, (y + 1) * size * CHANNELS);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Lê PNG quadrado de 8 bits RGBA, sem entrelaçamento (o formato da logo)
function decodePng(file) {
  let offset = 8;
  let size = 0;
  const idat = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      size = data.readUInt32BE(0);
      if (data.readUInt32BE(4) !== size || data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error('A logo precisa ser um PNG quadrado de 8 bits RGBA, sem entrelaçamento.');
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = size * CHANNELS;
  const out = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= CHANNELS ? out[y * stride + x - CHANNELS] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= CHANNELS ? out[(y - 1) * stride + x - CHANNELS] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return { size, rgba: out };
}

// Média por área: reduzir de 800 para 16 px não perde as linhas finas de uma vez
function render(logo, size) {
  const scale = logo.size / size;
  const out = Buffer.alloc(size * size * CHANNELS);
  for (let py = 0; py < size; py++) {
    const [y0, y1] = [py * scale, (py + 1) * scale];
    for (let px = 0; px < size; px++) {
      const [x0, x1] = [px * scale, (px + 1) * scale];
      let r = 0, g = 0, b = 0, a = 0, weight = 0;
      for (let sy = Math.floor(y0); sy < Math.min(Math.ceil(y1), logo.size); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.min(Math.ceil(x1), logo.size); sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          const i = (sy * logo.size + sx) * CHANNELS;
          const alpha = logo.rgba[i + 3];
          r += logo.rgba[i] * alpha * w;
          g += logo.rgba[i + 1] * alpha * w;
          b += logo.rgba[i + 2] * alpha * w;
          a += alpha * w;
          weight += w;
        }
      }
      const i = (py * size + px) * CHANNELS;
      out[i] = a ? Math.round(r / a) : 0;
      out[i + 1] = a ? Math.round(g / a) : 0;
      out[i + 2] = a ? Math.round(b / a) : 0;
      out[i + 3] = Math.round(a / weight);
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

const logo = decodePng(readFileSync(join(root, 'resources/logo.png')));
const icons = (sizes) => encodeIco(sizes.map((size) => ({ size, data: render(logo, size) })));

write('resources/icon.ico', icons([256, 64, 48, 32, 24, 16]));
write('resources/icon.png', render(logo, 512));
write('resources/tray.ico', icons([32, 24, 16]));
write('src/renderer/src/assets/logo.png', render(logo, 128));
