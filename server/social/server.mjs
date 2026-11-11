// Servidor social fora da Cloudflare (VPS ou teste local): mesmo código do Worker, banco SQLite em arquivo.
//   SOCIAL_DB=./social.db PORT=3100 node server.mjs
// Atrás de um proxy HTTPS (Caddy), o endereço público vem de PUBLIC_ORIGIN (usado no retorno do login da Steam).
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from './src/index.js';
import { openD1 } from './src/d1-sqlite.js';

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

const env = { DB, RATE_LIMITER };

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
    headers.set('CF-Connecting-IP', ip);
    const request = new Request(new URL(req.url ?? '/', PUBLIC_ORIGIN), {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : body
    });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error('Erro no servidor social:', err?.message);
    res.writeHead(500, { 'Content-Type': 'application/json' }).end('{"error":"internal_error"}');
  }
});

server.listen(PORT, HOST, () => console.log(`Servidor social em ${PUBLIC_ORIGIN} (porta ${PORT})`));
