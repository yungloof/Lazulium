import { EmulatorConfig, Game, GamePlatform, PlaytimeSession } from './game';
import { Achievement } from './achievements';

export interface ScanResult {
  added: number;
  updated: number;
  total: number;
  games: Game[];
  warnings: string[];               // Falhas isoladas de scanners (não interrompem o scan)
}

export interface SteamGridDBAsset {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
  style?: string;
  author?: {
    name: string;
  };
}

export interface GameLaunchStatus {
  gameId: string;
  isRunning: boolean;
  pid?: number;
  startTime?: string;
}

export interface ElectronAPI {
  // Biblioteca & Scanners
  scanAllLibraries: () => Promise<ScanResult>;
  scanPlatform: (platform: GamePlatform) => Promise<ScanResult>;
  getGames: () => Promise<Game[]>;
  getGameById: (id: string) => Promise<Game | null>;
  addCustomGame: (game: Partial<Game>) => Promise<Game>;
  updateGame: (id: string, updates: Partial<Game>) => Promise<Game>;
  deleteGame: (id: string) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<boolean>;

  // Emuladores
  getEmulatorConfigs: () => Promise<EmulatorConfig[]>;
  saveEmulatorConfig: (config: EmulatorConfig) => Promise<EmulatorConfig[]>;

  // Execução & Playtime
  launchGame: (gameId: string) => Promise<boolean>;
  stopGame: (gameId: string) => Promise<boolean>;
  getPlaytimeSessions: (gameId: string) => Promise<PlaytimeSession[]>;
  onGameStatusChanged: (callback: (status: GameLaunchStatus) => void) => () => void;

  // Metadados & SteamGridDB
  fetchGameAssets: (gameId: string, customSearchTitle?: string) => Promise<{
    grids: SteamGridDBAsset[];
    heroes: SteamGridDBAsset[];
    logos: SteamGridDBAsset[];
    icons: SteamGridDBAsset[];
  }>;
  applyGameAsset: (gameId: string, assetType: 'cover' | 'hero' | 'logo' | 'icon', assetUrl: string) => Promise<Game>;

  // Conquistas
  getAchievements: (gameId: string) => Promise<Achievement[]>;
  syncAchievements: (gameId: string) => Promise<Achievement[]>;

  // Cloud Sync
  getCloudSyncStatus: (gameId?: string) => Promise<{ authenticated: boolean; lastBackupAt?: string }>;
  backupSaveToCloud: (gameId: string) => Promise<{ success: boolean; message: string }>;
  restoreSaveFromCloud: (gameId: string) => Promise<{ success: boolean; message: string }>;

  // Configurações
  getSettings: () => Promise<Record<string, string>>;
  setSetting: (key: string, value: string) => Promise<void>;

  // Janela e Sistema
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
  selectDirectory: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
