import { app, safeStorage } from 'electron';
import { join } from 'path';
import { copyFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { CachedPlayLength, EmulatorConfig, EmulatorType, Game, PlaytimeSession } from '@shared/types/game';
import { Achievement, AchievementExtras, AchievementSource, GameAchievements } from '@shared/types/achievements';
import { BackupRecord, GameSaveConfig } from '@shared/types/cloudsync';
import { ProfileCustom, SteamProfileIdentity } from '@shared/types/profile';
import { GameList } from '@shared/types/lists';
import { WishlistItem } from '@shared/types/wishlist';
import { ScreenshotMove } from '@shared/types/screenshots';
import { StoredActivity } from '@shared/types/activity';
import { DEFAULT_EMULATOR_PROFILES } from '@shared/constants/emulators';
import { createDefaultData, normalizeData } from './normalize';
import { ensureDailyBackup, listDailyBackups, readTextWithRetry, writeAtomic } from './storage';

// Mudanças em rajada (scan, sincronização de conquistas) viram uma gravação só
const WRITE_DELAY_MS = 250;
const MAX_ACTIVITY_LOG = 1_000;
// Gravação que falhou (arquivo preso por outro programa) é tentada de novo sozinha
const WRITE_RETRY_MS = 3_000;
const SLOW_WRITE_MS = 250;

const SECRET_SETTING_KEYS = [
  'steamGridDbApiKey',
  'steamWebApiKey',
  'retroAchievementsApiKey',
  'googleClientSecret',
  'googleDriveRefreshToken',
  'socialToken'
] as const;

const isSecretKey = (key: string): boolean => (SECRET_SETTING_KEYS as readonly string[]).includes(key);

// null: não deu para decifrar neste PC/usuário do Windows (ex: pasta de dados copiada de outro PC)
function decryptSecret(value: string): string | null {
  if (!value.startsWith('enc:')) return value; // Texto puro (migração ou sem cifragem)
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Database] safeStorage não está disponível para decifrar credenciais.');
    return null;
  }
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  } catch (err) {
    console.error('[Database] Falha ao decifrar segredo:', err);
    return null;
  }
}

function encryptSecret(value: string): string {
  if (value.startsWith('enc:')) return value;
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Database] safeStorage não está disponível; mantendo credencial em texto puro.');
    return value;
  }
  try {
    return `enc:${safeStorage.encryptString(value).toString('base64')}`;
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
  idleSeconds?: number;             // segundos ausentes acumulados
}

export interface DatabaseSchema {
  schemaVersion?: number;           // Formato do arquivo (ver normalize.ts); ausente = anterior à 1.0
  games: Game[];
  playtimeSessions: PlaytimeSession[];
  achievements: Achievement[];      // Legado: as conquistas ficam em gameAchievements
  gameAchievements?: Record<string, GameAchievements>;
  achievementExtras?: Record<string, AchievementExtras>;
  emulatorConfigs: EmulatorConfig[];
  standaloneDirectories: string[];
  activeSessions: ActiveSessionRecord[];
  saveConfigs?: Record<string, GameSaveConfig>;
  saveBackups?: BackupRecord[];
  profileCustom?: ProfileCustom;
  steamProfileCache?: SteamProfileIdentity;
  playLengthCache?: Record<string, CachedPlayLength>;
  gameLists?: GameList[];
  wishlist?: WishlistItem[];
  screenshotMoves?: ScreenshotMove[];
  profileWeb?: { repoUrl: string; lastPublishedAt?: string };
  activityLog?: StoredActivity[];   // Mudanças do Diário (status, nota, resenha), da mais nova para a mais antiga
  settings: Record<string, string>;
}

class DatabaseService {
  private dataFilePath = '';
  private data: DatabaseSchema = createDefaultData();
  private initialized = false;
  private writeTimer: NodeJS.Timeout | undefined;
  private dirty = false;
  private backupDay: string | undefined;
  // Segredos cifrados que este PC não abre: voltam ao arquivo intactos até o jogador conectar de novo.
  // Gravar vazio no lugar apagaria a conta de vez (ex: chave do Windows recriada, perfil restaurado).
  private undecryptable = new Map<string, string>();

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const storageDir = join(app.getPath('userData'), 'storage');
      mkdirSync(storageDir, { recursive: true });
      this.dataFilePath = join(storageDir, 'lazulium_db.json');

      const loaded = this.load();
      if (loaded) {
        for (const key of SECRET_SETTING_KEYS) {
          const stored = loaded.settings[key];
          if (!stored) continue;
          const plain = decryptSecret(stored);
          if (plain === null) this.undecryptable.set(key, stored);
          loaded.settings[key] = plain ?? '';
        }
        this.data = loaded;
      } else {
        this.data = createDefaultData();
        this.dirty = true;
        this.flush();
      }

