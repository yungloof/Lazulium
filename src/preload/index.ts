import { ScreenshotTaken } from '../shared/types/screenshots';
import { GameListInput } from '../shared/types/lists';
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { CeremonyEvent, ElectronAPI, JournalEntryInput, FetchAssetsOptions, GameLaunchStatus, MediaAssetType, TrayAction, UpdateStatus } from '@shared/types/ipc';
import { EmulatorConfig, Game, GameLog, GamePlatform } from '@shared/types/game';
import { BackupEvent, GameSaveConfig } from '@shared/types/cloudsync';
import { AccountService } from '@shared/types/accounts';
import { ProfileCustom, ProfileMediaKind, ProfileWebLink } from '@shared/types/profile';
import { CallEvent, PresenceState, SocialNotificationsEvent, SocialStatus } from '@shared/types/social';
import { SyncStatusState } from '@shared/types/sync';
import { CategoryRule } from '@shared/types/categories';

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
  deleteEmulatorConfig: (emulatorId: string) => ipcRenderer.invoke(IPC_CHANNELS.EMULATORS_DELETE_CONFIG, emulatorId),
  exportEmulatorPresets: () => ipcRenderer.invoke(IPC_CHANNELS.EMULATORS_EXPORT_PRESETS),
  importEmulatorPresets: () => ipcRenderer.invoke(IPC_CHANNELS.EMULATORS_IMPORT_PRESETS),
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
  pickReviewImageFile: () => ipcRenderer.invoke(IPC_CHANNELS.REVIEW_IMAGE_PICK_FILE),
  readReviewImageScreenshot: (gameId: string, screenshotId: string) => ipcRenderer.invoke(IPC_CHANNELS.REVIEW_IMAGE_READ_SCREENSHOT, gameId, screenshotId),
  saveReviewImage: (bytes: Uint8Array) => ipcRenderer.invoke(IPC_CHANNELS.REVIEW_IMAGE_SAVE, bytes),
  exportJournal: () => ipcRenderer.invoke(IPC_CHANNELS.JOURNAL_EXPORT),
  previewJournalImport: (items, options) => ipcRenderer.invoke(IPC_CHANNELS.JOURNAL_IMPORT_PREVIEW, items, options),
  applyJournalImport: (items, options) => ipcRenderer.invoke(IPC_CHANNELS.JOURNAL_IMPORT_APPLY, items, options),
  searchGameCatalog: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.JOURNAL_SEARCH_CATALOG, query),
  renameGame: (gameId: string, title: string | null) => ipcRenderer.invoke(IPC_CHANNELS.GAME_RENAME, gameId, title),
  getWishlist: () => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_GET),
  syncWishlist: () => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_SYNC),
  addToWishlist: (appId: number, name: string) => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_ADD, appId, name),
  removeFromWishlist: (appId: number) => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_REMOVE, appId),
  setWishlistTarget: (appId: number, targetCents: number | null) => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_SET_TARGET, appId, targetCents),
  openWishlistStore: (appId: number) => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_OPEN_STORE, appId),
  openWishlistDeals: (appId: number) => ipcRenderer.invoke(IPC_CHANNELS.WISHLIST_OPEN_DEALS, appId),
  getBackupOverview: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_OVERVIEW),
  runBackupSweep: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RUN_SWEEP),
  setAutoBackup: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SET_AUTO, enabled),
  exportLaunchScript: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_EXPORT_BAT, gameId),
  getGameLists: () => ipcRenderer.invoke(IPC_CHANNELS.LISTS_GET),
  saveGameList: (input: GameListInput) => ipcRenderer.invoke(IPC_CHANNELS.LISTS_SAVE, input),
  deleteGameList: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LISTS_DELETE, id),
  getGameCategories: () => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_GET),
  createGameCategory: (name: string, gameIds?: string[], rule?: CategoryRule) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_CREATE, name, gameIds, rule),
  renameGameCategory: (id: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_RENAME, id, name),
  updateGameCategoryRule: (id: string, rule: CategoryRule) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_UPDATE_RULE, id, rule),
  deleteGameCategory: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_DELETE, id),
  reorderGameCategories: (ids: string[]) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_REORDER, ids),
  setGameCategoryGames: (id: string, gameIds: string[], member: boolean) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_SET_GAMES, id, gameIds, member),
  importSteamCollections: () => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_IMPORT_STEAM),
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
  fetchGameMetadata: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.METADATA_FETCH_GAME_INFO, gameId),
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
  setManualAchievement: (gameId: string, achievementId: string, unlocked: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_SET_MANUAL, gameId, achievementId, unlocked),
  addCustomAchievement: (gameId: string, name: string, description: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_ADD_CUSTOM, gameId, name, description),
  removeCustomAchievement: (gameId: string, achievementId: string) => ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_REMOVE_CUSTOM, gameId, achievementId),
  setAchievementList: (gameId: string, useMilestones: boolean) => ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_SET_LIST, gameId, useMilestones),
  onAchievementsUpdated: (callback: (gameId: string) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, gameId: string) => callback(gameId);
    ipcRenderer.on(IPC_CHANNELS.ACHIEVEMENTS_UPDATED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ACHIEVEMENTS_UPDATED, subscription);
  },
  onCeremonyEvent: (callback: (event: CeremonyEvent) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ceremony: CeremonyEvent) => callback(ceremony);
    ipcRenderer.on(IPC_CHANNELS.CEREMONY_EVENT, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CEREMONY_EVENT, subscription);
  },
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
  copyScreenshot: (gameId: string, screenshotId: string) => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_COPY, gameId, screenshotId),
  onScreenshotTaken: (callback: (result: ScreenshotTaken) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, result: ScreenshotTaken) => callback(result);
    ipcRenderer.on(IPC_CHANNELS.SCREENSHOTS_TAKEN, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCREENSHOTS_TAKEN, subscription);
  },
  getScreenshotHotkey: () => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_GET_HOTKEY),
  setScreenshotHotkey: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_SET_HOTKEY, key),

  // Perfil do jogador
  getPlayerProfile: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET),
  getRecentActivity: (limit) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_ACTIVITY, limit),
  getOnThisDayMemories: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_ON_THIS_DAY),
  getYearReview: (year?: number) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_YEAR_REVIEW, year),
  saveYearReviewImage: (dataUrl: string, year: number) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_YEAR_REVIEW_IMAGE, dataUrl, year),
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
  loginRetroAchievements: (username: string) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RETRO_LOGIN, username),
  loginEpic: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_EPIC_LOGIN),
  importEpicPlaytime: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_EPIC_IMPORT),
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
  openLogsFolder: () => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_LOGS),

  // Atualizador automático
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
  getUpdateStatus: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_STATUS),
  quitAndInstallUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL),
  onUpdateReady: (callback: (info: { version: string }) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on(IPC_CHANNELS.UPDATER_READY, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_READY, subscription);
  },
  getSocialStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_STATUS),
  onSocialStatus: (callback: (status: SocialStatus) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, status: SocialStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.SOCIAL_STATUS_CHANGED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SOCIAL_STATUS_CHANGED, subscription);
  },
  onFriendPlaying: (callback: (text: string) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on(IPC_CHANNELS.SOCIAL_FRIEND_PLAYING, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SOCIAL_FRIEND_PLAYING, subscription);
  },
  socialLogin: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_LOGIN),
  socialLogout: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_LOGOUT),
  socialDeleteAccount: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_DELETE_ACCOUNT),
  socialUpdate: (changes) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_UPDATE, changes),
  socialSync: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_SYNC),
  socialCreateInvite: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_INVITE),
  socialAcceptInvite: (code: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_ACCEPT_INVITE, code),
  socialGetFriends: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_FRIENDS),
  socialRemoveFriend: (friendId: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_REMOVE_FRIEND, friendId),
  socialMuteFriend: (friendId: string, until: string | null) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_MUTE_FRIEND, friendId, until),
  socialUnmuteFriend: (friendId: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_UNMUTE_FRIEND, friendId),
  socialBlockUser: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_BLOCK_USER, userId),
  socialUnblockUser: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_UNBLOCK_USER, userId),
  socialGetBlocked: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_BLOCKED),
  socialGetFeed: (before?: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_FEED, before),
  socialGetFriendProfile: (friendId: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_FRIEND_PROFILE, friendId),
  socialGetFriendShowcaseUrl: (friendId: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_FRIEND_SHOWCASE, friendId),
  socialGetPresence: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_PRESENCE_GET),
  socialSetPresence: (status, durationMs) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_PRESENCE_SET, status, durationMs),
  onPresenceChanged: (callback: (state: PresenceState) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, state: PresenceState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.SOCIAL_PRESENCE_CHANGED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SOCIAL_PRESENCE_CHANGED, subscription);
  },
  socialCallFriend: (friendId: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_CALL_FRIEND, friendId),
  socialAnswerCall: (callId, answer) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_CALL_ANSWER, callId, answer),
  socialGetPendingCalls: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_CALL_PENDING),
  socialGetGameFriends: (gameIds: string[]) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GAME_FRIENDS, gameIds),
  socialCompareGames: (friendId: string) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_FRIEND_GAMES, friendId),
  socialGetReactions: (targets) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_REACTIONS, targets),
  socialGetReactionThread: (target) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_REACTION_THREAD, target),
  socialSetLike: (target, like) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_REACTION_LIKE, target, like),
  socialAddComment: (target, text) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_COMMENT_ADD, target, text),
  socialDeleteComment: (commentId) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_COMMENT_DELETE, commentId),
  socialGetNotifications: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_NOTIFICATIONS),
  socialMarkNotificationsRead: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_NOTIFICATIONS_READ),
  onSocialNotifications: (callback: (event: SocialNotificationsEvent) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, event: SocialNotificationsEvent) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.SOCIAL_NOTIFICATIONS_CHANGED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SOCIAL_NOTIFICATIONS_CHANGED, subscription);
  },
  socialGetGroupLists: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LISTS),
  socialGetGroupList: (listId) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LIST_GET, listId),
  socialCreateGroupList: (input) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LIST_CREATE, input),
  socialUpdateGroupList: (listId, input) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LIST_UPDATE, listId, input),
  socialDeleteGroupList: (listId) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LIST_DELETE, listId),
  socialAddGroupListMember: (listId, userId) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LIST_ADD_MEMBER, listId, userId),
  socialRemoveGroupListMember: (listId, userId) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LIST_REMOVE_MEMBER, listId, userId),
  socialAddGroupListGame: (listId, gameId) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LIST_ADD_GAME, listId, gameId),
  socialRemoveGroupListGame: (listId, titleKey) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LIST_REMOVE_GAME, listId, titleKey),
  socialReorderGroupListGames: (listId, titleKeys) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_GROUP_LIST_REORDER, listId, titleKeys),
  socialSyncLibraryGet: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_SYNC_LIBRARY_GET),
  socialSyncLibrarySet: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_SYNC_LIBRARY_SET, enabled),
  socialSyncLibraryNow: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_SYNC_LIBRARY_NOW),
  socialSyncLibraryClearCloud: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_SYNC_LIBRARY_CLEAR),
  onSocialSyncLibraryStatus: (callback: (status: SyncStatusState) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, status: SyncStatusState) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.SOCIAL_SYNC_LIBRARY_STATUS_CHANGED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SOCIAL_SYNC_LIBRARY_STATUS_CHANGED, subscription);
  },
  onLibrarySyncApplied: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on(IPC_CHANNELS.SOCIAL_SYNC_LIBRARY_APPLIED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SOCIAL_SYNC_LIBRARY_APPLIED, subscription);
  },
  socialTestCall: () => ipcRenderer.invoke(IPC_CHANNELS.SOCIAL_CALL_TEST),
  onCallEvent: (callback: (event: CallEvent) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, event: CallEvent) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.SOCIAL_CALL_EVENT, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SOCIAL_CALL_EVENT, subscription);
  },
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.UPDATER_STATUS, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_STATUS, subscription);
  },

  // Atalhos da Steam
  addSteamShortcut: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.STEAM_ADD_SHORTCUT, gameId),
  removeSteamShortcut: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.STEAM_REMOVE_SHORTCUT, gameId)
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
