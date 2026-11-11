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
  EMULATORS_DETECT: 'emulators:detect',
  EMULATORS_DELETE_CONFIG: 'emulators:delete-config',
  EMULATORS_EXPORT_PRESETS: 'emulators:export-presets',
  EMULATORS_IMPORT_PRESETS: 'emulators:import-presets',

  // Standalone / PC Game Folders
  STANDALONE_GET_DIRECTORIES: 'standalone:get-directories',
  STANDALONE_SAVE_DIRECTORIES: 'standalone:save-directories',

  // Game Execution & Playtime Tracker
  GAME_LAUNCH: 'game:launch',
  GAME_STOP: 'game:stop',
  GAME_OPEN_FOLDER: 'game:open-folder',
  GAME_GET_PLAY_LENGTH: 'game:get-play-length',
  GAME_STATUS_CHANGED: 'game:status-changed',
  GAME_GET_PLAYTIME_SESSIONS: 'game:get-playtime-sessions',
  GAME_SET_PLAYTIME: 'game:set-playtime',
  GAME_SET_LOG: 'game:set-log',
  JOURNAL_ADD_ENTRY: 'journal:add-entry',
  JOURNAL_EXPORT: 'journal:export',
  JOURNAL_SEARCH_CATALOG: 'journal:search-catalog',
  GAME_RENAME: 'game:rename',

  // Lista de desejos
  WISHLIST_GET: 'wishlist:get',
  WISHLIST_SYNC: 'wishlist:sync',
  WISHLIST_ADD: 'wishlist:add',
  WISHLIST_REMOVE: 'wishlist:remove',
  WISHLIST_SET_TARGET: 'wishlist:set-target',
  WISHLIST_OPEN_STORE: 'wishlist:open-store',
  WISHLIST_OPEN_DEALS: 'wishlist:open-deals',

  // Backup: visão geral
  BACKUP_OVERVIEW: 'backup:overview',
  BACKUP_RUN_SWEEP: 'backup:run-sweep',
  BACKUP_SET_AUTO: 'backup:set-auto',
  GAME_EXPORT_BAT: 'game:export-bat',

  // Listas
  LISTS_GET: 'lists:get',
  LISTS_SAVE: 'lists:save',
  LISTS_DELETE: 'lists:delete',

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
  ACHIEVEMENTS_SET_MANUAL: 'achievements:set-manual',
  ACHIEVEMENTS_ADD_CUSTOM: 'achievements:add-custom',
  ACHIEVEMENTS_REMOVE_CUSTOM: 'achievements:remove-custom',
  ACHIEVEMENTS_SET_LIST: 'achievements:set-list',
  ACHIEVEMENTS_UPDATED: 'achievements:updated',
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
  CLOUDSYNC_RETRY_UPLOADS: 'cloudsync:retry-uploads',

  // Capturas de tela
  SCREENSHOTS_LIST: 'screenshots:list',
  SCREENSHOTS_IMPORT: 'screenshots:import',
  SCREENSHOTS_DELETE: 'screenshots:delete',
  SCREENSHOTS_BY_GAME: 'screenshots:by-game',
  SCREENSHOTS_SHOW_IN_FOLDER: 'screenshots:show-in-folder',
  SCREENSHOTS_MOVE: 'screenshots:move',
  SCREENSHOTS_TAKE: 'screenshots:take',
  SCREENSHOTS_COPY: 'screenshots:copy',
  SCREENSHOTS_TAKEN: 'screenshots:taken',
  SCREENSHOTS_GET_HOTKEY: 'screenshots:get-hotkey',
  SCREENSHOTS_SET_HOTKEY: 'screenshots:set-hotkey',

  // Perfil do jogador
  PROFILE_GET: 'profile:get',
  PROFILE_YEAR_REVIEW: 'profile:year-review',
  PROFILE_SYNC_ACHIEVEMENTS: 'profile:sync-achievements',
  PROFILE_EXPORT: 'profile:export',
  PROFILE_SAVE_CUSTOM: 'profile:save-custom',
  PROFILE_PICK_MEDIA: 'profile:pick-media',
  PROFILE_WEB_STATUS: 'profile:web-status',
  PROFILE_WEB_PUBLISH: 'profile:web-publish',
  PROFILE_WEB_DISCONNECT: 'profile:web-disconnect',
  PROFILE_WEB_OPEN: 'profile:web-open',

  // Contas (login sem chave de API)
  ACCOUNTS_GET_STATUS: 'accounts:get-status',
  ACCOUNTS_STEAM_LOCAL: 'accounts:steam-local',
  ACCOUNTS_STEAM_USE_LOCAL: 'accounts:steam-use-local',
  ACCOUNTS_STEAM_LOGIN: 'accounts:steam-login',
  ACCOUNTS_SGDB_LOGIN: 'accounts:steamgriddb-login',
  ACCOUNTS_RETRO_LOGIN: 'accounts:retroachievements-login',
  ACCOUNTS_GOOGLE_LOGIN: 'accounts:google-login',
  ACCOUNTS_LOGOUT: 'accounts:logout',

  // Atualizações automáticas
  UPDATER_CHECK: 'updater:check',
  UPDATER_QUIT_AND_INSTALL: 'updater:quit-and-install',
  UPDATER_STATUS: 'updater:status',
  UPDATER_READY: 'updater:ready',

  // Atalhos da Steam (Adicionar jogo não-Steam)
  STEAM_ADD_SHORTCUT: 'steam:add-shortcut',
  STEAM_REMOVE_SHORTCUT: 'steam:remove-shortcut',

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
  APP_NETWORK_ONLINE: 'app:network-online',
  APP_GET_INFO: 'app:get-info',
  APP_OPEN_LOGS: 'app:open-logs'
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
