import { ScreenshotTaken } from '../shared/types/screenshots';
import { GameListInput } from '../shared/types/lists';
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { ElectronAPI, JournalEntryInput, FetchAssetsOptions, GameLaunchStatus, MediaAssetType, TrayAction } from '@shared/types/ipc';
import { EmulatorConfig, Game, GameLog, GamePlatform } from '@shared/types/game';
import { BackupEvent, GameSaveConfig } from '@shared/types/cloudsync';
import { AccountService } from '@shared/types/accounts';
import { ProfileCustom, ProfileMediaKind, ProfileWebLink } from '@shared/types/profile';

const electronAPI: ElectronAPI = {
  // Library & Scanners
  scanAllLibraries: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_SCAN_ALL),
  scanPlatform: (platform: GamePlatform) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_SCAN_PLATFORM, platform),
  getGames: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_GET_GAMES),
  getGameById: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_GET_GAME_BY_ID, id),
  addCustomGame: (game: Partial<Game>) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_ADD_CUSTOM_GAME, game),
  updateGame: (id: string, updates: Partial<Game>) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_UPDATE_GAME, id, updates),
  deleteGame: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_DELETE_GAME, id),
  toggleFavorite: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_TOGGLE_FAVORITE, id),

  // Emuladores
  getEmulatorConfigs: () => ipcRenderer.invoke(IPC_CHANNELS.EMULATORS_GET_CONFIGS),
  saveEmulatorConfig: (config: EmulatorConfig) => ipcRenderer.invoke(IPC_CHANNELS.EMULATORS_SAVE_CONFIG, config),
  detectEmulators: () => ipcRenderer.invoke(IPC_CHANNELS.EMULATORS_DETECT),

  // Jogos Standalone / Pastas de PC
  getStandaloneDirectories: () => ipcRenderer.invoke(IPC_CHANNELS.STANDALONE_GET_DIRECTORIES),
  saveStandaloneDirectories: (directories: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.STANDALONE_SAVE_DIRECTORIES, directories),

  // Execução & Playtime
  launchGame: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_LAUNCH, gameId),
  stopGame: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_STOP, gameId),
  openGameFolder: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_OPEN_FOLDER, gameId),
  getGamePlayLength: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_GET_PLAY_LENGTH, gameId),
  getPlaytimeSessions: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_GET_PLAYTIME_SESSIONS, gameId),
  setGameLog: (gameId: string, log: GameLog) => ipcRenderer.invoke(IPC_CHANNELS.GAME_SET_LOG, gameId, log),
  addJournalEntry: (entry: JournalEntryInput) => ipcRenderer.invoke(IPC_CHANNELS.JOURNAL_ADD_ENTRY, entry),
  exportJournal: () => ipcRenderer.invoke(IPC_CHANNELS.JOURNAL_EXPORT),
  searchGameCatalog: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.JOURNAL_SEARCH_CATALOG, query),
  renameGame: (gameId: string, title: string | null) => ipcRenderer.invoke(IPC_CHANNELS.GAME_RENAME, gameId, title),
  getWishlist: () => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_GET),
  syncWishlist: () => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_SYNC),
  addToWishlist: (appId: number, name: string) => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_ADD, appId, name),
  removeFromWishlist: (appId: number) => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_REMOVE, appId),
  setWishlistTarget: (appId: number, targetCents: number | null) => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_SET_TARGET, appId, targetCents),
  openWishlistStore: (appId: number) => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_OPEN_STORE, appId),
  getBackupOverview: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_OVERVIEW),
  runBackupSweep: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RUN_SWEEP),
  getGameLists: () => ipcRenderer.invoke(IPC_CHANNELS.LISTS_GET),
  saveGameList: (input: GameListInput) => ipcRenderer.invoke(IPC_CHANNELS.LISTS_SAVE, input),
  deleteGameList: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LISTS_DELETE, id),
  setPlaytime: (gameId: string, totalSeconds: number, lastPlayedOn?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GAME_SET_PLAYTIME, gameId, totalSeconds, lastPlayedOn),
  onGameStatusChanged: (callback: (status: GameLaunchStatus) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, status: GameLaunchStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.GAME_STATUS_CHANGED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.GAME_STATUS_CHANGED, subscription);
  },

  // Metadados & SteamGridDB
  fetchGameAssets: (gameId: string, options?: FetchAssetsOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.METADATA_FETCH_ASSETS, gameId, options),
  applyGameAsset: (gameId: string, assetType: MediaAssetType, assetUrl: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.METADATA_SET_CUSTOM_ASSET, gameId, assetType, assetUrl),
  testSteamGridDbKey: (apiKey: string) => ipcRenderer.invoke(IPC_CHANNELS.METADATA_TEST_API_KEY, apiKey),
  fetchMissingArtwork: () => ipcRenderer.invoke(IPC_CHANNELS.METADATA_FETCH_MISSING),
  reportBrokenArtwork: (gameId: string, assetType: MediaAssetType) =>
    ipcRenderer.invoke(IPC_CHANNELS.METADATA_REPORT_BROKEN, gameId, assetType),
  onGameUpdated: (callback: (game: Game) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, game: Game) => callback(game);
    ipcRenderer.on(IPC_CHANNELS.LIBRARY_GAME_UPDATED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LIBRARY_GAME_UPDATED, subscription);
  },

  // Conquistas
  getAchievements: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_GET, gameId),
  syncAchievements: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_SYNC, gameId),
  testSteamCredentials: (apiKey: string, steamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_TEST_STEAM, apiKey, steamId),
  testRetroAchievementsCredentials: (username: string, apiKey: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_TEST_RETRO, username, apiKey),

  // Backup de Saves & Google Drive
  getDriveStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_STATUS),
  connectDrive: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_AUTH),
  disconnectDrive: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_DISCONNECT),
  getSaveConfig: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_GET_SAVE_CONFIG, gameId),
  setSaveConfig: (gameId: string, config: GameSaveConfig) =>
    ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_SET_SAVE_CONFIG, gameId, config),
  detectSaveLocations: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_DETECT_SAVES, gameId),
  backupSaves: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_BACKUP, gameId),
  listSaveBackups: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_LIST_BACKUPS, gameId),
  restoreSaveBackup: (gameId: string, backupId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_RESTORE, gameId, backupId),
  onBackupEvent: (callback: (event: BackupEvent) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, event: BackupEvent) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.CLOUDSYNC_BACKUP_EVENT, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CLOUDSYNC_BACKUP_EVENT, subscription);
  },
  retryDriveUploads: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_RETRY_UPLOADS),

  // Capturas de tela
  listScreenshots: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_LIST, gameId),
  importScreenshots: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_IMPORT, gameId),
  deleteScreenshot: (gameId: string, screenshotId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_DELETE, gameId, screenshotId),
  listScreenshotsByGame: () => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_BY_GAME),
  showScreenshotInFolder: (gameId: string, screenshotId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_SHOW_IN_FOLDER, gameId, screenshotId),
  moveScreenshots: (fromGameId: string, screenshotIds: string[], toGameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_MOVE, fromGameId, screenshotIds, toGameId),
  takeScreenshot: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_TAKE, gameId),
  onScreenshotTaken: (callback: (result: ScreenshotTaken) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, result: ScreenshotTaken) => callback(result);
    ipcRenderer.on(IPC_CHANNELS.SCREENSHOTS_TAKEN, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCREENSHOTS_TAKEN, subscription);
  },
  getScreenshotHotkey: () => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_GET_HOTKEY),
  setScreenshotHotkey: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_SET_HOTKEY, key),

  // Perfil do jogador
  getPlayerProfile: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET),
  getYearReview: (year?: number) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_YEAR_REVIEW, year),
  syncAllAchievements: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_SYNC_ACHIEVEMENTS),
  saveProfileCustom: (custom: ProfileCustom) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_SAVE_CUSTOM, custom),
  pickProfileMedia: (kind: ProfileMediaKind) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_PICK_MEDIA, kind),
  getProfileWebStatus: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_WEB_STATUS),
  publishProfileWeb: (repoUrl: string) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_WEB_PUBLISH, repoUrl),
  disconnectProfileWeb: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_WEB_DISCONNECT),
  openProfileWebLink: (link: ProfileWebLink) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_WEB_OPEN, link),
  exportPlayerProfile: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_EXPORT),

  // Contas
  getAccountsStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_GET_STATUS),
  listLocalSteamAccounts: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_STEAM_LOCAL),
  useLocalSteamAccount: (steamId: string) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_STEAM_USE_LOCAL, steamId),
  loginSteam: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_STEAM_LOGIN),
  loginSteamGridDb: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_SGDB_LOGIN),
  loginRetroAchievements: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RETRO_LOGIN),
  loginGoogle: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_GOOGLE_LOGIN),
  logoutAccount: (service: AccountService) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_LOGOUT, service),

  // Configurações
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  setSetting: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),

  // Janela e Sistema
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  selectFile: (filters) => ipcRenderer.invoke(IPC_CHANNELS.APP_SELECT_FILE, filters),
  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.APP_SELECT_DIRECTORY),
  rendererReady: () => ipcRenderer.invoke(IPC_CHANNELS.APP_RENDERER_READY),
  onTrayAction: (callback: (action: TrayAction) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, action: TrayAction) => callback(action);
    ipcRenderer.on(IPC_CHANNELS.APP_TRAY_ACTION, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_TRAY_ACTION, subscription);
  },
  notifyNetworkOnline: () => ipcRenderer.invoke(IPC_CHANNELS.APP_NETWORK_ONLINE),
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO),
  openLogsFolder: () => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_LOGS)
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  } catch (error) {
    console.error('Failed to expose electronAPI via contextBridge:', error);
  }
} else {
  // @ts-ignore
  window.electronAPI = electronAPI;
}
