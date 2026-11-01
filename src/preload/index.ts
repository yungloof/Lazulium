import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { ElectronAPI, GameLaunchStatus } from '@shared/types/ipc';
import { EmulatorConfig, Game, GamePlatform } from '@shared/types/game';

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

  // Execução & Playtime
  launchGame: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_LAUNCH, gameId),
  stopGame: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_STOP, gameId),
  getPlaytimeSessions: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_GET_PLAYTIME_SESSIONS, gameId),
  onGameStatusChanged: (callback: (status: GameLaunchStatus) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, status: GameLaunchStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.GAME_STATUS_CHANGED, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.GAME_STATUS_CHANGED, subscription);
  },

  // Metadados & SteamGridDB
  fetchGameAssets: (gameId: string, customSearchTitle?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.METADATA_FETCH_ASSETS, gameId, customSearchTitle),
  applyGameAsset: (gameId: string, assetType: 'cover' | 'hero' | 'logo' | 'icon', assetUrl: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.METADATA_SET_CUSTOM_ASSET, gameId, assetType, assetUrl),

  // Conquistas
  getAchievements: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_GET, gameId),
  syncAchievements: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.ACHIEVEMENTS_SYNC, gameId),

  // Cloud Sync
  getCloudSyncStatus: (gameId?: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_STATUS, gameId),
  backupSaveToCloud: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_BACKUP, gameId),
  restoreSaveFromCloud: (gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUDSYNC_RESTORE, gameId),

  // Configurações
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  setSetting: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),

  // Janela e Sistema
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  selectFile: (filters) => ipcRenderer.invoke(IPC_CHANNELS.APP_SELECT_FILE, filters),
  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.APP_SELECT_DIRECTORY)
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
