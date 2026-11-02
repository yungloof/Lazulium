import { app, safeStorage } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { EmulatorConfig, EmulatorType, Game, PlaytimeSession } from '@shared/types/game';
import { Achievement, AchievementSource, GameAchievements } from '@shared/types/achievements';
import { BackupRecord, GameSaveConfig } from '@shared/types/cloudsync';
import { DEFAULT_EMULATOR_PROFILES } from '@shared/constants/emulators';

const SECRET_SETTING_KEYS = [
  'steamGridDbApiKey',
  'steamWebApiKey',
  'retroAchievementsApiKey',
  'googleClientSecret',
  'googleDriveRefreshToken'
] as const;

function decryptSecret(value?: string): string {
  if (!value) return '';
  if (!value.startsWith('enc:')) {
    // Texto puro (migração ou sem cifragem)
    return value;
  }
  const base64Data = value.slice(4);
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Database] safeStorage não está disponível para decifrar credenciais.');
    return '';
  }
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (err) {
    console.error('[Database] Falha ao decifrar segredo:', err);
    return '';
  }
}

function encryptSecret(value?: string): string {
  if (!value) return '';
  if (value.startsWith('enc:')) {
    return value;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Database] safeStorage não está disponível; mantendo credencial em texto puro.');
    return value;
  }
  try {
    const buffer = safeStorage.encryptString(value);
    return `enc:${buffer.toString('base64')}`;
  } catch (err) {
    console.error('[Database] Falha ao cifrar segredo:', err);
    return value;
  }
}

// Sessão em andamento gravada periodicamente (heartbeat). Se o app fechar ou
// travar com um jogo aberto, a sessão é recuperada no próximo início.
export interface ActiveSessionRecord {
  gameId: string;
  startedAt: number;                // epoch ms
  lastSeenAt: number;               // epoch ms
}

export interface DatabaseSchema {
  games: Game[];
  playtimeSessions: PlaytimeSession[];
  achievements: Achievement[];
  gameAchievements?: Record<string, GameAchievements>;
  emulatorConfigs: EmulatorConfig[];
  standaloneDirectories: string[];
  activeSessions: ActiveSessionRecord[];
  saveConfigs?: Record<string, GameSaveConfig>;
  saveBackups?: BackupRecord[];
  settings: Record<string, string>;
}

const DEFAULT_DATA: DatabaseSchema = {
  games: [],
  playtimeSessions: [],
  achievements: [],
  gameAchievements: {},
  emulatorConfigs: [],
  standaloneDirectories: [],
  activeSessions: [],
  saveConfigs: {},
  saveBackups: [],
  settings: {
    steamGridDbApiKey: '',
    steamWebApiKey: '',
    steamUserId: '',
    retroAchievementsUser: '',
    retroAchievementsApiKey: '',
    googleClientId: '',
    googleClientSecret: '',
    googleDriveRefreshToken: '',
    uiMode: 'desktop', // 'desktop' | 'big-picture'
    theme: 'dark-oled'
  }
};

class DatabaseService {
  private dataFilePath: string = '';
  private data: DatabaseSchema = DEFAULT_DATA;
  private initialized: boolean = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const userDataDir = app.getPath('userData');
      const storageDir = join(userDataDir, 'storage');
      
      if (!existsSync(storageDir)) {
        mkdirSync(storageDir, { recursive: true });
      }

      this.dataFilePath = join(storageDir, 'lazulium_db.json');

      if (existsSync(this.dataFilePath)) {
        const raw = readFileSync(this.dataFilePath, 'utf-8');
        const parsed: DatabaseSchema = { ...DEFAULT_DATA, ...JSON.parse(raw) };
        if (parsed.settings) {
          for (const key of SECRET_SETTING_KEYS) {
            if (parsed.settings[key]) {
              parsed.settings[key] = decryptSecret(parsed.settings[key]);
            }
          }
        }
        if (!parsed.gameAchievements) {
          parsed.gameAchievements = {};
        }
        this.data = parsed;
      } else {
        this.data = { ...DEFAULT_DATA };
        this.persist();
      }

