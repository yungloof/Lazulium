// Servidor social fora da Cloudflare (VPS ou teste local): mesmo código do Worker, banco SQLite em arquivo.
//   SOCIAL_DB=./social.db PORT=3100 node server.mjs
// Para aceitar GIF e vídeo de fundo: MEDIA_SECRET (32+ caracteres) e MEDIA_DIR (pasta dos arquivos).
// Atrás de um proxy HTTPS (Caddy), o endereço público vem de PUBLIC_ORIGIN (usado no retorno do login da Steam).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from './src/index.js';
import { openD1 } from './src/d1-sqlite.js';
import { createMediaStore } from './src/media-store.js';
import { sendResponse, toRequest } from './src/node-http.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3100;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://${HOST}:${PORT}`;
const DB = openD1(process.env.SOCIAL_DB || join(here, 'social.db'), join(here, 'schema.sql'));

// Limite simples por IP (o Worker usa o Rate Limiting da Cloudflare)
const WINDOW_MS = 60_000;
const LIMIT = Number(process.env.RATE_LIMIT) || 120;
const hits = new Map();
const RATE_LIMITER = {
  async limit({ key }) {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return { success: true };
    }
    entry.count++;
    return { success: entry.count <= LIMIT };
  }
};
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (entry.resetAt < now) hits.delete(key);
}, WINDOW_MS).unref();

const PROFILE_PAGE = readFileSync(join(here, '..', '..', 'web', 'profile', 'index.html'), 'utf-8');
const env = { DB, RATE_LIMITER, PROFILE_PAGE, MEDIA_STORE_URL: process.env.MEDIA_STORE_URL, MEDIA_SECRET: process.env.MEDIA_SECRET };

// GIF e vídeo de fundo: com MEDIA_DIR, este mesmo processo guarda os arquivos (rotas /media/*);
// sem ela, vale MEDIA_STORE_URL (outra máquina rodando o media-server.mjs), como no Worker.
const store = process.env.MEDIA_DIR && env.MEDIA_SECRET ? createMediaStore({ dir: process.env.MEDIA_DIR, secret: env.MEDIA_SECRET, publicOrigin: PUBLIC_ORIGIN }) : null;
if (store) {
  await store.cleanTemp();
  env.MEDIA_STORE = store;
  env.MEDIA_STORE_URL = PUBLIC_ORIGIN;
}
// Pedidos de apagar que a guarda de arquivos não confirmou (no Worker, é o gatilho de hora em hora)
setInterval(() => worker.scheduled(null, env).catch((err) => console.error('Erro ao repetir pedidos de apagar:', err?.message)), 60 * 60_000).unref();

const server = http.createServer(async (req, res) => {
  try {
    const request = toRequest(req, PUBLIC_ORIGIN);
    const response = (await store?.fetch(request)) ?? (await worker.fetch(request, env));
    await sendResponse(res, response);
  } catch (err) {
    console.error('Erro no servidor social:', err?.message);
    if (res.headersSent) res.destroy();
    else res.writeHead(500, { 'Content-Type': 'application/json' }).end('{"error":"internal_error"}');
  }
});
server.requestTimeout = 20 * 60_000;   // Envio de vídeo de fundo leva minutos numa internet lenta

server.listen(PORT, HOST, () => console.log(`Servidor social em ${PUBLIC_ORIGIN} (porta ${PORT})`));
