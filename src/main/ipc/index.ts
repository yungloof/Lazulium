import { app, clipboard, ipcMain, BrowserWindow, dialog, nativeImage, shell } from 'electron';
import { getLogsDir } from '../logger';
import { statSync } from 'fs';
import { dirname } from 'path';
import { writeFile } from 'fs/promises';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { db } from '../database/db';
import { EmulatorConfig, Game, GameLog, GamePlatform } from '@shared/types/game';
import { randomUUID } from 'crypto';
import { scanLibraries } from '../services/scanners';
import { detectEmulators } from '../services/scanners/emulator-detect.service';
import { playtimeService } from '../services/tracker/playtime.service';
import { artworkService } from '../services/metadata/artwork.service';
import { playLengthService } from '../services/metadata/play-length.service';
import { achievementsService } from '../services/achievements/achievements.service';
import { removeGameMedia } from '../services/metadata/media-cache.service';
import { FetchAssetsOptions, JournalEntryInput, MediaAssetType } from '@shared/types/ipc';
import { addJournalEntry, journalToCsv, journalToJson, setGameLog, setManualPlaytime } from '../services/profile/journal.service';
import { steamNamesService } from '../services/scanners/steam-names.service';
import { GameSaveConfig } from '@shared/types/cloudsync';
import { ProfileCustom, ProfileMediaKind, ProfileWebLink } from '@shared/types/profile';
import { backupService } from '../services/cloudsync/backup.service';
import { DRIVE_SETTING_KEYS, googleDriveService } from '../services/cloudsync/google-drive.service';
import { applyLoginItem, markRendererReady, notify } from '../app-shell';
import { accountsService } from '../services/accounts/accounts.service';
import { screenshotsService } from '../services/metadata/screenshots.service';
import { screenshotCaptureService } from '../services/metadata/screenshot-capture.service';
import { profileService } from '../services/profile/profile.service';
import { saveGameList } from '../services/profile/lists.service';
import { renameGame } from '../services/profile/journal.service';
import { searchGameCatalog } from '../services/metadata/game-search.service';
import { wishlistService } from '../services/metadata/wishlist.service';
import { achievementsService as achievementsForListener } from '../services/achievements/achievements.service';
import { GameListInput } from '@shared/types/lists';
import { buildYearReview } from '../services/profile/year-review.service';
import { profileWebService } from '../services/profile/profile-web.service';
import { AccountService } from '@shared/types/accounts';