      this.initialized = true;
      console.log(`[Database] Initialized at: ${this.dataFilePath}`);
    } catch (err) {
      console.error('[Database] Failed to initialize database:', err);
      this.data = { ...DEFAULT_DATA };
    }
  }

  private persist(): void {
    try {
      if (!this.dataFilePath) return;

      const encryptedSettings = { ...this.data.settings };
      for (const key of SECRET_SETTING_KEYS) {
        if (encryptedSettings[key]) {
          encryptedSettings[key] = encryptSecret(encryptedSettings[key]);
        }
      }

      const dataToPersist: DatabaseSchema = {
        ...this.data,
        settings: encryptedSettings
      };

      writeFileSync(this.dataFilePath, JSON.stringify(dataToPersist, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Database] Persist error:', err);
    }
  }

  // Games CRUD
  getGames(): Game[] {
    return this.data.games;
  }

  getGameById(id: string): Game | null {
    return this.data.games.find((g) => g.id === id) || null;
  }

  upsertGame(game: Game): Game {
    const index = this.data.games.findIndex((g) => g.id === game.id);
    if (index >= 0) {
      this.data.games[index] = { ...this.data.games[index], ...game, updatedAt: new Date().toISOString() };
    } else {
      this.data.games.push(game);
    }
    this.persist();
    return game;
  }

  // Upsert em lote com uma única escrita em disco (usado pelos scanners)
  upsertGames(games: Game[]): void {
    const indexById = new Map(this.data.games.map((g, i) => [g.id, i]));
    for (const game of games) {
      const index = indexById.get(game.id);
      if (index !== undefined) {
        this.data.games[index] = game;
      } else {
        indexById.set(game.id, this.data.games.length);
        this.data.games.push(game);
      }
    }
    this.persist();
  }

  deleteGame(id: string): boolean {
    const initialLen = this.data.games.length;
    this.data.games = this.data.games.filter((g) => g.id !== id);
    const deleted = this.data.games.length < initialLen;
    if (deleted) this.persist();
    return deleted;
  }

  toggleFavorite(id: string): boolean {
    const game = this.data.games.find((g) => g.id === id);
    if (!game) return false;
    game.isFavorite = !game.isFavorite;
    game.updatedAt = new Date().toISOString();
    this.persist();
    return game.isFavorite;
  }

  // Playtime Sessions
  addPlaytimeSession(session: PlaytimeSession): Game | null {
    this.data.playtimeSessions.push(session);
    const game = this.data.games.find((g) => g.id === session.gameId);
    if (game) {
      game.totalPlaytimeSeconds += session.durationSeconds;
      game.lastPlayedAt = session.endedAt;
      game.updatedAt = new Date().toISOString();
    }
    this.persist();
    return game ?? null;
  }

  // Sessões em andamento (recuperação após fechamento inesperado)
  getActiveSessions(): ActiveSessionRecord[] {
    return this.data.activeSessions ?? [];
  }

  setActiveSession(record: ActiveSessionRecord): void {
    this.data.activeSessions = [...this.getActiveSessions().filter((s) => s.gameId !== record.gameId), record];
    this.persist();
  }

  removeActiveSession(gameId: string): void {
    const remaining = this.getActiveSessions().filter((s) => s.gameId !== gameId);
    if (remaining.length === this.getActiveSessions().length) return;
    this.data.activeSessions = remaining;
    this.persist();
  }

  getPlaytimeSessions(gameId: string): PlaytimeSession[] {
    return this.data.playtimeSessions.filter((s) => s.gameId === gameId);
  }

  // Achievements
  getGameAchievements(gameId: string): GameAchievements | null {
    return this.data.gameAchievements?.[gameId] ?? null;
  }

  saveGameAchievements(achievements: GameAchievements): void {
    if (!this.data.gameAchievements) {
      this.data.gameAchievements = {};
    }
    this.data.gameAchievements[achievements.gameId] = achievements;
    this.persist();
  }

  // Ao trocar/sair da conta, o cache de conquistas daquela fonte deixa de valer
  clearGameAchievements(source: AchievementSource): void {
    const all = this.data.gameAchievements ?? {};
    this.data.gameAchievements = Object.fromEntries(Object.entries(all).filter(([, a]) => a.source !== source));
    this.persist();
  }

  getAchievements(gameId: string): Achievement[] {
    return this.data.gameAchievements?.[gameId]?.items ?? [];
  }

  // Backup de saves
  getSaveConfig(gameId: string): GameSaveConfig | null {
    return this.data.saveConfigs?.[gameId] ?? null;
  }

  setSaveConfig(gameId: string, config: GameSaveConfig): GameSaveConfig {
    this.data.saveConfigs = { ...this.data.saveConfigs, [gameId]: config };
    this.persist();
    return config;
  }

  // Mais recente primeiro
  getSaveBackups(gameId: string): BackupRecord[] {
    return (this.data.saveBackups ?? [])
      .filter((b) => b.gameId === gameId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getAllSaveBackups(): BackupRecord[] {
    return [...(this.data.saveBackups ?? [])];
  }

  upsertSaveBackup(record: BackupRecord): void {
    this.data.saveBackups = [...(this.data.saveBackups ?? []).filter((b) => b.id !== record.id), record];
    this.persist();
  }

  removeSaveBackups(ids: string[]): void {
    if (ids.length === 0) return;
    const remove = new Set(ids);
    this.data.saveBackups = (this.data.saveBackups ?? []).filter((b) => !remove.has(b.id));
    this.persist();
  }

  // Emulator Configs (sempre retorna um item por perfil conhecido)
  getEmulatorConfigs(): EmulatorConfig[] {
    const stored = new Map((this.data.emulatorConfigs ?? []).map((c) => [c.emulatorId, c]));
    return (Object.keys(DEFAULT_EMULATOR_PROFILES) as EmulatorType[]).map(
      (id) => stored.get(id) ?? { emulatorId: id, enabled: false, romDirectories: [] }
    );
  }

  saveEmulatorConfig(config: EmulatorConfig): EmulatorConfig[] {
    const others = (this.data.emulatorConfigs ?? []).filter((c) => c.emulatorId !== config.emulatorId);
    this.data.emulatorConfigs = [...others, config];
    this.persist();
    return this.getEmulatorConfigs();
  }

  // Standalone Directories (Pastas de Jogos Soltos no PC)
  getStandaloneDirectories(): string[] {
    return this.data.standaloneDirectories ?? [];
  }

  saveStandaloneDirectories(directories: string[]): string[] {
    // Normaliza caminhos e remove duplicatas
    const unique = Array.from(new Set(directories.map((d) => d.trim()).filter(Boolean)));
    this.data.standaloneDirectories = unique;
    this.persist();
    return this.getStandaloneDirectories();
  }

  // Settings
  getSettings(): Record<string, string> {
    return { ...this.data.settings };
  }

  setSetting(key: string, value: string): void {
    this.data.settings[key] = value;
    this.persist();
  }
}

export const db = new DatabaseService();
