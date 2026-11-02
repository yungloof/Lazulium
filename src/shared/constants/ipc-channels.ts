export const IPC_CHANNELS = {
  // Library & Scanners
  LIBRARY_SCAN_ALL: 'library:scan-all',
  LIBRARY_SCAN_PLATFORM: 'library:scan-platform',
  LIBRARY_GET_GAMES: 'library:get-games',
  LIBRARY_GET_GAME_BY_ID: 'library:get-game-by-id',
  LIBRARY_ADD_CUSTOM_GAME: 'library:add-custom-game',
  LIBRARY_UPDATE_GAME: 'library:update-game',
  LIBRARY_DELETE_GAME: 'library:delete-game',
  LIBRARY_TOGGLE_FAVORITE: 'library:toggle-favorite',

  // Emulators
  EMULATORS_GET_CONFIGS: 'emulators:get-configs',
  EMULATORS_SAVE_CONFIG: 'emulators:save-config',

  // Standalone / PC Game Folders
  STANDALONE_GET_DIRECTORIES: 'standalone:get-directories',
  STANDALONE_SAVE_DIRECTORIES: 'standalone:save-directories',

  // Game Execution & Playtime Tracker
  GAME_LAUNCH: 'game:launch',
  GAME_STOP: 'game:stop',
  GAME_STATUS_CHANGED: 'game:status-changed',
  GAME_GET_PLAYTIME_SESSIONS: 'game:get-playtime-sessions',
  GAME_SET_PLAYTIME: 'game:set-playtime',

  // SteamGridDB & Media Metadata
  METADATA_FETCH_ASSETS: 'metadata:fetch-assets',
  METADATA_SET_CUSTOM_ASSET: 'metadata:set-custom-asset',
  METADATA_TEST_API_KEY: 'metadata:test-api-key',
  METADATA_FETCH_MISSING: 'metadata:fetch-missing',
  METADATA_REPORT_BROKEN: 'metadata:report-broken',
  LIBRARY_GAME_UPDATED: 'library:game-updated',

  // Achievements
  ACHIEVEMENTS_GET: 'achievements:get',
  ACHIEVEMENTS_SYNC: 'achievements:sync',
  ACHIEVEMENTS_TEST_STEAM: 'achievements:test-steam',
  ACHIEVEMENTS_TEST_RETRO: 'achievements:test-retro',

  // Cloud Sync (Google Drive)
  CLOUDSYNC_STATUS: 'cloudsync:status',
  CLOUDSYNC_AUTH: 'cloudsync:auth',
  CLOUDSYNC_DISCONNECT: 'cloudsync:disconnect',
  CLOUDSYNC_GET_SAVE_CONFIG: 'cloudsync:get-save-config',
  CLOUDSYNC_SET_SAVE_CONFIG: 'cloudsync:set-save-config',
  CLOUDSYNC_DETECT_SAVES: 'cloudsync:detect-saves',
  CLOUDSYNC_BACKUP: 'cloudsync:backup',
  CLOUDSYNC_LIST_BACKUPS: 'cloudsync:list-backups',
  CLOUDSYNC_RESTORE: 'cloudsync:restore',
  CLOUDSYNC_BACKUP_EVENT: 'cloudsync:backup-event',

  // Settings & Configuration
  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_SET: 'settings:set',

  // System & Window Controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  APP_SELECT_FILE: 'app:select-file',
  APP_SELECT_DIRECTORY: 'app:select-directory',
  APP_RENDERER_READY: 'app:renderer-ready',
  APP_TRAY_ACTION: 'app:tray-action',
  APP_NETWORK_ONLINE: 'app:network-online'
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