      this.initialized = true;
      console.log(`[Database] Initialized at: ${this.dataFilePath} (${this.data.games.length} jogos)`);
    } catch (err) {
      console.error('[Database] Failed to initialize database:', err);
      // Sem caminho nada é gravado: uma falha ao abrir nunca pode sobrescrever o histórico com um banco vazio
      this.dataFilePath = '';
      this.data = createDefaultData();
    }
  }

  private readDataFile(path: string): DatabaseSchema {
    return normalizeData(JSON.parse(readTextWithRetry(path).replace(/^﻿/, '')));
  }

  // Abre o banco. Arquivo ilegível vira <nome>.corrupt-<data> e a cópia diária mais recente que abrir
  // assume; arquivo sumido com cópias guardadas também volta da cópia. null: primeira execução.
  private load(): DatabaseSchema | null {
    const path = this.dataFilePath;
    if (existsSync(path)) {
      try {
        return this.readDataFile(path);
      } catch (err) {
        // Erro de trava persistente não é corrupção: o init desiste sem gravar nada
        if ((err as NodeJS.ErrnoException).code) throw err;
        console.error('[Database] Banco corrompido, tentando as cópias de segurança:', err);
      }
      renameSync(path, `${path}.corrupt-${Date.now()}`);
    } else if (listDailyBackups(path).length === 0) {
      return null;
    } else {
      console.warn('[Database] Banco não encontrado, mas há cópias de segurança: restaurando a mais recente');
    }

    for (const backup of listDailyBackups(path)) {
      try {
        const restored = this.readDataFile(backup);
        copyFileSync(backup, path);
        console.warn(`[Database] Biblioteca restaurada da cópia ${backup}`);
        return restored;
      } catch {
        // Cópia também ruim: tenta a anterior
      }
    }
    console.error('[Database] Nenhuma cópia de segurança válida; iniciando um banco novo');
    return createDefaultData();
  }

  // Marca para gravar: as mudanças do mesmo instante saem juntas pouco depois
  private persist(): void {
    if (!this.dataFilePath) return;
    this.dirty = true;
    this.writeTimer ??= setTimeout(() => this.flush(), WRITE_DELAY_MS);
  }

  // Grava agora o que estiver pendente (encerramento do app e testes)
  flush(): void {
    clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    if (!this.dirty || !this.dataFilePath) return;
    this.dirty = false;
    const startedAt = Date.now();
    try {
      const settings = { ...this.data.settings };
      for (const key of SECRET_SETTING_KEYS) {
        const value = settings[key];
        if (value) settings[key] = encryptSecret(value);
        else if (this.undecryptable.has(key)) settings[key] = this.undecryptable.get(key)!;
      }
      const text = JSON.stringify({ ...this.data, settings });
      this.backupDay = ensureDailyBackup(this.dataFilePath, this.backupDay);
      writeAtomic(this.dataFilePath, text);
      const elapsed = Date.now() - startedAt;
      if (elapsed > SLOW_WRITE_MS) console.warn(`[Database] Gravação lenta: ${elapsed} ms (${(text.length / 1048576).toFixed(1)} MB)`);
    } catch (err) {
      console.error('[Database] Falha ao gravar o banco (nova tentativa em instantes):', err);
      this.dirty = true;
      this.writeTimer = setTimeout(() => this.flush(), WRITE_RETRY_MS);
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
    return index >= 0 ? this.data.games[index] : game;
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

  replaceGameMedia(id: string, media: Game['media']): void {
    const game = this.data.games.find((g) => g.id === id);
    if (!game) return;
    game.media = media;
    this.persist();
  }

  getProfileWeb(): { repoUrl: string; lastPublishedAt?: string } | undefined {
    return this.data.profileWeb;
  }

  setProfileWeb(value: { repoUrl: string; lastPublishedAt?: string } | undefined): void {
    this.data.profileWeb = value;
    this.persist();
  }

  getSteamProfileCache(): SteamProfileIdentity | undefined {
    return this.data.steamProfileCache;
  }

  setSteamProfileCache(identity: SteamProfileIdentity): void {
    this.data.steamProfileCache = identity;
    this.persist();
  }

  getProfileCustom(): ProfileCustom {
    return this.data.profileCustom ?? {};
  }

  setProfileCustom(custom: ProfileCustom): void {
    this.data.profileCustom = custom;
    this.persist();
  }

  // Mesmo jogo com novo ID (ex: reinstalado em outra pasta): leva junto sessões, conquistas e backups
  moveGameData(oldId: string, newId: string): void {
    for (const session of this.data.playtimeSessions) {
      if (session.gameId === oldId) session.gameId = newId;
    }
    if (this.data.achievementExtras?.[oldId]) {
      this.data.achievementExtras[newId] ??= this.data.achievementExtras[oldId];
      delete this.data.achievementExtras[oldId];
    }
    // O jogo que fica pode já ter dados próprios: o que veio do antigo só preenche o que falta
    if (this.data.gameAchievements?.[oldId]) {
      this.data.gameAchievements[newId] ??= { ...this.data.gameAchievements[oldId], gameId: newId };
      delete this.data.gameAchievements[oldId];
    }
    if (this.data.saveConfigs?.[oldId]) {
      this.data.saveConfigs[newId] ??= this.data.saveConfigs[oldId];
      delete this.data.saveConfigs[oldId];
    }
    for (const backup of this.data.saveBackups ?? []) {
      if (backup.gameId === oldId) backup.gameId = newId;
    }
    for (const entry of this.data.activityLog ?? []) {
      if (entry.gameId === oldId) entry.gameId = newId;
    }
    this.data.games = this.data.games.filter((g) => g.id !== oldId);
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
    this.data.gameAchievements ??= {};
    this.data.gameAchievements[achievements.gameId] = achievements;
    this.persist();
  }

  // Várias listas de uma vez: o arquivo é grande, e gravar a cada jogo travaria o app
  saveGameAchievementsBatch(list: GameAchievements[]): void {
    if (list.length === 0) return;
    this.data.gameAchievements ??= {};
    for (const achievements of list) this.data.gameAchievements[achievements.gameId] = achievements;
    this.persist();
  }

  getAchievementExtras(gameId: string): AchievementExtras {
    return this.data.achievementExtras?.[gameId] ?? {};
  }

  setAchievementExtras(gameId: string, extras: AchievementExtras): void {
    this.data.achievementExtras = { ...this.data.achievementExtras, [gameId]: extras };
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

  // Lista de desejos
  getWishlist(): WishlistItem[] {
    return this.data.wishlist ?? [];
  }

  setWishlist(items: WishlistItem[]): void {
    this.data.wishlist = items;
    this.persist();
  }

  // Listas de jogos (a mais recente primeiro)
  getActivityLog(): StoredActivity[] {
    return this.data.activityLog ?? [];
  }

  // Troca eventos antigos pelos novos (edições seguidas viram um só) e guarda só os mais recentes
  replaceActivity(removeIds: string[], entries: StoredActivity[]): void {
    if (entries.length === 0 && removeIds.length === 0) return;
    const removed = new Set(removeIds);
    this.data.activityLog = [...entries, ...this.getActivityLog().filter((e) => !removed.has(e.id))].slice(0, MAX_ACTIVITY_LOG);
    this.persist();
  }

  getGameLists(): GameList[] {
    return this.data.gameLists ?? [];
  }

  saveGameList(list: GameList): void {
    const others = this.getGameLists().filter((l) => l.id !== list.id);
    this.data.gameLists = [list, ...others];
    this.persist();
  }

  deleteGameList(id: string): void {
    this.data.gameLists = this.getGameLists().filter((l) => l.id !== id);
    this.persist();
  }

  getScreenshotMoves(): ScreenshotMove[] {
    return this.data.screenshotMoves ?? [];
  }

  setScreenshotMoves(moves: ScreenshotMove[]): void {
    this.data.screenshotMoves = moves;
    this.persist();
  }

  getPlayLength(gameId: string): CachedPlayLength | undefined {
    return this.data.playLengthCache?.[gameId];
  }

  setPlayLength(gameId: string, entry: CachedPlayLength): void {
    this.data.playLengthCache = { ...this.data.playLengthCache, [gameId]: entry };
    this.persist();
  }

  // Emulator Configs (sempre retorna um item por perfil conhecido, seguido dos personalizados)
  getEmulatorConfigs(): EmulatorConfig[] {
    const stored = new Map((this.data.emulatorConfigs ?? []).map((c) => [c.emulatorId, c]));
    const builtIn = (Object.keys(DEFAULT_EMULATOR_PROFILES) as EmulatorType[]).map(
      (id) => stored.get(id) ?? { emulatorId: id, enabled: false, romDirectories: [] }
    );
    const custom = (this.data.emulatorConfigs ?? []).filter((c) => c.custom && !DEFAULT_EMULATOR_PROFILES[c.emulatorId]);
    return [...builtIn, ...custom];
  }

  saveEmulatorConfig(config: EmulatorConfig): EmulatorConfig[] {
    const others = (this.data.emulatorConfigs ?? []).filter((c) => c.emulatorId !== config.emulatorId);
    this.data.emulatorConfigs = [...others, config];
    this.persist();
    return this.getEmulatorConfigs();
  }

  deleteEmulatorConfig(emulatorId: string): EmulatorConfig[] {
    this.data.emulatorConfigs = (this.data.emulatorConfigs ?? []).filter((c) => !(c.emulatorId === emulatorId && c.custom));
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
    // O jogador conectou de novo (ou saiu): a credencial antiga que não abria deixa de valer
    if (isSecretKey(key)) this.undecryptable.delete(key);
    this.persist();
  }
}

export const db = new DatabaseService();
