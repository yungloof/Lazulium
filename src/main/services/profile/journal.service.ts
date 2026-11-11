import { randomUUID } from 'crypto';
import { Game, GameLog, GameLogStatus } from '@shared/types/game';
import { GameAchievements } from '@shared/types/achievements';
import { JournalEntryInput } from '@shared/types/ipc';
import { db } from '../../database/db';
import { recordLogChange } from './activity.service';

const STATUS_VALUES: GameLogStatus[] = ['backlog', 'playing', 'paused', 'finished', 'completed', 'dropped'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT_LENGTH = 200_000;
const MAX_TITLE_LENGTH = 200;
const MAX_PLAYTIME_SECONDS = 100_000 * 3600;
const CATALOG_COVER = /^https:\/\/(images\.igdb\.com|cdn\.cloudflare\.steamstatic\.com)\//;

const STATUS_LABEL: Record<GameLogStatus, string> = {
  backlog: 'Quero jogar',
  playing: 'Jogando',
  paused: 'Pausado',
  finished: 'Zerado',
  completed: '100%',
  dropped: 'Abandonado'
};

// O renderer pode mandar qualquer coisa: guarda só campos válidos
function sanitizeLog(log: GameLog): GameLog {
  const date = (value?: string) => (value && DATE_PATTERN.test(value) ? value : undefined);
  const rating = Number(log.rating);
  return {
    status: log.status && STATUS_VALUES.includes(log.status) ? log.status : undefined,
    rating: Number.isInteger(rating * 2) && rating >= 0.5 && rating <= 5 ? rating : undefined,
    startedOn: date(log.startedOn),
    finishedOn: date(log.finishedOn),
    review: log.review?.trim().slice(0, MAX_TEXT_LENGTH) || undefined,
    notes: log.notes?.trim().slice(0, MAX_TEXT_LENGTH) || undefined
  };
}

// Todas as conquistas = 100%, com a data da última. Vale uma vez: se o jogador mudar depois, a escolha dele fica.
export function markPerfectGame(data: GameAchievements): Game | null {
  if (data.total === 0 || data.unlocked < data.total) return null;
  const game = db.getGameById(data.gameId);
  if (!game || game.autoCompletedAt) return null;
  const lastUnlock = data.items.map((a) => a.unlockedAt).filter((d): d is string => !!d).sort().pop();
  const updated: Game = {
    ...game,
    autoCompletedAt: new Date().toISOString(),
    log: { ...game.log, status: game.log?.status === 'dropped' ? 'dropped' : 'completed', finishedOn: game.log?.finishedOn ?? lastUnlock?.slice(0, 10) }
  };
  db.upsertGame(updated);
  console.log(`[Diário] ${game.title}: marcado como 100% pelas conquistas`);
  return updated;
}

export function setGameLog(gameId: string, log: GameLog): Game {
  const game = db.getGameById(gameId);
  if (!game) throw new Error('Jogo não encontrado.');
  const updated: Game = { ...game, log: sanitizeLog(log) };
  db.upsertGame(updated);
  recordLogChange(gameId, game.log, updated.log);
  return updated;
}

// Vale só no Lazulium: nome vazio ou igual ao original volta a acompanhar o que o scanner encontra
export function renameGame(gameId: string, title: string | null): Game {
  const game = db.getGameById(gameId);
  if (!game) throw new Error('Jogo não encontrado.');
  const clean = title?.trim().slice(0, MAX_TITLE_LENGTH);
  const original = game.customTitle ? game.detectedTitle ?? game.title : game.title;
  if (title !== null && !clean) throw new Error('Digite um nome para o jogo.');
  const updated: Game =
    clean && clean !== original
      ? { ...game, title: clean, customTitle: clean, detectedTitle: original }
      : { ...game, title: original, customTitle: undefined, detectedTitle: undefined };
  db.upsertGame(updated);
  return updated;
}

// Define o total jogado. Em atalhos da Steam guarda a diferença para o valor da Steam: a edição
// sobrevive a todo scan e as horas que a Steam registrar depois continuam somando.
export function setManualPlaytime(gameId: string, totalSeconds: number, lastPlayedOn?: string): Game {
  const game = db.getGameById(gameId);
  if (!game) throw new Error('Jogo não encontrado.');
  if (game.platform === 'steam') throw new Error('O tempo de jogos da Steam é importado automaticamente.');
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0 || totalSeconds > MAX_PLAYTIME_SECONDS) throw new Error('Tempo inválido.');

  const total = Math.round(totalSeconds);
  const source = game.sourcePlaytimeSeconds ?? (game.id.startsWith('steam-shortcut-') ? 0 : undefined);
  const updated: Game = {
    ...game,
    totalPlaytimeSeconds: total,
    playtimeAdjustmentSeconds: source === undefined ? undefined : total - source
  };
  if (lastPlayedOn && DATE_PATTERN.test(lastPlayedOn) && lastPlayedOn !== game.lastPlayedAt?.slice(0, 10)) {
    updated.lastPlayedAt = new Date(`${lastPlayedOn}T12:00:00`).toISOString();
  }
  db.upsertGame(updated);
  return updated;
}

