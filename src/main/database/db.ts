import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { EmulatorConfig, EmulatorType, Game, PlaytimeSession } from '@shared/types/game';
import { Achievement } from '@shared/types/achievements';
import { DEFAULT_EMULATOR_PROFILES } from '@shared/constants/emulators';

export interface DatabaseSchema {
  games: Game[];
  playtimeSessions: PlaytimeSession[];
  achievements: Achievement[];
  emulatorConfigs: EmulatorConfig[];
  standaloneDirectories: string[];
  settings: Record<string, string>;
}

const DEFAULT_DATA: DatabaseSchema = {
  games: [],
  playtimeSessions: [],
  achievements: [],
  emulatorConfigs: [],
  standaloneDirectories: [],
  settings: {
    steamGridDbApiKey: '',
    steamWebApiKey: '',
    steamUserId: '',
    retroAchievementsUser: '',
    retroAchievementsApiKey: '',
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
        this.data = { ...DEFAULT_DATA, ...JSON.parse(raw) };
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
      writeFileSync(this.dataFilePath, JSON.stringify(this.data, null, 2), 'utf-8');
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
  addPlaytimeSession(session: PlaytimeSession): void {
    this.data.playtimeSessions.push(session);
    const game = this.data.games.find((g) => g.id === session.gameId);
    if (game) {
      game.totalPlaytimeSeconds += session.durationSeconds;
      game.lastPlayedAt = session.endedAt;
      game.updatedAt = new Date().toISOString();
    }
    this.persist();
  }

  getPlaytimeSessions(gameId: string): PlaytimeSession[] {
    return this.data.playtimeSessions.filter((s) => s.gameId === gameId);
  }

  // Achievements
  getAchievements(gameId: string): Achievement[] {
    return this.data.achievements.filter((a) => a.gameId === gameId);
  }

  saveAchievements(gameId: string, achievements: Achievement[]): void {
    this.data.achievements = this.data.achievements.filter((a) => a.gameId !== gameId).concat(achievements);
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
    return this.data.settings;
  }

  setSetting(key: string, value: string): void {
    this.data.settings[key] = value;
    this.persist();
  }
}

export const db = new DatabaseService();