// Gerenciadas só pelo main: o renderer nunca lê nem grava o token do Google
const PRIVATE_SETTING_KEYS: string[] = [
  DRIVE_SETTING_KEYS.refreshToken,
  DRIVE_SETTING_KEYS.email,
  DRIVE_SETTING_KEYS.folderId
];

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  // Eventos de execução (main -> renderer)
  screenshotCaptureService.setPidProvider((gameId) => playtimeService.getAlivePids(gameId));
  screenshotCaptureService.setListener((result) => getMainWindow()?.webContents.send(IPC_CHANNELS.SCREENSHOTS_TAKEN, result));
  playtimeService.setStatusListener((status) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.GAME_STATUS_CHANGED, status);
    if (status.state === 'running' || status.state === 'stopped') screenshotCaptureService.onGameStatus(status.gameId, status.state === 'running');
    // Sessão contabilizada (>= 15s): backup automático dos saves
    if (status.state === 'stopped' && (status.sessionSeconds ?? 0) > 0) backupService.onSessionEnded(status.gameId);
  });
  steamNamesService.setGameUpdatedListener((game) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.LIBRARY_GAME_UPDATED, game);
  });
  backupService.setBackupListener((event) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.CLOUDSYNC_BACKUP_EVENT, event);
    const title = db.getGameById(event.gameId)?.title ?? 'Jogo';
    if (event.state === 'done' && event.record) {
      notify(`Saves de ${title} salvos`, event.record.driveFileId ? 'Backup feito neste PC e no Google Drive.' : 'Backup feito neste PC.');
    } else if (event.state === 'error') {
      notify(`Backup de ${title} falhou`, event.message ?? 'Erro desconhecido.');
    }
  });
  achievementsForListener.setListUpdatedListener((gameId) => getMainWindow()?.webContents.send(IPC_CHANNELS.ACHIEVEMENTS_UPDATED, gameId));
  achievementsForListener.setGameUpdatedListener((game) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.LIBRARY_GAME_UPDATED, game);
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

  ipcMain.handle(IPC_CHANNELS.EMULATORS_DETECT, async () => {
    await detectEmulators(true);
    return db.getEmulatorConfigs();
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

  ipcMain.handle(IPC_CHANNELS.GAME_OPEN_FOLDER, async (_event, gameId: string) => {
    const game = db.getGameById(gameId);
    if (!game) throw new Error('Jogo não encontrado.');
    const isDirectory = (path: string) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    };
    // Emulador: a pasta da ROM. Steam: só a instalação (o executável seria o da própria Steam).
    const isSteamApp = game.platform === 'steam' && !game.id.startsWith('steam-shortcut-');
    const folder = [
      game.romPath && dirname(game.romPath),
      game.installPath,
      !isSteamApp && game.workingDirectory,
      !isSteamApp && game.executablePath && dirname(game.executablePath)
    ].find((path): path is string => !!path && isDirectory(path));
    if (!folder) throw new Error(`Pasta de ${game.title} não encontrada. Ela pode ter sido movida ou apagada: clique em Escanear para atualizar a biblioteca.`);
    const error = await shell.openPath(folder);
    if (error) throw new Error(`O Windows não abriu a pasta de ${game.title} (${error}). Tente abrir ${folder} pelo Explorador de Arquivos.`);
  });

  ipcMain.handle(IPC_CHANNELS.GAME_GET_PLAY_LENGTH, async (_event, gameId: string) => {
    const game = db.getGameById(gameId);
    return game ? playLengthService.get(game) : null;
  });

  // Diário
  ipcMain.handle(IPC_CHANNELS.GAME_SET_LOG, async (_event, gameId: string, log: GameLog) => {
    return setGameLog(gameId, log);
  });

  ipcMain.handle(IPC_CHANNELS.JOURNAL_ADD_ENTRY, async (_event, entry: JournalEntryInput) => {
    const game = addJournalEntry(entry);
    artworkService.enqueueMissing([game.id]);
    return game;
  });

  ipcMain.handle(IPC_CHANNELS.JOURNAL_SEARCH_CATALOG, async (_event, query: string) => searchGameCatalog(query));
  ipcMain.handle(IPC_CHANNELS.GAME_RENAME, async (_event, gameId: string, title: string | null) => {
    const game = renameGame(gameId, title);
    playLengthService.forget(game.id);
    return game;
  });
  ipcMain.handle(IPC_CHANNELS.WISHLIST_GET, async () => wishlistService.getState());
  ipcMain.handle(IPC_CHANNELS.WISHLIST_SYNC, async () => wishlistService.sync());
  ipcMain.handle(IPC_CHANNELS.WISHLIST_ADD, async (_event, appId: number, name: string) => wishlistService.add(appId, name));
  ipcMain.handle(IPC_CHANNELS.WISHLIST_REMOVE, async (_event, appId: number) => wishlistService.remove(appId));
  ipcMain.handle(IPC_CHANNELS.WISHLIST_SET_TARGET, async (_event, appId: number, cents: number | null) => wishlistService.setTarget(appId, cents));
  ipcMain.handle(IPC_CHANNELS.WISHLIST_OPEN_STORE, async (_event, appId: number) => {
    if (!Number.isInteger(appId) || appId <= 0) throw new Error('Jogo inválido.');
    await shell.openExternal(`steam://store/${appId}`);
  });
  ipcMain.handle(IPC_CHANNELS.WISHLIST_OPEN_DEALS, async (_event, appId: number) => {
    if (!Number.isInteger(appId) || appId <= 0) throw new Error('Jogo inválido.');
    await shell.openExternal(wishlistService.dealsUrl(appId));
  });
  ipcMain.handle(IPC_CHANNELS.BACKUP_OVERVIEW, async () => backupService.getOverview());
  ipcMain.handle(IPC_CHANNELS.BACKUP_RUN_SWEEP, async () => {
    await backupService.autoBackupSweep(true);
    return backupService.getOverview();
  });
  ipcMain.handle(IPC_CHANNELS.LISTS_GET, async () => db.getGameLists());
  ipcMain.handle(IPC_CHANNELS.LISTS_SAVE, async (_event, input: GameListInput) => saveGameList(input));
  ipcMain.handle(IPC_CHANNELS.LISTS_DELETE, async (_event, id: string) => db.deleteGameList(id));

  ipcMain.handle(IPC_CHANNELS.JOURNAL_EXPORT, async () => {
    const win = getMainWindow();
    const options: Electron.SaveDialogOptions = {
      title: 'Exportar diário de jogos',
      defaultPath: 'lazulium-diario.json',
      filters: [
        { name: 'Cópia completa (JSON)', extensions: ['json'] },
        { name: 'Planilha (CSV)', extensions: ['csv'] }
      ]
    };
    const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (res.canceled || !res.filePath) return null;
    await writeFile(res.filePath, res.filePath.toLowerCase().endsWith('.csv') ? journalToCsv() : journalToJson(), 'utf-8');
    return res.filePath;
  });

  ipcMain.handle(IPC_CHANNELS.GAME_SET_PLAYTIME, async (_event, gameId: string, totalSeconds: number, lastPlayedOn?: string) => {
    return setManualPlaytime(gameId, totalSeconds, lastPlayedOn);
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

  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_SET_MANUAL, async (_event, gameId: string, achievementId: string, unlocked: boolean) =>
    achievementsService.setManual(gameId, achievementId, !!unlocked)
  );
  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_ADD_CUSTOM, async (_event, gameId: string, name: string, description: string) => achievementsService.addCustom(gameId, name, description));
  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_REMOVE_CUSTOM, async (_event, gameId: string, achievementId: string) => achievementsService.removeCustom(gameId, achievementId));
  ipcMain.handle(IPC_CHANNELS.ACHIEVEMENTS_SET_LIST, async (_event, gameId: string, useMilestones: boolean) => achievementsService.setPreferMilestones(gameId, !!useMilestones));

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

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_RETRY_UPLOADS, async () => {
    return backupService.retryPendingUploads();
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDSYNC_RESTORE, async (_event, gameId: string, backupId: string) => {
    if (playtimeService.getState(gameId) !== 'stopped') {
      throw new Error('Feche o jogo antes de restaurar um save.');
    }
    return backupService.restore(gameId, backupId);
  });

  // Capturas de tela Handlers
  const requireGame = (gameId: string) => {
    const game = db.getGameById(gameId);
    if (!game) throw new Error('Jogo não encontrado.');
    return game;
  };

  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_LIST, async (_event, gameId: string) => {
    return screenshotsService.list(requireGame(gameId));
  });

  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_IMPORT, async (_event, gameId: string) => {
    const game = requireGame(gameId);
    const win = getMainWindow();
    const options: Electron.OpenDialogOptions = {
      title: `Anexar capturas a ${game.title}`,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
    };
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return res.canceled ? 0 : screenshotsService.importFiles(game, res.filePaths);
  });

  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_DELETE, async (_event, gameId: string, screenshotId: string) => {
    await screenshotsService.deleteScreenshot(requireGame(gameId), screenshotId);
  });

  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_BY_GAME, async () => {
    return screenshotsService.listByGame(db.getGames().filter((g) => !g.isHidden));
  });

  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_MOVE, async (_event, fromGameId: string, screenshotIds: string[], toGameId: string) => {
    await screenshotsService.move(requireGame(fromGameId), screenshotIds, requireGame(toGameId));
  });

  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_TAKE, async (_event, gameId: string) => screenshotCaptureService.capture(requireGame(gameId).id));
  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_GET_HOTKEY, async () => screenshotCaptureService.getHotkey());
  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_SET_HOTKEY, async (_event, key: string) => screenshotCaptureService.setHotkey(key));

  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_COPY, async (_event, gameId: string, screenshotId: string) => {
    const path = await screenshotsService.resolvePath(requireGame(gameId), screenshotId);
    if (!path) throw new Error('Essa captura não existe mais: abra a galeria de novo.');
    const image = nativeImage.createFromPath(path);
    if (image.isEmpty()) throw new Error('Não foi possível ler essa imagem. Use Mostrar na pasta para abrir o arquivo.');
    clipboard.writeImage(image);
  });

  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_SHOW_IN_FOLDER, async (_event, gameId: string, screenshotId: string) => {
    const path = await screenshotsService.resolvePath(requireGame(gameId), screenshotId);
    if (!path) throw new Error('Captura não encontrada.');
    shell.showItemInFolder(path);
  });

  // Perfil do jogador Handlers
  ipcMain.handle(IPC_CHANNELS.PROFILE_GET, async () => {
    return profileService.build();
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_YEAR_REVIEW, async (_event, year?: number) => {
    return buildYearReview(year);
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_SYNC_ACHIEVEMENTS, async () => {
    return profileService.syncAllAchievements();
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_SAVE_CUSTOM, async (_event, custom: ProfileCustom) => {
    return profileService.saveCustom(custom);
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_PICK_MEDIA, async (_event, kind: ProfileMediaKind) => {
    if (kind !== 'avatar' && kind !== 'background' && kind !== 'artwork') throw new Error('Tipo de arquivo de perfil inválido.');
    const win = getMainWindow();
    const images = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    const options: Electron.OpenDialogOptions = {
      title: { avatar: 'Escolher avatar', background: 'Escolher fundo do perfil', artwork: 'Escolher arte em destaque' }[kind],
      properties: ['openFile'],
      filters: kind === 'background' ? [{ name: 'Imagens e vídeos', extensions: [...images, 'webm', 'mp4'] }] : [{ name: 'Imagens', extensions: images }]
    };
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return res.canceled ? null : profileService.importMedia(kind, res.filePaths[0]);
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_WEB_STATUS, async () => {
    return profileWebService.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_WEB_PUBLISH, async (_event, repoUrl: string) => {
    return profileWebService.publish(repoUrl);
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_WEB_DISCONNECT, async () => {
    return profileWebService.disconnect();
  });

  // Destinos fixos: o renderer só escolhe qual deles abrir
  ipcMain.handle(IPC_CHANNELS.PROFILE_WEB_OPEN, async (_event, link: ProfileWebLink) => {
    const { repoUrl, pageUrl } = profileWebService.getStatus();
    const target =
      link === 'steam-privacy'
        ? 'https://steamcommunity.com/my/edit/settings'
        : link === 'new-repo'
        ? 'https://github.com/new?name=lazulium-perfil&visibility=public'
        : link === 'pages-settings' && repoUrl
          ? `${repoUrl}/settings/pages`
          : link === 'page'
            ? pageUrl
            : undefined;
    if (!target) throw new Error('Publique o perfil primeiro.');
    await shell.openExternal(target);
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_EXPORT, async () => {
    const win = getMainWindow();
    const options: Electron.SaveDialogOptions = {
      title: 'Exportar perfil do jogador',
      defaultPath: 'lazulium-perfil.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    };
    const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (res.canceled || !res.filePath) return null;
    const profile = profileService.toExportable(await profileService.build());
    await writeFile(res.filePath, JSON.stringify(profile, null, 2), 'utf-8');
    return res.filePath;
  });

  // Contas Handlers
  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_GET_STATUS, async () => {
    return accountsService.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_STEAM_LOCAL, async () => {
    return accountsService.listLocalSteamAccounts();
  });

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_STEAM_USE_LOCAL, async (_event, steamId: string) => {
    return accountsService.useLocalSteamAccount(steamId);
  });

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_STEAM_LOGIN, async () => {
    const status = await accountsService.loginSteamInBrowser();
    getMainWindow()?.focus();
    return status;
  });

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_SGDB_LOGIN, async () => {
    return accountsService.loginSteamGridDb(getMainWindow());
  });

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_RETRO_LOGIN, async () => {
    const status = await accountsService.loginRetroAchievements(getMainWindow());
    void profileService.syncAllAchievements();
    return status;
  });

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_GOOGLE_LOGIN, async () => {
    const status = await accountsService.loginGoogle();
    getMainWindow()?.focus();
    void backupService.retryPendingUploads(); // O que já estava só neste PC sobe sozinho
    return status;
  });

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_LOGOUT, async (_event, service: AccountService) => {
    return accountsService.logout(service);
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
    if (key === 'startWithWindows') applyLoginItem(value === 'true');
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

  // Ciclo de vida do renderer / bandeja / rede
  ipcMain.handle(IPC_CHANNELS.APP_RENDERER_READY, async () => {
    markRendererReady();
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, async () => {
    return { version: app.getVersion(), logsDir: getLogsDir() };
  });

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_LOGS, async () => {
    const error = await shell.openPath(getLogsDir());
    if (error) throw new Error(`Não foi possível abrir a pasta de logs: ${error}`);
  });

  ipcMain.handle(IPC_CHANNELS.APP_NETWORK_ONLINE, async () => {
    artworkService.enqueueMissing();
    await backupService.retryPendingUploads();
  });
}
