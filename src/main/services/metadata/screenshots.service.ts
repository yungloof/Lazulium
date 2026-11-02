import { app } from 'electron';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { copyFile, mkdir, readdir, readFile, stat, unlink } from 'fs/promises';
import { basename, extname, join } from 'path';
import { Game } from '@shared/types/game';
import { Screenshot } from '@shared/types/screenshots';
import { findSteamPath } from '../scanners/steam-scanner.service';
import { normalizeKey } from '../cloudsync/save-locator.service';
import { mediaUrl, registerMediaRoot } from './media-cache.service';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const HOSTS = { steam: 'steam-shot', gamebar: 'gamebar-shot', custom: 'shot' } as const;

// Jogos não-Steam adicionados à Steam: gameid de 64 bits = (appid do atalho << 32) | 0x02000000
const SHORTCUT_GAMEID_FLAG = 0x02000000n;

interface ShortcutEntry {
  name: string;
  exe: string;
  gameId: string;
}

function customRoot(): string {
  return join(app.getPath('userData'), 'screenshots');
}

function gameDirName(gameId: string): string {
  return gameId.replace(/[^a-z0-9._-]/gi, '_');
}

let steamUserdata: Promise<string | undefined> | undefined;
function getSteamUserdata(): Promise<string | undefined> {
  steamUserdata ??= findSteamPath().then((p) => (p ? join(p, 'userdata') : undefined));
  return steamUserdata;
}

// Deve ser chamado junto com registerMediaProtocol
export function registerScreenshotRoots(): void {
  registerMediaRoot(HOSTS.steam, {
    resolveRoot: getSteamUserdata,
    allowPath: /^\d+\/760\/remote\/\d+\/screenshots\/(thumbnails\/)?[^/]+\.(jpe?g|png)$/i
  });
  registerMediaRoot(HOSTS.gamebar, { resolveRoot: () => join(app.getPath('videos'), 'Captures'), allowPath: /^[^/]+\.png$/i });
  registerMediaRoot(HOSTS.custom, { resolveRoot: customRoot, allowPath: /^[^/]+\/[^/]+$/ });
}

// shortcuts.vdf é VDF binário: 0x00 = objeto, 0x01 = texto, 0x02 = int32, 0x08 = fim do objeto
function parseBinaryVdf(buf: Buffer): Record<string, unknown> {
  let i = 0;
  const readString = () => {
    const start = i;
    while (i < buf.length && buf[i] !== 0) i++;
    return buf.toString('utf8', start, i++);
  };
  const readObject = (): Record<string, unknown> => {
    const obj: Record<string, unknown> = {};
    while (i < buf.length) {
      const type = buf[i++];
      if (type === 0x08) return obj;
      const key = readString().toLowerCase();
      if (type === 0x00) obj[key] = readObject();
      else if (type === 0x01) obj[key] = readString();
      else if (type === 0x02) {
        obj[key] = buf.readUInt32LE(i);
        i += 4;
      } else throw new Error(`Tipo VDF binário desconhecido: ${type}`);
    }
    return obj;
  };
  return readObject();
}

async function readShortcuts(accountDir: string): Promise<ShortcutEntry[]> {
  try {
    const root = parseBinaryVdf(await readFile(join(accountDir, 'config', 'shortcuts.vdf')));
    const list = Object.values((root.shortcuts as Record<string, Record<string, unknown>>) ?? {});
    return list
      .filter((s) => typeof s.appid === 'number')
      .map((s) => ({
        name: String(s.appname ?? ''),
        exe: String(s.exe ?? '').replace(/^"|"$/g, ''),
        gameId: ((BigInt(s.appid as number) << 32n) | SHORTCUT_GAMEID_FLAG).toString()
      }));
  } catch {
    return [];
  }
}

// Nome padrão da Steam: 20231105123045_1.jpg
function steamTimestamp(fileName: string): string | undefined {
  const m = fileName.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString() : undefined;
}

