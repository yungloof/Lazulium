import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import worker from './src/index.js';

const CACHE_FILE = path.resolve(process.env.CACHE_PATH || './cache.json');
const DEFAULT_EDGE_TTL_SECONDS = 6 * 60 * 60;
const RATE_LIMIT_MAX = Math.max(1, parseInt(process.env.RATE_LIMIT_MAX || '60', 10) || 60);
const RATE_LIMIT_WINDOW_MS = Math.max(1000, parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10) || 60_000);

let cacheStore = {};
let cacheDirty = false;

function pruneExpired(now = Date.now()) {
  let removed = false;
  for (const [key, item] of Object.entries(cacheStore)) {
    if (!item || typeof item !== 'object' || (item.expires && item.expires <= now)) {
      delete cacheStore[key];
      removed = true;
    }
  }
  if (removed) cacheDirty = true;
}

try {
  if (fs.existsSync(CACHE_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
      cacheStore = loaded;
      pruneExpired();
    }
  }
} catch {
  cacheStore = {};
}

function saveCache() {
  pruneExpired();
  if (!cacheDirty) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const tmpFile = `${CACHE_FILE}.tmp-${process.pid}`;
    fs.writeFileSync(tmpFile, JSON.stringify(cacheStore));
    fs.renameSync(tmpFile, CACHE_FILE);
    cacheDirty = false;
  } catch (err) {
    console.warn('Cache save failed:', err instanceof Error ? err.message : String(err));
  }
}

setInterval(saveCache, 60_000).unref();

const edgeCacheShim = {
  async match(req) {
    const url = typeof req === 'string' ? req : req?.url;
    if (!url) return undefined;
    const key = `edge:${url}`;
    const item = cacheStore[key];
    if (!item) return undefined;
    if (item.expires && item.expires <= Date.now()) {
      delete cacheStore[key];
      cacheDirty = true;
      return undefined;
    }
    return new Response(item.value, {
      status: 200,
      headers: { 'Content-Type': item.contentType || 'application/json' }
    });
  },
  async put(req, res) {
    const url = typeof req === 'string' ? req : req?.url;
    if (!url || !res) return;
    const body = await res.text();
    const cc = res.headers?.get?.('cache-control') || '';
    const maxAgeMatch = cc.match(/max-age=(\d+)/i);
    const ttlSec = maxAgeMatch ? Number(maxAgeMatch[1]) : DEFAULT_EDGE_TTL_SECONDS;
    const expires = ttlSec > 0 ? Date.now() + ttlSec * 1000 : null;
    cacheStore[`edge:${url}`] = {
      value: body,
      contentType: res.headers?.get?.('content-type') || 'application/json',
      expires
    };
    cacheDirty = true;
  }
};

if (!globalThis.caches) {
  globalThis.caches = { default: edgeCacheShim };
}

const rateBuckets = new Map();

const env = {
  TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID || '',
  TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET || '',
  GGDEALS_API_KEY: process.env.GGDEALS_API_KEY || '',
  RATE_LIMITER: {
    async limit({ key }) {
      const now = Date.now();
      const bucket = rateBuckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        if (rateBuckets.size > 10_000) {
          for (const [k, v] of rateBuckets) {
            if (v.resetAt <= now) rateBuckets.delete(k);
          }
        }
        return { success: true };
      }
      if (bucket.count >= RATE_LIMIT_MAX) {
        return { success: false };
      }
      bucket.count += 1;
      return { success: true };
    }
  },
  IGDB_CACHE: {
    async get(key) {
      const item = cacheStore[key];
      if (!item) return null;
      if (item.expires && item.expires <= Date.now()) {
        delete cacheStore[key];
        cacheDirty = true;
        return null;
      }
      return item.value;
    },
    async put(key, value, options) {
      const expires = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null;
      cacheStore[key] = { value, expires };
      cacheDirty = true;
      return null;
    }
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const protoHeader = Array.isArray(req.headers['x-forwarded-proto']) ? req.headers['x-forwarded-proto'][0] : req.headers['x-forwarded-proto'];
    const protocol = (protoHeader || 'http').split(',')[0].trim() || 'http';
    const hostHeader = Array.isArray(req.headers['x-forwarded-host']) ? req.headers['x-forwarded-host'][0] : req.headers['x-forwarded-host'];
    const host = (hostHeader || req.headers.host || 'localhost').split(',')[0].trim() || 'localhost';
    const fullUrl = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val !== undefined) {
        if (Array.isArray(val)) val.forEach((v) => headers.append(key, v));
        else headers.set(key, val);
      }
    }

    if (!headers.has('cf-connecting-ip')) {
      const forwarded = headers.get('x-forwarded-for');
      const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
      if (clientIp) headers.set('cf-connecting-ip', clientIp);
    }

    const webReq = new Request(fullUrl, {
      method: req.method,
      headers
    });

    const webRes = await worker.fetch(webReq, env);

    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const buffer = Buffer.from(await webRes.arrayBuffer());
    res.end(buffer);
  } catch (err) {
    console.error('Request error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_server_error' }));
  }
});

const shutdown = () => {
  saveCache();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const HOST = process.env.HOST || '127.0.0.1';
const rawPort = parseInt(process.env.PORT ?? '3000', 10);
const PORT = Number.isNaN(rawPort) ? 3000 : rawPort;
server.listen(PORT, HOST, () => {
  console.log(`Lazulium Backend API escutando em http://${HOST}:${PORT}`);
});
