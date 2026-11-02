import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { db } from '../database/db';
import { EmulatorConfig, Game, GamePlatform } from '@shared/types/game';
import { randomUUID } from 'crypto';
import { scanLibraries } from '../services/scanners';
import { playtimeService } from '../services/tracker/playtime.service';
import { artworkService } from '../services/metadata/artwork.service';
import { achievementsService } from '../services/achievements/achievements.service';
import { removeGameMedia } from '../services/metadata/media-cache.service';
import { FetchAssetsOptions, MediaAssetType } from '@shared/types/ipc';
import { GameSaveConfig } from '@shared/types/cloudsync';
import { backupService } from '../services/cloudsync/backup.service';
import { DRIVE_SETTING_KEYS, googleDriveService } from '../services/cloudsync/google-drive.service';

// Gerenciadas só pelo main: o renderer nunca lê nem grava o token do Google
const PRIVATE_SETTING_KEYS: string[] = [
  DRIVE_SETTING_KEYS.refreshToken,
  DRIVE_SETTING_KEYS.email,
  DRIVE_SETTING_KEYS.folderId
];

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  // Eventos de execução (main -> renderer)
  playtimeService.setStatusListener((status) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.GAME_STATUS_CHANGED, status);
    // Sessão contabilizada (>= 15s): backup automático dos saves
    if (status.state === 'stopped' && (status.sessionSeconds ?? 0) > 0) backupService.onSessionEnded(status.gameId);
  });
  backupService.setBackupListener((event) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.CLOUDSYNC_BACKUP_EVENT, event);
  });
  artworkService.setGameUpdatedListener((game) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.LIBRARY_GAME_UPDATED, game);
  });

  // Library Handlers
  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_GAMES, async () => {
    return db.getGames().map((g) => ({ ...g, isRunning: playtimeService.getState(g.id) === 'running' }));
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
    const saved = db.upsertGame(newGame);
    artworkService.enqueueMissing([saved.id]);
    return saved;
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_UPDATE_GAME, async (_event, id: string, updates: Partial<Game>) => {
    const existing = db.getGameById(id);
    if (!existing) throw new Error(`Game with id ${id} not found`);
    const updated = { ...existing, ...updates };
    return db.upsertGame(updated);
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_DELETE_GAME, async (_event, id: string) => {
    const deleted = db.deleteGame(id);
    if (deleted) await removeGameMedia(id).catch(() => undefined);
    return deleted;
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_TOGGLE_FAVORITE, async (_event, id: string) => {
    return db.toggleFavorite(id);
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SCAN_ALL, async () => {
    console.log('[IPC] Scanning all platform libraries...');
    const result = await scanLibraries();
    artworkService.enqueueMissing();
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SCAN_PLATFORM, async (_event, platform: GamePlatform) => {
    console.log(`[IPC] Scanning platform: ${platform}`);
    const result = await scanLibraries([platform]);
    artworkService.enqueueMissing();
    return result;
  });

  // Emulator Handlers
  ipcMain.handle(IPC_CHANNELS.EMULATORS_GET_CONFIGS, async () => {
    return db.getEmulatorConfigs();
  });

  ipcMain.handle(IPC_CHANNELS.EMULATORS_SAVE_CONFIG, async (_event, config: EmulatorConfig) => {
    return db.saveEmulatorConfig(config);
  });

  // Standalone Directory Handlers
  ipcMain.handle(IPC_CHANNELS.STANDALONE_GET_DIRECTORIES, async () => {
    return db.getStandaloneDirectories();
  });

  ipcMain.handle(IPC_CHANNELS.STANDALONE_SAVE_DIRECTORIES, async (_event, directories: string[]) => {
    return db.saveStandaloneDirectories(directories);
  });

  // Playtime & Execution Handlers
  ipcMain.handle(IPC_CHANNELS.GAME_LAUNCH, async (_event, gameId: string) => {
    return playtimeService.launch(gameId);
  });

  ipcMain.handle(IPC_CHANNELS.GAME_STOP, async (_event, gameId: string) => {
    return playtimeService.stop(gameId);
  });

  ipcMain.handle(IPC_CHANNELS.GAME_GET_PLAYTIME_SESSIONS, async (_event, gameId: string) => {
    return db.getPlaytimeSessions(gameId);
  });

  // Achievements Handlers
  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_GET, async (_event, gameId: string) => {
    return achievementsService.getAchievements(gameId, false);
  });

  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_SYNC, async (_event, gameId: string) => {
    return achievementsService.getAchievements(gameId, true);
  });

  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_TEST_STEAM, async (_event, apiKey: string, steamId: string) => {
    return achievementsService.testSteam(apiKey, steamId);
  });

  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_TEST_RETRO, async (_event, username: string, apiKey: string) => {
    return achievementsService.testRetro(username, apiKey);
  });

  // Metadata / SteamGridDB Handlers
  ipcMain.handle(IPC_CHANNELS.METADATA_FETCH_ASSETS, async (_event, gameId: string, options?: FetchAssetsOptions) => {
    return artworkService.fetchAssets(gameId, options);
  });

  ipcMain.handle(IPC_CHANNELS.METADATA_SET_CUSTOM_ASSET, async (_event, gameId: string, assetType: MediaAssetType, url: string) => {
    return artworkService.applyAsset(gameId, assetType, url);
  });

  ipcMain.handle(IPC_CHANNELS.METADATA_TEST_API_KEY, async (_event, apiKey: string) => {
    return artworkService.testKey(apiKey);
  });

  ipcMain.handle(IPC_CHANNELS.METADATA_FETCH_MISSING, async () => {
    return artworkService.enqueueMissing();
  });

  ipcMain.handle(IPC_CHANNELS.METADATA_REPORT_BROKEN, async (_event, gameId: string, assetType: MediaAssetType) => {
    await artworkService.reportBroken(gameId, assetType);
  });

  // Backup de Saves & Google Drive Handlers
  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_STATUS, async () => {
    return googleDriveService.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_AUTH, async () => {
    const status = await googleDriveService.connect();
    getMainWindow()?.focus();
    return status;
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_DISCONNECT, async () => {
    return googleDriveService.disconnect();
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_GET_SAVE_CONFIG, async (_event, gameId: string) => {
    return backupService.getConfig(gameId);
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_SET_SAVE_CONFIG, async (_event, gameId: string, config: GameSaveConfig) => {
    return backupService.setConfig(gameId, config);
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_DETECT_SAVES, async (_event, gameId: string) => {
    return backupService.detect(gameId);
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_BACKUP, async (_event, gameId: string) => {
    return backupService.backupNow(gameId, 'manual');
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_LIST_BACKUPS, async (_event, gameId: string) => {
    return backupService.listBackups(gameId);
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_RESTORE, async (_event, gameId: string, backupId: string) => {
    if (playtimeService.getState(gameId) !== 'stopped') {
      throw new Error('Feche o jogo antes de restaurar um save.');
    }
    return backupService.restore(gameId, backupId);
  });

  // Settings Handlers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    const settings = db.getSettings();
    for (const key of PRIVATE_SETTING_KEYS) delete settings[key];
    return settings;
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, key: string, value: string) => {
    if (PRIVATE_SETTING_KEYS.includes(key)) throw new Error(`Configuração somente leitura: ${key}`);
    db.setSetting(key, value);
    if (key === 'steamGridDbApiKey' && value.trim()) artworkService.enqueueMissing();
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