async function listImages(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile() && IMAGE_EXT.test(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
}

async function mtimeIso(path: string): Promise<string> {
  return (await stat(path).catch(() => null))?.mtime.toISOString() ?? new Date(0).toISOString();
}

async function steamScreenshots(game: Game): Promise<Screenshot[]> {
  const userdata = await getSteamUserdata();
  if (!userdata) return [];
  const results: Screenshot[] = [];
  const titleKey = normalizeKey(game.title);

  for (const account of (await readdir(userdata).catch(() => [])).filter((a) => /^\d+$/.test(a))) {
    const gameIds: string[] = [];
    if (game.platform === 'steam' && game.platformGameId) gameIds.push(game.platformGameId);
    else {
      const exe = game.executablePath?.toLowerCase();
      for (const s of await readShortcuts(join(userdata, account))) {
        if ((titleKey.length >= 3 && normalizeKey(s.name) === titleKey) || (exe && s.exe.toLowerCase() === exe)) gameIds.push(s.gameId);
      }
    }

    for (const gameId of gameIds) {
      const rel = `${account}/760/remote/${gameId}/screenshots`;
      const dir = join(userdata, rel);
      for (const file of await listImages(dir)) {
        const hasThumb = existsSync(join(dir, 'thumbnails', file));
        results.push({
          id: `steam:${rel}/${file}`,
          source: 'steam',
          url: mediaUrl(HOSTS.steam, `${rel}/${file}`),
          thumbUrl: mediaUrl(HOSTS.steam, hasThumb ? `${rel}/thumbnails/${file}` : `${rel}/${file}`),
          fileName: file,
          takenAt: steamTimestamp(file) ?? (await mtimeIso(join(dir, file)))
        });
      }
    }
  }
  return results;
}

// Game Bar nomeia como "<título da janela> <data> <hora>.png"
async function gameBarScreenshots(game: Game): Promise<Screenshot[]> {
  const dir = join(app.getPath('videos'), 'Captures');
  const titleKey = normalizeKey(game.title);
  if (titleKey.length < 3) return [];
  const results: Screenshot[] = [];
  for (const file of await listImages(dir)) {
    if (extname(file).toLowerCase() !== '.png') continue;
    const namePart = file.replace(/\s+\d{1,2}[_.-]\d{1,2}[_.-]\d{2,4}.*$/, '');
    if (normalizeKey(namePart) !== titleKey) continue;
    const url = mediaUrl(HOSTS.gamebar, file);
    results.push({ id: `gamebar:${file}`, source: 'gamebar', url, thumbUrl: url, fileName: file, takenAt: await mtimeIso(join(dir, file)) });
  }
  return results;
}

async function customScreenshots(game: Game): Promise<Screenshot[]> {
  const dirName = gameDirName(game.id);
  const dir = join(customRoot(), dirName);
  const results: Screenshot[] = [];
  for (const file of await listImages(dir)) {
    const url = mediaUrl(HOSTS.custom, `${dirName}/${file}`);
    results.push({ id: `custom:${file}`, source: 'custom', url, thumbUrl: url, fileName: file, takenAt: await mtimeIso(join(dir, file)) });
  }
  return results;
}

class ScreenshotsService {
  // Fontes isoladas: falha em uma não esconde as outras. Mais recentes primeiro.
  async list(game: Game): Promise<Screenshot[]> {
    const sources = [steamScreenshots, gameBarScreenshots, customScreenshots];
    const results: Screenshot[] = [];
    for (const source of sources) {
      try {
        results.push(...(await source(game)));
      } catch (err) {
        console.warn(`[Screenshots] ${game.title}: ${(err as Error).message}`);
      }
    }
    return results.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  }

  // Caminho real de uma captura já listada para este jogo (o renderer só conhece o id)
  async resolvePath(game: Game, id: string): Promise<string | null> {
    const shot = (await this.list(game)).find((s) => s.id === id);
    if (!shot) return null;
    const [source, rest] = [shot.source, id.slice(id.indexOf(':') + 1)];
    if (source === 'steam') {
      const userdata = await getSteamUserdata();
      return userdata ? join(userdata, ...rest.split('/')) : null;
    }
    if (source === 'gamebar') return join(app.getPath('videos'), 'Captures', rest);
    return join(customRoot(), gameDirName(game.id), rest);
  }

  async importFiles(game: Game, paths: string[]): Promise<number> {
    const dir = join(customRoot(), gameDirName(game.id));
    await mkdir(dir, { recursive: true });
    let imported = 0;
    for (const path of paths) {
      if (!IMAGE_EXT.test(path)) continue;
      const info = await stat(path).catch(() => null);
      if (!info?.isFile() || info.size > MAX_IMPORT_BYTES) continue;
      // Nome com hash do conteúdo: importar a mesma imagem duas vezes não duplica
      const hash = createHash('sha1').update(await readFile(path)).digest('hex').slice(0, 10);
      const safeBase = basename(path, extname(path)).replace(/[^\w\- ]+/g, '_').slice(0, 60);
      const target = join(dir, `${safeBase}-${hash}${extname(path).toLowerCase()}`);
      if (existsSync(target)) continue;
      await copyFile(path, target);
      imported++;
    }
    return imported;
  }

  // Só capturas anexadas no Lazulium podem ser apagadas (as da Steam/Game Bar são do usuário)
  async deleteCustom(game: Game, id: string): Promise<void> {
    if (!id.startsWith('custom:')) throw new Error('Só é possível remover imagens anexadas pelo Lazulium.');
    const path = await this.resolvePath(game, id);
    if (!path) throw new Error('Captura não encontrada.');
    await unlink(path);
  }
}

export const screenshotsService = new ScreenshotsService();