export function addJournalEntry(entry: JournalEntryInput): Game {
  const title = entry.title?.trim().slice(0, MAX_TITLE_LENGTH);
  if (!title) throw new Error('Informe o nome do jogo.');
  const seconds = Number(entry.totalPlaytimeSeconds);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_PLAYTIME_SECONDS) throw new Error('Tempo inválido.');

  const now = new Date().toISOString();
  const game: Game = {
    id: `log-${randomUUID()}`,
    title,
    platform: 'standalone',
    executablePath: '',
    manualEntry: true,
    manualPlatform: entry.manualPlatform?.trim().slice(0, 60) || undefined,
    isInstalled: false,
    log: sanitizeLog(entry.log ?? {}),
    media: entry.coverUrl && CATALOG_COVER.test(entry.coverUrl) ? { coverUrl: entry.coverUrl } : {},
    isFavorite: false,
    isHidden: false,
    tags: [],
    totalPlaytimeSeconds: Math.round(seconds),
    createdAt: now,
    updatedAt: now
  };
  db.upsertGame(game);
  recordLogChange(game.id, undefined, game.log);
  return game;
}

// Cópia que sobrevive a formatar o PC: tudo que o jogador registrou, sem caminhos locais nem artes
export function journalToJson(): string {
  const games = db.getGames().filter((g) => !g.isHidden);
  return JSON.stringify(
    {
      schema: 'lazulium-journal/1',
      exportedAt: new Date().toISOString(),
      games: games.map((g) => ({
        title: g.title,
        platform: g.manualPlatform ?? g.platform,
        steamAppId: g.platform === 'steam' ? g.platformGameId : undefined,
        installed: g.isInstalled !== false,
        playtimeSeconds: g.totalPlaytimeSeconds ?? 0,
        lastPlayedAt: g.lastPlayedAt,
        favorite: g.isFavorite,
        log: g.log,
        achievements: (() => {
          const data = db.getGameAchievements(g.id);
          return data?.total ? { unlocked: data.unlocked, total: data.total } : undefined;
        })(),
        sessions: db.getPlaytimeSessions(g.id).map((s) => ({ startedAt: s.startedAt, endedAt: s.endedAt, seconds: s.durationSeconds }))
      }))
    },
    null,
    2
  );
}

const csvCell = (value: string | number | undefined) => {
  const text = String(value ?? '');
  // Fórmulas não executam ao abrir no Excel/Sheets; aspas e separadores ficam escapados
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function journalToCsv(): string {
  const header = ['Jogo', 'Plataforma', 'Instalado', 'Horas', 'Última sessão', 'Status', 'Nota', 'Início', 'Fim', 'Conquistas', 'Resenha', 'Anotações'];
  const rows = db
    .getGames()
    .filter((g) => !g.isHidden)
    .sort((a, b) => (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0))
    .map((g) => {
      const achievements = db.getGameAchievements(g.id);
      return [
        g.title,
        g.manualPlatform ?? g.platform,
        g.isInstalled === false ? 'Não' : 'Sim',
        ((g.totalPlaytimeSeconds ?? 0) / 3600).toFixed(1).replace('.', ','),
        g.lastPlayedAt?.slice(0, 10),
        g.log?.status ? STATUS_LABEL[g.log.status] : undefined,
        g.log?.rating,
        g.log?.startedOn,
        g.log?.finishedOn,
        achievements?.total ? `${achievements.unlocked}/${achievements.total}` : undefined,
        g.log?.review,
        g.log?.notes
      ];
    });
  // BOM + ";" para o Excel em português abrir acentos e colunas certos
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
}
