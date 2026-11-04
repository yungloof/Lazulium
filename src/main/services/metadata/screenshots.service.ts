import { app, shell } from 'electron';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { copyFile, mkdir, readdir, readFile, stat } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { Game } from '@shared/types/game';
import { db } from '../../database/db';
import { GameScreenshots, Screenshot } from '@shared/types/screenshots';
import { findSteamPath } from '../scanners/steam-scanner.service';
import { STEAM_GRID_HOST, readSteamShortcuts } from '../scanners/steam-shortcuts';
import { normalizeKey } from '../cloudsync/save-locator.service';
import { mediaUrl, registerMediaRoot } from './media-cache.service';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;
const PREVIEW_COUNT = 6;
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const HOSTS = { steam: 'steam-shot', gamebar: 'gamebar-shot', custom: 'shot' } as const;
const THUMB_SUFFIX = '.thumb.jpg';      // Miniatura das capturas do Lazulium: a galeria não carrega o PNG inteiro
const thumbNameOf = (file: string) => `${basename(file, extname(file))}${THUMB_SUFFIX}`;

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
  // Artes personalizadas da biblioteca da Steam (usadas nos atalhos não-Steam importados)
  registerMediaRoot(STEAM_GRID_HOST, {
    resolveRoot: getSteamUserdata,
    allowPath: /^\d+\/config\/grid\/[^/]+\.(png|jpe?g|webp|ico)$/i
  });
  registerMediaRoot(HOSTS.gamebar, { resolveRoot: () => join(app.getPath('videos'), 'Captures'), allowPath: /^[^/]+\.png$/i });
  registerMediaRoot('profile', { resolveRoot: () => join(app.getPath('userData'), 'profile'), allowPath: /^((avatar|background|artwork)-[a-z0-9]+|steam\/[a-f0-9]{16})\.(png|jpe?g|webp|gif|webm|mp4)$/i });
  registerMediaRoot(HOSTS.custom, { resolveRoot: customRoot, allowPath: /^[^/]+\/[^/]+$/ });
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
    else if (game.id.startsWith('steam-shortcut-') && game.platformGameId) gameIds.push(game.platformGameId);
    else {
      const exe = game.executablePath?.toLowerCase();
      for (const s of await readSteamShortcuts(join(userdata, account))) {
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
  const files = await listImages(dir);
  for (const file of files) {
    if (file.endsWith(THUMB_SUFFIX)) continue;
    const url = mediaUrl(HOSTS.custom, `${dirName}/${file}`);
    const thumb = thumbNameOf(file);
    const thumbUrl = files.includes(thumb) ? mediaUrl(HOSTS.custom, `${dirName}/${thumb}`) : url;
    // Só as capturas da tecla têm miniatura própria
    results.push({ id: `custom:${file}`, source: files.includes(thumb) ? 'lazulium' : 'custom', url, thumbUrl, fileName: file, takenAt: await mtimeIso(join(dir, file)) });
  }
  return results;
}

class ScreenshotsService {
  // Fontes isoladas: falha em uma não esconde as outras
  private async findOnDisk(game: Game): Promise<Screenshot[]> {
    const sources = [steamScreenshots, gameBarScreenshots, customScreenshots];
    const results: Screenshot[] = [];
    for (const source of sources) {
      try {
        results.push(...(await source(game)));
      } catch (err) {
        console.warn(`[Screenshots] ${game.title}: ${(err as Error).message}`);
      }
    }
    return results;
  }

  // As do disco menos as que foram para outro jogo, mais as que vieram de outro. Mais recentes primeiro.
  async list(game: Game): Promise<Screenshot[]> {
    const moves = db.getScreenshotMoves();
    const movedAway = new Set(moves.filter((m) => m.fromGameId === game.id).map((m) => m.id));
    const results = (await this.findOnDisk(game)).filter((s) => !movedAway.has(s.id));
    const incoming = moves.filter((m) => m.toGameId === game.id);
    for (const fromGameId of new Set(incoming.map((m) => m.fromGameId))) {
      const from = db.getGameById(fromGameId);
      if (!from) continue;
      const ids = new Set(incoming.filter((m) => m.fromGameId === fromGameId).map((m) => m.id));
      results.push(...(await this.findOnDisk(from)).filter((s) => ids.has(s.id)));
    }
    return results.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  }

  // Mover de volta para o jogo de origem desfaz a mudança
  async move(from: Game, ids: string[], to: Game): Promise<void> {
    const available = new Set((await this.list(from)).map((s) => s.id));
    const moves = db.getScreenshotMoves();
    const next = moves.filter((m) => !(ids.includes(m.id) && m.toGameId === from.id));
    for (const id of ids) {
      if (!available.has(id)) throw new Error('Essa captura não existe mais: abra a galeria de novo.');
      const origin = moves.find((m) => m.id === id && m.toGameId === from.id)?.fromGameId ?? from.id;
      if (origin !== to.id) next.push({ id, fromGameId: origin, toGameId: to.id });
    }
    db.setScreenshotMoves(next);
  }

  // Caminho real de uma captura já listada para este jogo (o renderer só conhece o id)
  async resolvePath(game: Game, id: string): Promise<string | null> {
    const moved = db.getScreenshotMoves().find((m) => m.id === id && m.toGameId === game.id);
    const owner = moved ? db.getGameById(moved.fromGameId) : game;
    if (!owner) return null;
    const shot = (await this.findOnDisk(owner)).find((s) => s.id === id);
    if (!shot) return null;
    const [source, rest] = [shot.source, id.slice(id.indexOf(':') + 1)];
    if (source === 'steam') {
      const userdata = await getSteamUserdata();
      return userdata ? join(userdata, ...rest.split('/')) : null;
    }
    if (source === 'gamebar') return join(app.getPath('videos'), 'Captures', rest);
    return join(customRoot(), gameDirName(owner.id), rest);
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

  // Vai para a Lixeira do Windows (dá para recuperar), junto com a miniatura da Steam
  async deleteScreenshot(game: Game, id: string): Promise<void> {
    const path = await this.resolvePath(game, id);
    if (!path) throw new Error('Captura não encontrada.');
    await shell.trashItem(path);
    if (id.startsWith('steam:')) {
      const thumb = join(dirname(path), 'thumbnails', basename(path));
      if (existsSync(thumb)) await shell.trashItem(thumb).catch(() => undefined);
    } else if (id.startsWith('custom:')) {
      const thumb = join(dirname(path), thumbNameOf(basename(path)));
      if (existsSync(thumb)) await shell.trashItem(thumb).catch(() => undefined);
    }
    const moves = db.getScreenshotMoves();
    if (moves.some((m) => m.id === id)) db.setScreenshotMoves(moves.filter((m) => m.id !== id));
  }

  // Uma entrada por jogo com capturas, do jogo com a captura mais nova para o mais antigo
  async listByGame(games: Game[]): Promise<GameScreenshots[]> {
    const groups: GameScreenshots[] = [];
    for (const game of games) {
      const list = await this.list(game);
      if (list.length === 0) continue;
      groups.push({ gameId: game.id, title: game.title, count: list.length, latestAt: list[0].takenAt, preview: list.slice(0, PREVIEW_COUNT) });
    }
    return groups.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  }
}

export const screenshotsService = new ScreenshotsService();
