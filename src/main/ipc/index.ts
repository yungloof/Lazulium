import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { db } from '../database/db';
import { EmulatorConfig, Game, GamePlatform } from '@shared/types/game';
import { randomUUID } from 'crypto';
import { scanLibraries } from '../services/scanners';

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  // Library Handlers
  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_GAMES, async () => {
    return db.getGames();
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_GAME_BY_ID, async (_event, id: string) => {
    return db.getGameById(id);
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_ADD_CUSTOM_GAME, async (_event, partialGame: Partial<Game>) => {
    const id = `custom-${randomUUID()}`;
    const newGame: Game = {
      id,
      title: partialGame.title?.trim() || 'Novo Jogo',
      platform: partialGame.platform || 'standalone',
      executablePath: partialGame.executablePath?.trim() || '',
      launchArguments: partialGame.launchArguments?.trim() || undefined,
      workingDirectory: partialGame.workingDirectory?.trim() || undefined,
      installPath: partialGame.workingDirectory?.trim() || undefined,
      emulatorId: partialGame.emulatorId,
      romPath: partialGame.romPath,
      media: partialGame.media || {},
      isFavorite: false,
      isHidden: false,
      tags: partialGame.tags || ['Custom'],
      totalPlaytimeSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return db.upsertGame(newGame);
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_UPDATE_GAME, async (_event, id: string, updates: Partial<Game>) => {
    const existing = db.getGameById(id);
    if (!existing) throw new Error(`Game with id ${id} not found`);
    const updated = { ...existing, ...updates };
    return db.upsertGame(updated);
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_DELETE_GAME, async (_event, id: string) => {
    return db.deleteGame(id);
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_TOGGLE_FAVORITE, async (_event, id: string) => {
    return db.toggleFavorite(id);
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SCAN_ALL, async () => {
    console.log('[IPC] Scanning all platform libraries...');
    return scanLibraries();
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SCAN_PLATFORM, async (_event, platform: GamePlatform) => {
    console.log(`[IPC] Scanning platform: ${platform}`);
    return scanLibraries([platform]);
  });

  // Emulator Handlers
  ipcMain.handle(IPC_CHANNELS.EMULATORS_GET_CONFIGS, async () => {
    return db.getEmulatorConfigs();
  });

  ipcMain.handle(IPC_CHANNELS.EMULATORS_SAVE_CONFIG, async (_event, config: EmulatorConfig) => {
    return db.saveEmulatorConfig(config);
  });

  // Playtime & Execution Handlers
  ipcMain.handle(IPC_CHANNELS.GAME_LAUNCH, async (_event, gameId: string) => {
    const game = db.getGameById(gameId);
    if (!game) return false;
    console.log(`[IPC] Launching game: ${game.title} (${game.executablePath})`);
    // Will be fully implemented with process-monitor in Phase 3
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.GAME_STOP, async (_event, gameId: string) => {
    console.log(`[IPC] Stopping game: ${gameId}`);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.GAME_GET_PLAYTIME_SESSIONS, async (_event, gameId: string) => {
    return db.getPlaytimeSessions(gameId);
  });

  // Achievements Handlers
  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_GET, async (_event, gameId: string) => {
    return db.getAchievements(gameId);
  });

  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_SYNC, async (_event, gameId: string) => {
    console.log(`[IPC] Syncing achievements for: ${gameId}`);
    return db.getAchievements(gameId);
  });

  // Metadata / SteamGridDB Handlers
  ipcMain.handle(IPC_CHANNELS.METADATA_FETCH_ASSETS, async (_event, gameId: string) => {
    console.log(`[IPC] Fetching assets for: ${gameId}`);
    return { grids: [], heroes: [], logos: [], icons: [] };
  });

  ipcMain.handle(IPC_CHANNELS.METADATA_SET_CUSTOM_ASSET, async (_event, gameId: string, assetType: 'cover' | 'hero' | 'logo' | 'icon', url: string) => {
    const game = db.getGameById(gameId);
    if (!game) throw new Error('Game not found');
    if (!game.media) game.media = {};
    if (assetType === 'cover') game.media.coverUrl = url;
    if (assetType === 'hero') game.media.heroUrl = url;
    if (assetType === 'logo') game.media.logoUrl = url;
    if (assetType === 'icon') game.media.iconUrl = url;
    return db.upsertGame(game);
  });

  // Cloud Sync Handlers
  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_STATUS, async () => {
    return { authenticated: false };
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_BACKUP, async (_event, gameId: string) => {
    return { success: false, message: 'Google Drive sync não configurado ainda.' };
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_RESTORE, async (_event, gameId: string) => {
    return { success: false, message: 'Google Drive sync não configurado ainda.' };
  });

  // Settings Handlers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    return db.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, key: string, value: string) => {
    db.setSetting(key, value);
  });

  // Window Controls
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, async () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async () => {
    getMainWindow()?.close();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, async () => {
    return getMainWindow()?.isMaximized() ?? false;
  });

  // File & Directory Pickers
  ipcMain.handle(IPC_CHANNELS.APP_SELECT_FILE, async (_event, filters?: { name: string; extensions: string[] }[]) => {
    const win = getMainWindow();
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: filters || [{ name: 'Executáveis', extensions: ['exe', 'bat', 'cmd'] }]
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.APP_SELECT_DIRECTORY, async () => {
    const win = getMainWindow();
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    return res.canceled ? null : res.filePaths[0];
  });
}
