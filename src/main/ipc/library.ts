import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { Game, GamePlatform } from '@shared/types/game';
import { GameListInput } from '@shared/types/lists';
import { db } from '../database/db';
import { markLibraryServed } from '../app-shell';
import { scanLibraries } from '../services/scanners';
import { playtimeService } from '../services/tracker/playtime.service';
import { CategoryRule } from '@shared/types/categories';
import { artworkService } from '../services/metadata/artwork.service';
import { gameMetadataService } from '../services/metadata/game-metadata.service';
import { removeGameMedia } from '../services/metadata/media-cache.service';
import { saveGameList } from '../services/profile/lists.service';
import { createCategory, deleteCategory, renameCategory, reorderCategories, setCategoryGames, updateCategoryRule } from '../services/library/categories.service';
import { importSteamCollections } from '../services/library/steam-collections.service';
import { sendToRenderer } from './events';
import { addGameToSteam, removeGameFromSteam } from '../services/steam/steam-shortcut-writer.service';
import { cleanPath, handle } from './helpers';

// Campos de caminho aceitos do renderer: sem aspas e sem barra no fim
const PATH_FIELDS = ['executablePath', 'workingDirectory', 'installPath', 'romPath'] as const;

function cleanGameUpdates(updates: Partial<Game>): Partial<Game> {
  // id e estado de execução não são editáveis: mudar o id criaria um segundo jogo
  const { id: _id, isRunning: _running, ...rest } = updates ?? {};
  for (const field of PATH_FIELDS) {
    if (field in rest) rest[field] = field === 'executablePath' ? (cleanPath(rest[field]) ?? '') : cleanPath(rest[field]);
  }
  return rest;
}

async function scanAndQueueArtwork(platforms?: GamePlatform[]) {
  const result = await scanLibraries(platforms);
  artworkService.enqueueMissing();
  gameMetadataService.enqueueMissing();
  return result;
}

export function registerLibraryHandlers(): void {
  handle(IPC_CHANNELS.LIBRARY_GET_GAMES, () => {
    const games = db.getGames().map((g) => ({ ...g, isRunning: playtimeService.getState(g.id) === 'running' }));
    markLibraryServed();
    return games;
  });

  handle(IPC_CHANNELS.LIBRARY_GET_GAME_BY_ID, (_event, id: string) => db.getGameById(id));

  handle(IPC_CHANNELS.LIBRARY_ADD_CUSTOM_GAME, (_event, partialGame: Partial<Game>) => {
    const now = new Date().toISOString();
    const workingDirectory = cleanPath(partialGame.workingDirectory);
    const saved = db.upsertGame({
      id: `custom-${randomUUID()}`,
      title: partialGame.title?.trim() || 'Novo Jogo',
      platform: partialGame.platform || 'standalone',
      executablePath: cleanPath(partialGame.executablePath) ?? '',
      launchArguments: partialGame.launchArguments?.trim() || undefined,
      workingDirectory,
      installPath: workingDirectory,
      emulatorId: partialGame.emulatorId,
      romPath: cleanPath(partialGame.romPath),
      media: partialGame.media || {},
      isFavorite: false,
      isHidden: false,
      tags: partialGame.tags || ['Custom'],
      totalPlaytimeSeconds: 0,
      createdAt: now,
      updatedAt: now
    });
    artworkService.enqueueMissing([saved.id]);
    gameMetadataService.enqueueMissing([saved.id]);
    return saved;
  });

  handle(IPC_CHANNELS.LIBRARY_UPDATE_GAME, (_event, id: string, updates: Partial<Game>) => {
    const existing = db.getGameById(id);
    if (!existing) throw new Error('Jogo não encontrado. Ele pode ter sido removido da biblioteca.');
    return db.upsertGame({ ...existing, ...cleanGameUpdates(updates) });
  });

  handle(IPC_CHANNELS.LIBRARY_DELETE_GAME, async (_event, id: string) => {
    const deleted = db.deleteGame(id);
    if (deleted) await removeGameMedia(id).catch((err) => console.warn('[IPC] Artes do jogo removido ficaram no disco:', (err as Error).message));
    return deleted;
  });

  handle(IPC_CHANNELS.LIBRARY_TOGGLE_FAVORITE, (_event, id: string) => db.toggleFavorite(id));

  handle(IPC_CHANNELS.LIBRARY_SCAN_ALL, () => {
    console.log('[IPC] Escanear: todas as plataformas');
    return scanAndQueueArtwork();
  });

  handle(IPC_CHANNELS.LIBRARY_SCAN_PLATFORM, (_event, platform: GamePlatform) => {
    console.log(`[IPC] Escanear: ${platform}`);
    return scanAndQueueArtwork([platform]);
  });

  // Pastas de jogos soltos no PC
  handle(IPC_CHANNELS.STANDALONE_GET_DIRECTORIES, () => db.getStandaloneDirectories());
  handle(IPC_CHANNELS.STANDALONE_SAVE_DIRECTORIES, (_event, directories: string[]) =>
    db.saveStandaloneDirectories((Array.isArray(directories) ? directories : []).map((d) => cleanPath(String(d)) ?? ''))
  );

  // Listas de jogos
  handle(IPC_CHANNELS.LISTS_GET, () => db.getGameLists());
  handle(IPC_CHANNELS.LISTS_SAVE, (_event, input: GameListInput) => saveGameList(input));
  handle(IPC_CHANNELS.LISTS_DELETE, (_event, id: string) => db.deleteGameList(id));

  // Categorias da biblioteca
  handle(IPC_CHANNELS.CATEGORIES_GET, () => db.getGameCategories());
  handle(IPC_CHANNELS.CATEGORIES_CREATE, (_event, name: string, gameIds?: string[], rule?: CategoryRule) => createCategory(name, gameIds, rule));
  handle(IPC_CHANNELS.CATEGORIES_RENAME, (_event, id: string, name: string) => renameCategory(id, name));
  handle(IPC_CHANNELS.CATEGORIES_UPDATE_RULE, (_event, id: string, rule: CategoryRule) => updateCategoryRule(id, rule));
  handle(IPC_CHANNELS.CATEGORIES_DELETE, (_event, id: string) => deleteCategory(id));
  handle(IPC_CHANNELS.CATEGORIES_REORDER, (_event, ids: string[]) => reorderCategories(ids));
  handle(IPC_CHANNELS.CATEGORIES_SET_GAMES, (_event, id: string, gameIds: string[], member: boolean) => setCategoryGames(id, gameIds, member));
  handle(IPC_CHANNELS.CATEGORIES_IMPORT_STEAM, async () => {
    const { result, updatedGames } = await importSteamCollections();
    for (const game of updatedGames) sendToRenderer(IPC_CHANNELS.LIBRARY_GAME_UPDATED, game);
    return result;
  });

  // Integração com atalhos da Steam (shortcuts.vdf)
  handle(IPC_CHANNELS.STEAM_ADD_SHORTCUT, async (_event, gameId: string) => {
    const game = db.getGameById(gameId);
    if (!game) throw new Error('Jogo não encontrado na biblioteca.');
    return await addGameToSteam(game);
  });

  handle(IPC_CHANNELS.STEAM_REMOVE_SHORTCUT, async (_event, gameId: string) => {
    const game = db.getGameById(gameId);
    if (!game) throw new Error('Jogo não encontrado na biblioteca.');
    return await removeGameFromSteam(game);
  });
}
