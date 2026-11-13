// Guarda de arquivos do perfil na VPS: GIF e vídeo de fundo que não cabem no banco do servidor da conta.
//   MEDIA_SECRET=<o mesmo do Worker> PUBLIC_ORIGIN=https://seu-dominio MEDIA_DIR=./media PORT=3200 node media-server.mjs
// Atrás do proxy HTTPS (Caddy), que manda /media/* para cá. Sem banco: só a pasta MEDIA_DIR.
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMediaStore } from './src/media-store.js';
import { sendResponse, toRequest } from './src/node-http.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3200;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://${HOST}:${PORT}`;
const UPLOAD_TIMEOUT_MS = 20 * 60_000;   // 50 MB numa internet lenta leva minutos; o padrão do Node (5 min) cortaria

const store = createMediaStore({
  dir: process.env.MEDIA_DIR || join(here, 'media'),
  secret: process.env.MEDIA_SECRET ?? '',
  publicOrigin: PUBLIC_ORIGIN,
  maxBytes: Number(process.env.MEDIA_MAX_BYTES) || undefined,
  minFreeBytes: process.env.MEDIA_MIN_FREE_BYTES === undefined ? undefined : Number(process.env.MEDIA_MIN_FREE_BYTES)
});
await store.cleanTemp();

const server = http.createServer(async (req, res) => {
  try {
    const response = (await store.fetch(toRequest(req, PUBLIC_ORIGIN))) ?? new Response('Not found', { status: 404 });
    await sendResponse(res, response);
  } catch (err) {
    console.error('Erro na guarda de arquivos:', err?.message);
    if (res.headersSent) res.destroy();
    else res.writeHead(500, { 'Content-Type': 'application/json' }).end('{"error":"internal_error"}');
  }
});
server.requestTimeout = UPLOAD_TIMEOUT_MS;

server.listen(PORT, HOST, () => console.log(`Guarda de arquivos em ${PUBLIC_ORIGIN} (porta ${PORT})`));
