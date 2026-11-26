import { net } from 'electron';
import { readFile } from 'fs/promises';
import { Game } from '@shared/types/game';
import { db } from '../../database/db';
import { MEDIA_SCHEME, resolveMediaFilePath } from '../metadata/media-cache.service';

const MAX_COVER_BYTES = 15 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 8_000;
const ALLOWED_CT = /^image\/(png|jpeg|jpg|webp|gif|avif|svg\+xml)$/i;

/** Detects an image MIME type from magic bytes, falling back to a trusted image Content-Type header. */
export function sniffImageMime(buffer: Buffer, contentType?: string | null): string | null {
  if (buffer.length >= 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  }
  if (buffer.length >= 12) {
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    const ftyp = buffer.subarray(4, 12).toString('ascii');
    if (ftyp === 'ftypavif' || ftyp === 'ftypavis') return 'image/avif';
  }
  const head = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';

  const cleanCt = contentType?.split(';')[0]?.trim().toLowerCase();
  if (cleanCt && ALLOWED_CT.test(cleanCt)) {
    return cleanCt === 'image/jpg' ? 'image/jpeg' : cleanCt;
  }
  return null;
}

/** Converts an image buffer into a data URL, rejecting unsupported formats and oversized payloads. */
export function bufferToDataUrl(buffer: Buffer, contentType?: string | null): string | null {
  if (buffer.length === 0 || buffer.length > MAX_COVER_BYTES) return null;
  const mime = sniffImageMime(buffer, contentType);
  if (!mime) return null;
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** Collects deduplicated cover candidates across one or more game editions in priority order. */
export function collectCoverCandidates(games: Game[]): string[] {
  const fields: Array<keyof NonNullable<Game['media']>> = ['coverUrl', 'coverSourceUrl', 'publicCoverUrl', 'heroUrl'];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const field of fields) {
    for (const game of games) {
      const candidate = game.media?.[field]?.trim();
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        urls.push(candidate);
      }
    }
  }
  return urls;
}

export interface ShareCardCoverDeps {
  getGame?: (id: string) => Game | undefined;
  resolveLocalPath?: (url: string) => Promise<string | undefined>;
  readFileBytes?: (path: string) => Promise<Buffer>;
  fetchRemote?: (url: string) => Promise<{ ok: boolean; headers?: { get(name: string): string | null }; arrayBuffer: () => Promise<ArrayBuffer> }>;
}

/** Resolves the best available game cover into a clean data URL via the main process. */
export async function resolveShareCardCoverDataUrl(gameIds: string[], deps: ShareCardCoverDeps = {}): Promise<string | null> {
  const ids = gameIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).slice(0, 8);
  if (ids.length === 0) return null;

  const getGame = deps.getGame ?? ((id) => db.getGameById(id));
  const resolveLocalPath = deps.resolveLocalPath ?? resolveMediaFilePath;
  const readFileBytes = deps.readFileBytes ?? readFile;
  const fetchRemote = deps.fetchRemote ?? ((url) => net.fetch(url, { signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) }));

  const games = ids.map((id) => getGame(id)).filter((g): g is Game => !!g);
  const candidates = collectCoverCandidates(games);

  for (const url of candidates) {
    try {
      if (url.startsWith('data:image/') && url.length <= MAX_COVER_BYTES * 1.4) {
        return url;
      }
      if (url.startsWith(`${MEDIA_SCHEME}://`)) {
        const filePath = await resolveLocalPath(url);
        if (!filePath) continue;
        const dataUrl = bufferToDataUrl(await readFileBytes(filePath));
        if (dataUrl) return dataUrl;
        continue;
      }
      if (url.startsWith('https://')) {
        const res = await fetchRemote(url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const dataUrl = bufferToDataUrl(buf, res.headers?.get('content-type'));
        if (dataUrl) return dataUrl;
      }
    } catch {
      continue;
    }
  }
  return null;
}
