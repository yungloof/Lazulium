import { EmulatorConfig, Game, GamePlatform, PlaytimeSession } from './game';
import { Achievement } from './achievements';

export interface ScanResult {
  added: number;
  updated: number;
  total: number;
  games: Game[];
  warnings: string[];               // Falhas isoladas de scanners (não interrompem o scan)
}

export type MediaAssetType = 'cover' | 'hero' | 'logo' | 'icon';

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

export interface SteamGridDBGame {
  id: number;
  name: string;
  releaseYear?: number;
  verified?: boolean;
}

export interface FetchAssetsOptions {
  searchTitle?: string;             // Busca manual por outro título
  sgdbGameId?: number;              // Usuário escolheu explicitamente um jogo do SteamGridDB
}

export interface GameAssetsResult {
  sgdbGame: SteamGridDBGame | null; // Jogo do SteamGridDB usado para as artes
  candidates: SteamGridDBGame[];    // Outros resultados da busca (para corrigir o match)
  grids: SteamGridDBAsset[];
  heroes: SteamGridDBAsset[];
  logos: SteamGridDBAsset[];
  icons: SteamGridDBAsset[];
  error?: string;
}

export interface ApiKeyTestResult {
  ok: boolean;
  message: string;
}

// 'launching': comando enviado, aguardando o processo do jogo aparecer
// 'running':   processo do jogo detectado, sessão contando tempo
// 'stopped':   jogo encerrado (ou nunca detectado, ver `error`)
export type GameLaunchState = 'launching' | 'running' | 'stopped';

export interface GameLaunchStatus {
  gameId: string;
  state: GameLaunchState;
  isRunning: boolean;
  pid?: number;
  startTime?: string;               // ISO timestamp da detecção do processo
  sessionSeconds?: number;          // Duração da sessão encerrada (0 se descartada por ser curta)
  game?: Game;                      // Registro atualizado (playtime) ao encerrar
  error?: string;
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

  // Jogos Standalone / Pastas de PC
  getStandaloneDirectories: () => Promise<string[]>;
  saveStandaloneDirectories: (directories: string[]) => Promise<string[]>;

  // Execução & Playtime
  launchGame: (gameId: string) => Promise<boolean>;
  stopGame: (gameId: string) => Promise<boolean>;
  getPlaytimeSessions: (gameId: string) => Promise<PlaytimeSession[]>;
  onGameStatusChanged: (callback: (status: GameLaunchStatus) => void) => () => void;

  // Metadados & SteamGridDB
  fetchGameAssets: (gameId: string, options?: FetchAssetsOptions) => Promise<GameAssetsResult>;
  applyGameAsset: (gameId: string, assetType: MediaAssetType, assetUrl: string) => Promise<Game>;
  testSteamGridDbKey: (apiKey: string) => Promise<ApiKeyTestResult>;
  fetchMissingArtwork: () => Promise<number>;                 // Quantidade de jogos enfileirados
  reportBrokenArtwork: (gameId: string, assetType: MediaAssetType) => Promise<void>;
  onGameUpdated: (callback: (game: Game) => void) => () => void;

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
