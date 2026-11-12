import { app, net, protocol } from 'electron';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs';
import { mkdir, rename, rm, unlink, writeFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import { MediaAssetType } from '@shared/types/ipc';
import { httpRequest } from './http';

export const MEDIA_SCHEME = 'lazulium-media';
const MEDIA_HOST = 'media';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

// Downloads só do CDN do SteamGridDB: o renderer nunca faz o main baixar URLs arbitrárias
// SteamGridDB (conta do jogador) e IGDB (capas pelo servidor do Lazulium)
const ALLOWED_HOST = /(^|\.)steamgriddb\.com$|^images\.igdb\.com$/i;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
};

// Fora de "Cache": no Windows, userData/cache é a MESMA pasta do cache do Chromium, que a limpa sozinho
function getCacheRoot(): string {
  return join(app.getPath('userData'), 'artwork');
}

// Traz as artes que ainda existem na pasta antiga (userData/cache/media)
export function migrateMediaCache(): void {
  const oldRoot = join(app.getPath('userData'), 'cache', 'media');
  if (!existsSync(oldRoot)) return;
  const root = getCacheRoot();
  try {
    for (const entry of readdirSync(oldRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const targetDir = join(root, entry.name);
        mkdirSync(targetDir, { recursive: true });
        for (const file of readdirSync(join(oldRoot, entry.name))) {
          const src = join(oldRoot, entry.name, file);
          const dst = join(targetDir, file);
          if (!existsSync(dst)) renameSync(src, dst);
        }
      }
    }
    rmSync(oldRoot, { recursive: true, force: true });
    const cacheDir = join(app.getPath('userData'), 'cache');
    try {
      if (existsSync(cacheDir) && readdirSync(cacheDir).length === 0) {
        rmSync(cacheDir, { recursive: true, force: true });
      }
    } catch {}
    console.log('[Media] Artes migradas para a pasta artwork');
  } catch (err) {
    console.warn('[Media] Falha ao migrar artes:', (err as Error).message);
  }
}

// Arquivo em disco de uma URL de arte em cache (undefined se a URL não for do cache)
export function cachedFilePath(url?: string): string | undefined {
  if (!url?.startsWith(`${MEDIA_SCHEME}://${MEDIA_HOST}/`)) return undefined;
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const root = resolve(getCacheRoot());
    const path = resolve(root, ...segments);
    return path.startsWith(root + sep) ? path : undefined;
  } catch {
    // URL malformada no banco: tratada como fora do cache (nunca derruba a abertura do app)
    return undefined;
  }
}

export function isCachedFileMissing(url?: string): boolean {
  const path = cachedFilePath(url);
  return !!path && !existsSync(path);
}

// Só depois de o banco apontar para a arte nova: nunca apaga a arte em uso
export async function removeCachedFile(url?: string): Promise<void> {
  const path = cachedFilePath(url);
  if (path) await unlink(path).catch(() => undefined);
}

// Nome de pasta seguro para um jogo (artes, capturas e backups usam o mesmo)
export function gameDirName(gameId: string): string {
  return gameId.replace(/[^a-z0-9._-]/gi, '_');
}

// Deve ser chamado antes de app.whenReady()
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    // Sem supportFetchAPI: a interface só mostra as artes em <img>/<video>. Com fetch() liberado, uma página de
    // outra origem (como a moldura da vitrine) poderia ler capturas e artes do PC (falha do Electron sem corsEnabled).
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true } }
  ]);
}

interface MediaRoot {
  resolveRoot: () => string | undefined | Promise<string | undefined>;
  allowPath?: RegExp;               // Caminho relativo (com '/') que pode ser servido dessa raiz
}

// Outras pastas servidas pelo mesmo esquema (ex: capturas de tela), cada uma presa à sua raiz
const extraRoots = new Map<string, MediaRoot>();

export function registerMediaRoot(host: string, root: MediaRoot): void {
  extraRoots.set(host, root);
}

export function mediaUrl(host: string, relativePath: string): string {
  return `${MEDIA_SCHEME}://${host}/${relativePath.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}

// lazulium-media://<host>/<caminho> -> arquivo dentro da raiz daquele host (nunca fora dela)
export function registerMediaProtocol(): void {
  const cacheRoot = resolve(getCacheRoot());
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const extra = extraRoots.get(url.host);
      const rootDir = url.host === MEDIA_HOST ? cacheRoot : extra ? await extra.resolveRoot() : undefined;
      if (!rootDir || (extra?.allowPath && !extra.allowPath.test(segments.join('/')))) {
        return new Response('Not found', { status: 404 });
      }
      const root = resolve(rootDir);
      const filePath = resolve(root, ...segments);
      if (!filePath.startsWith(root + sep) || !existsSync(filePath)) {
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

const isAllowedImageUrl = (url: URL) => url.protocol === 'https:' && ALLOWED_HOST.test(url.hostname);

// Baixa a arte para o cache e retorna a URL local (quem chama remove a arte anterior, se houver).
export async function cacheRemoteAsset(gameId: string, type: MediaAssetType, remoteUrl: string): Promise<string> {
  const url = new URL(remoteUrl);
  if (!isAllowedImageUrl(url)) throw new Error(`Origem de imagem não permitida: ${url.hostname}`);

  const res = await httpRequest(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS, retries: 1, service: url.hostname.endsWith('igdb.com') ? 'o IGDB' : 'o SteamGridDB' });
  // Um redirecionamento não pode levar o download para fora do CDN permitido
  if (res.url && !isAllowedImageUrl(new URL(res.url))) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Origem de imagem não permitida: ${new URL(res.url).hostname}`);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Não foi possível baixar a imagem (erro ${res.status}).`);
  }

  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = EXTENSION_BY_MIME[mime] ?? url.pathname.split('.').pop()?.toLowerCase();
  if (!mime.startsWith('image/') || !ext || !/^(png|jpe?g|webp|ico)$/.test(ext)) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Formato de imagem não suportado (${mime || 'desconhecido'}).`);
  }
  // Confere o tamanho antes de trazer a imagem para a memória
  if (Number(res.headers.get('content-length') ?? 0) > MAX_DOWNLOAD_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error('Imagem grande demais.');
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('Imagem grande demais.');

  const dirName = gameDirName(gameId);
  const dir = join(getCacheRoot(), dirName);
  await mkdir(dir, { recursive: true });

  const fileName = `${type}-${createHash('sha1').update(remoteUrl).digest('hex').slice(0, 12)}.${ext}`;
  const tmpPath = join(dir, `${fileName}.tmp`);
  try {
    await writeFile(tmpPath, buffer);
    await rename(tmpPath, join(dir, fileName));
  } catch (err) {
    // Disco cheio ou arquivo preso: não deixa o .tmp para trás
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }

  // ?v=: a URL muda a cada aplicação, então o Chromium nunca reaproveita a imagem anterior em cache
  // (o protocolo ignora a query ao achar o arquivo)
  return `${MEDIA_SCHEME}://${MEDIA_HOST}/${encodeURIComponent(dirName)}/${encodeURIComponent(fileName)}?v=${Date.now().toString(36)}`;
}

export async function removeGameMedia(gameId: string): Promise<void> {
  await rm(join(getCacheRoot(), gameDirName(gameId)), { recursive: true, force: true });
}
