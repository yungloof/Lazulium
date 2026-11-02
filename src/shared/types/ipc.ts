import { EmulatorConfig, Game, GameLog, GamePlatform, PlaytimeSession } from './game';
import { Achievement, GameAchievements } from './achievements';
import { AccountService, AccountsStatus, SteamLocalAccount } from './accounts';
import { Screenshot } from './screenshots';
import { AchievementsSyncResult, PlayerProfile } from './profile';
import {
  BackupEvent,
  BackupListResult,
  BackupRecord,
  DriveStatus,
  GameSaveConfig,
  RestoreResult,
  SaveLocationSuggestion
} from './cloudsync';

// Jogo registrado à mão no Diário (ex: console, ou jogado antes do Lazulium)
export interface JournalEntryInput {
  title: string;
  manualPlatform?: string;
  totalPlaytimeSeconds: number;
  log: GameLog;
}

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
  searchTitle?: string;             // Busca por outro título no SteamGridDB
  sgdbGameId?: number;              // ID explícito do jogo no SteamGridDB
}

export interface GameAssetsResult {
  sgdbGame: SteamGridDBGame | null;
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

// Ações do menu da bandeja do sistema executadas pelo renderer
export type TrayAction = 'scan';

export interface GameLaunchStatus {
  gameId: string;
  state: GameLaunchState;
  isRunning: boolean;
  pid?: number;
  startTime?: string;               // ISO timestamp da detecção do processo
  sessionSeconds?: number;          // Duração da sessão encerrada (0 se descartada por ser curta)
  idleSeconds?: number;             // Tempo ausente descontado da sessão
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
  setGameLog: (gameId: string, log: GameLog) => Promise<Game>;
  addJournalEntry: (entry: JournalEntryInput) => Promise<Game>;
  exportJournal: () => Promise<string | null>;                 // Caminho salvo (null se cancelado)
  setPlaytime: (gameId: string, totalSeconds: number, lastPlayedOn?: string) => Promise<Game>;   // Ajuste manual (não-Steam)
  onGameStatusChanged: (callback: (status: GameLaunchStatus) => void) => () => void;

  // Metadados & SteamGridDB
  fetchGameAssets: (gameId: string, options?: FetchAssetsOptions) => Promise<GameAssetsResult>;
  applyGameAsset: (gameId: string, assetType: MediaAssetType, assetUrl: string) => Promise<Game>;
  testSteamGridDbKey: (apiKey: string) => Promise<ApiKeyTestResult>;
  fetchMissingArtwork: () => Promise<number>;                 // Quantidade de jogos enfileirados
  reportBrokenArtwork: (gameId: string, assetType: MediaAssetType) => Promise<void>;
  onGameUpdated: (callback: (game: Game) => void) => () => void;

  // Conquistas
  getAchievements: (gameId: string) => Promise<GameAchievements | null>;
  syncAchievements: (gameId: string) => Promise<GameAchievements>;
  testSteamCredentials: (apiKey: string, steamId: string) => Promise<ApiKeyTestResult>;
  testRetroAchievementsCredentials: (username: string, apiKey: string) => Promise<ApiKeyTestResult>;

  // Backup de Saves & Google Drive
  getDriveStatus: () => Promise<DriveStatus>;
  connectDrive: () => Promise<DriveStatus>;                   // Abre o navegador para o OAuth
  disconnectDrive: () => Promise<DriveStatus>;
  getSaveConfig: (gameId: string) => Promise<GameSaveConfig | null>;
  setSaveConfig: (gameId: string, config: GameSaveConfig) => Promise<GameSaveConfig>;
  detectSaveLocations: (gameId: string) => Promise<SaveLocationSuggestion[]>;
  backupSaves: (gameId: string) => Promise<BackupRecord>;
  listSaveBackups: (gameId: string) => Promise<BackupListResult>;
  restoreSaveBackup: (gameId: string, backupId: string) => Promise<RestoreResult>;
  onBackupEvent: (callback: (event: BackupEvent) => void) => () => void;
  retryDriveUploads: () => Promise<number>;                    // Reenvia backups cujo upload falhou

  // Capturas de tela
  listScreenshots: (gameId: string) => Promise<Screenshot[]>;
  importScreenshots: (gameId: string) => Promise<number>;     // Abre o seletor de imagens; retorna quantas entraram
  deleteScreenshot: (gameId: string, screenshotId: string) => Promise<void>;
  showScreenshotInFolder: (gameId: string, screenshotId: string) => Promise<void>;

  // Perfil do jogador
  getPlayerProfile: () => Promise<PlayerProfile>;
  syncAllAchievements: () => Promise<AchievementsSyncResult>;
  exportPlayerProfile: () => Promise<string | null>;           // Caminho salvo (null se cancelado)

  // Contas (login sem chave de API)
  getAccountsStatus: () => Promise<AccountsStatus>;
  listLocalSteamAccounts: () => Promise<SteamLocalAccount[]>;
  useLocalSteamAccount: (steamId: string) => Promise<AccountsStatus>;
  loginSteam: () => Promise<AccountsStatus>;                  // OpenID no navegador do sistema
  loginSteamGridDb: () => Promise<AccountsStatus>;            // Janela de login; captura a chave sozinho
  loginRetroAchievements: () => Promise<AccountsStatus>;
  loginGoogle: () => Promise<AccountsStatus>;
  logoutAccount: (service: AccountService) => Promise<AccountsStatus>;

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
  rendererReady: () => Promise<void>;                          // Ouvintes registrados: libera ações pendentes da bandeja
  onTrayAction: (callback: (action: TrayAction) => void) => () => void;
  notifyNetworkOnline: () => Promise<void>;
  getAppInfo: () => Promise<{ version: string; logsDir: string }>;
  openLogsFolder: () => Promise<void>;                         // Para o usuário enviar o lazulium.log quando algo der errado                    // Conexão voltou: refaz envios/buscas pendentes
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
