import { EmulatorConfig, Game, PlaytimeSession } from '@shared/types/game';
import { StoredActivity } from '@shared/types/activity';
import { GameAchievements } from '@shared/types/achievements';
import { GameCategory } from '@shared/types/categories';
import { normalizeCategoryRule } from '@shared/utils/categories';
import type { ActiveSessionRecord, DatabaseSchema } from './db';

// Versão do formato do banco. Sobe quando um dado guardado precisa ser convertido;
// a conversão fica em normalizeData, para bancos de qualquer versão anterior abrirem.
export const SCHEMA_VERSION = 1;

export function createDefaultData(): DatabaseSchema {
  return {
    schemaVersion: SCHEMA_VERSION,
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
      discountIdleTime: 'true',
      idleThresholdMinutes: '15',
      theme: 'dark-oled'
    }
  };
}

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose => !!value && typeof value === 'object' && !Array.isArray(value);
const objects = (value: unknown): Loose[] => (Array.isArray(value) ? value.filter(isObject) : []);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const isText = (value: unknown): value is string => typeof value === 'string';
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Campos que a interface usa sem conferir: um valor de tipo errado (edição à mão, versão antiga)
// derrubaria a tela inteira. Valores válidos ficam exatamente como estão.
function normalizeGame(raw: Loose): Game {
  const game = { ...raw } as unknown as Game;
  const now = new Date().toISOString();
  if (!isText(game.title) || !game.title.trim()) game.title = isText(game.customTitle) && game.customTitle ? game.customTitle : 'Jogo sem nome';
  if (!isText(game.platform)) game.platform = 'standalone';
  if (!isText(game.executablePath)) game.executablePath = '';
  if (!isObject(game.media)) game.media = {};
  if (!Array.isArray(game.tags)) game.tags = [];
  else if (!game.tags.every(isText)) game.tags = strings(game.tags);
  if (typeof game.isFavorite !== 'boolean') game.isFavorite = !!game.isFavorite;
  if (typeof game.isHidden !== 'boolean') game.isHidden = !!game.isHidden;
  if (!isCount(game.totalPlaytimeSeconds)) game.totalPlaytimeSeconds = Math.max(0, Number(game.totalPlaytimeSeconds) || 0);
  if (!isText(game.createdAt)) game.createdAt = now;
  if (!isText(game.updatedAt)) game.updatedAt = game.createdAt;
  // Estado de execução é só da sessão atual: nunca vale ao abrir o app
  delete game.isRunning;
  return game;
}

function normalizeEmulatorConfig(raw: Loose): EmulatorConfig {
  const config = { ...raw } as unknown as EmulatorConfig;
  if (!Array.isArray(config.romDirectories) || !config.romDirectories.every(isText)) config.romDirectories = strings(config.romDirectories);
  if (typeof config.enabled !== 'boolean') config.enabled = !!config.enabled;
  return config;
}

function normalizeSettings(raw: unknown): Record<string, string> {
  const settings: Record<string, string> = {};
  if (!isObject(raw)) return settings;
  for (const [key, value] of Object.entries(raw)) {
    if (isText(value)) settings[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') settings[key] = String(value);
  }
  return settings;
}

// Arquivo de conquistas (ou o campo de mesmo nome num banco antigo): só entra lista com cara de lista
export function normalizeAchievements(raw: unknown): Record<string, GameAchievements> {
  const source = isObject(raw) && isObject(raw.gameAchievements) ? raw.gameAchievements : {};
  const result: Record<string, GameAchievements> = {};
  for (const [gameId, entry] of Object.entries(source)) {
    if (isObject(entry) && Array.isArray(entry.items)) result[gameId] = entry as unknown as GameAchievements;
  }
  return result;
}

// Abre o banco de qualquer versão: preenche o que falta, descarta registros sem identificação
// e corrige tipos. Campos desconhecidos (de versões mais novas) são mantidos.
export function normalizeData(raw: unknown): DatabaseSchema {
  if (!isObject(raw) || !Array.isArray(raw.games)) throw new Error('Formato inválido');
  const defaults = createDefaultData();
  const data = { ...defaults, ...raw } as DatabaseSchema;

  data.games = objects(raw.games).filter((g) => isText(g.id) && g.id).map(normalizeGame);
  data.playtimeSessions = objects(raw.playtimeSessions).filter(
    (s) => isText(s.gameId) && isText(s.startedAt) && isText(s.endedAt) && isCount(s.durationSeconds)
  ) as unknown as PlaytimeSession[];
  data.activeSessions = objects(raw.activeSessions).filter(
    (s) => isText(s.gameId) && isCount(s.startedAt) && isCount(s.lastSeenAt)
  ) as unknown as ActiveSessionRecord[];
  data.emulatorConfigs = objects(raw.emulatorConfigs).filter((c) => isText(c.emulatorId)).map(normalizeEmulatorConfig);
  data.standaloneDirectories = strings(raw.standaloneDirectories);
  data.achievements = Array.isArray(raw.achievements) ? data.achievements : [];
  data.saveBackups = objects(raw.saveBackups).filter((b) => isText(b.id) && isText(b.gameId) && isText(b.createdAt)) as unknown as DatabaseSchema['saveBackups'];
  data.gameAchievements = isObject(raw.gameAchievements) ? data.gameAchievements : {};
  data.saveConfigs = isObject(raw.saveConfigs) ? data.saveConfigs : {};
  data.settings = normalizeSettings(raw.settings);
  if ('activityLog' in raw) {
    data.activityLog = objects(raw.activityLog).filter((e) => isText(e.id) && isText(e.gameId) && isText(e.kind) && isText(e.at)) as unknown as StoredActivity[];
  }
  for (const key of ['achievementExtras', 'playLengthCache', 'profileCustom'] as const) {
    if (key in raw && !isObject(raw[key])) delete data[key];
  }
  for (const key of ['gameLists', 'wishlist', 'screenshotMoves'] as const) {
    if (key in raw && !Array.isArray(raw[key])) delete data[key];
  }
  if ('gameCategories' in raw) {
    data.gameCategories = objects(raw.gameCategories)
      .filter((c) => isText(c.id) && c.id && isText(c.name) && c.name.trim())
      .map((c) => {
        const base: Record<string, unknown> & { gameIds: string[] } = { ...c, gameIds: strings(c.gameIds) };
        if ('rule' in c) {
          const cleanRule = normalizeCategoryRule(c.rule);
          if (cleanRule) base.rule = cleanRule;
          else delete base.rule;
        }
        return base;
      }) as unknown as GameCategory[];
  }
  data.schemaVersion = SCHEMA_VERSION;
  return data;
}
