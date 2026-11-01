import { app, net, protocol } from 'electron';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readdir, rename, rm, unlink, writeFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import { MediaAssetType } from '@shared/types/ipc';

export const MEDIA_SCHEME = 'lazulium-media';
const MEDIA_HOST = 'media';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

// Downloads só do CDN do SteamGridDB: o renderer nunca faz o main baixar URLs arbitrárias
const ALLOWED_HOST = /(^|\.)steamgriddb\.com$/i;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
};

function getCacheRoot(): string {
  return join(app.getPath('userData'), 'cache', 'media');
}

function gameDirName(gameId: string): string {
  return gameId.replace(/[^a-z0-9._-]/gi, '_');
}

// Deve ser chamado antes de app.whenReady()
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ]);
}

// lazulium-media://media/<jogo>/<arquivo> -> arquivo no cache (nunca fora dele)
export function registerMediaProtocol(): void {
  const root = resolve(getCacheRoot());
  protocol.handle(MEDIA_SCHEME, (request) => {
    try {
      const url = new URL(request.url);
      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const filePath = resolve(root, ...segments);
      if (url.host !== MEDIA_HOST || !filePath.startsWith(root + sep) || !existsSync(filePath)) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });
}

export function isCachedMediaUrl(url?: string): boolean {
  return !!url && url.startsWith(`${MEDIA_SCHEME}://`);
}

// Baixa a arte e substitui a versão anterior do mesmo tipo. Retorna a URL local.
export async function cacheRemoteAsset(gameId: string, type: MediaAssetType, remoteUrl: string): Promise<string> {
  const url = new URL(remoteUrl);
  if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname)) {
    throw new Error(`Origem de imagem não permitida: ${url.hostname}`);
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Falha ao baixar imagem (HTTP ${res.status}).`);

  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = EXTENSION_BY_MIME[mime] ?? url.pathname.split('.').pop()?.toLowerCase();
  if (!mime.startsWith('image/') || !ext || !/^(png|jpe?g|webp|ico)$/.test(ext)) {
    throw new Error(`Formato de imagem não suportado (${mime || 'desconhecido'}).`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('Imagem grande demais.');

  const dirName = gameDirName(gameId);
  const dir = join(getCacheRoot(), dirName);
  await mkdir(dir, { recursive: true });

  const fileName = `${type}-${createHash('sha1').update(remoteUrl).digest('hex').slice(0, 12)}.${ext}`;
  const tmpPath = join(dir, `${fileName}.tmp`);
  await writeFile(tmpPath, buffer);
  await rename(tmpPath, join(dir, fileName));

  // Remove a arte anterior do mesmo tipo
  for (const existing of await readdir(dir)) {
    if (existing.startsWith(`${type}-`) && existing !== fileName) {
      await unlink(join(dir, existing)).catch(() => undefined);
    }
  }

  return `${MEDIA_SCHEME}://${MEDIA_HOST}/${encodeURIComponent(dirName)}/${encodeURIComponent(fileName)}`;
}

export async function removeGameMedia(gameId: string): Promise<void> {
  await rm(join(getCacheRoot(), gameDirName(gameId)), { recursive: true, force: true });
}
