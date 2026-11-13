import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Game } from '@shared/types/game';
import { GameCategory, MAX_CATEGORY_NAME, SteamCollectionsImportResult } from '@shared/types/categories';
import { db } from '../../database/db';
import { findSteamPath, getAccountDirs } from '../scanners/steam-scanner.service';

export interface ParsedSteamCollection {
  key: string;
  id: string;
  name: string;
  steamAppIds: string[];
  isFavorite: boolean;
  isHidden: boolean;
  isDynamic: boolean;
}

const normalizeNameKey = (name: string): string =>
  name
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

const MAX_CATEGORIES = 200;

function toAppIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'number' && Number.isFinite(item) && item > 0) out.push(String(Math.trunc(item)));
    else if (typeof item === 'string' && /^\d+$/.test(item.trim())) out.push(item.trim());
  }
  return out;
}

// Lê as coleções de `cloud-storage-namespace-1.json` (array `[chave, registro]`) sem depender de chave da Steam
export function parseSteamCloudStorage(raw: unknown): ParsedSteamCollection[] {
  if (!Array.isArray(raw)) return [];
  const collections: ParsedSteamCollection[] = [];

  for (const entry of raw) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
    const key = entry[0];
    if (!key.startsWith('user-collections.')) continue;

    const record = entry[1];
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const rec = record as Record<string, unknown>;
    if (rec.is_deleted === true || typeof rec.value !== 'string' || !rec.value.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rec.value);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const val = parsed as Record<string, unknown>;

    const id = typeof val.id === 'string' && val.id.trim() ? val.id.trim() : key.slice('user-collections.'.length);
    const rawName = typeof val.name === 'string' ? val.name.replace(/\s+/g, ' ').trim() : '';
    const isFavorite = key === 'user-collections.favorite' || id === 'favorite';
    const isHidden = key === 'user-collections.hidden' || id === 'hidden';
    if (!rawName && !isFavorite && !isHidden) continue;

    const removed = new Set(toAppIdList(val.removed));
    const steamAppIds = [...new Set(toAppIdList(val.added).filter((appId) => !removed.has(appId)))];

    collections.push({
      key,
      id,
      name: rawName || (isFavorite ? 'Favoritos' : 'Ocultos'),
      steamAppIds,
      isFavorite,
      isHidden,
      isDynamic: Boolean(val.filterSpec)
    });
  }

  return collections;
}

async function readSteamCollectionsFile(): Promise<ParsedSteamCollection[]> {
  const steamPath = await findSteamPath();
  if (!steamPath) throw new Error('Pasta da Steam não encontrada neste computador.');

  const accountDirs = await getAccountDirs(steamPath);
  const candidates = await Promise.all(
    accountDirs.map(async (accountDir) => {
      const filePath = join(accountDir, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json');
      try {
        const info = await stat(filePath);
        return { filePath, mtimeMs: info.mtimeMs };
      } catch {
        return null;
      }
    })
  );
  const ordered = candidates
    .filter((item): item is { filePath: string; mtimeMs: number } => item !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const { filePath } of ordered) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      return parseSteamCloudStorage(parsed);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') continue;
      console.warn(`[Steam] Falha ao ler coleções em ${filePath}:`, (err as Error).message);
    }
  }

  throw new Error('Nenhuma coleção da Steam encontrada neste PC. Abra a Steam uma vez para ela baixar suas coleções.');
}

function uniqueCategoryName(baseName: string, categories: GameCategory[]): string {
  const clean = baseName.replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY_NAME);
  if (!categories.some((c) => normalizeNameKey(c.name) === normalizeNameKey(clean))) return clean;
  const suffix = ' (Steam)';
  return `${clean.slice(0, MAX_CATEGORY_NAME - suffix.length).trimEnd()}${suffix}`;
}

export async function importSteamCollections(): Promise<{ result: SteamCollectionsImportResult; updatedGames: Game[] }> {
  const parsed = await readSteamCollectionsFile();

  const gameIdByAppId = new Map<string, string>();
  for (const game of db.getGames()) {
    if (game.platform === 'steam' && game.platformGameId) {
      gameIdByAppId.set(game.platformGameId, game.id);
    }
  }

  const nextCategories = [...db.getGameCategories()];
  const updatedGames: Game[] = [];
  let created = 0;
  let merged = 0;
  let linksAdded = 0;
  let favoritesAdded = 0;
  let skippedDynamic = 0;
  let skippedEmpty = 0;

  for (const col of parsed) {
    const matchedIds = [...new Set(col.steamAppIds.map((appId) => gameIdByAppId.get(appId)).filter((id): id is string => Boolean(id)))];

    if (col.isHidden) continue;

    if (col.isFavorite) {
      for (const gameId of matchedIds) {
        const game = db.getGameById(gameId);
        if (game && !game.isFavorite) {
          updatedGames.push({ ...game, isFavorite: true, updatedAt: new Date().toISOString() });
          favoritesAdded++;
        }
      }
      continue;
    }

    if (matchedIds.length === 0) {
      if (col.isDynamic) skippedDynamic++;
      else skippedEmpty++;
      continue;
    }

    const nameKey = normalizeNameKey(col.name);
    const existingIndex = nextCategories.findIndex((c) => normalizeNameKey(c.name) === nameKey);

    if (existingIndex >= 0 && !nextCategories[existingIndex].rule) {
      const existing = nextCategories[existingIndex];
      const before = new Set(existing.gameIds);
      const addedHere = matchedIds.filter((id) => !before.has(id));
      if (addedHere.length > 0) {
        nextCategories[existingIndex] = {
          ...existing,
          gameIds: [...existing.gameIds, ...addedHere],
          updatedAt: new Date().toISOString()
        };
        linksAdded += addedHere.length;
        merged++;
      }
      continue;
    }

    if (nextCategories.length >= MAX_CATEGORIES) continue;
    const categoryName = existingIndex >= 0 ? uniqueCategoryName(col.name, nextCategories) : col.name.slice(0, MAX_CATEGORY_NAME);
    if (!categoryName || nextCategories.some((c) => normalizeNameKey(c.name) === normalizeNameKey(categoryName))) continue;

    const now = new Date().toISOString();
    nextCategories.push({
      id: randomUUID(),
      name: categoryName,
      gameIds: matchedIds,
      createdAt: now,
      updatedAt: now
    });
    created++;
    linksAdded += matchedIds.length;
  }

  if (updatedGames.length > 0) db.upsertGames(updatedGames);
  const savedCategories = db.setGameCategories(nextCategories);

  return {
    result: {
      categories: savedCategories,
      created,
      merged,
      linksAdded,
      favoritesAdded,
      skippedDynamic,
      skippedEmpty
    },
    updatedGames
  };
}
