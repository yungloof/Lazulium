import { GameAchievements } from '@shared/types/achievements';
import { StoredActivity } from '@shared/types/activity';
import { Game, PlaytimeSession } from '@shared/types/game';
import { OnThisDayKind, OnThisDayMemory } from '@shared/types/profile';
import { Screenshot } from '@shared/types/screenshots';
import { db } from '../../database/db';
import { screenshotsService } from '../metadata/screenshots.service';
import { localDayKey } from './activity.service';

const MAX_MEMORIES = 6;
const MIN_PLAYED_MEMORY_SECONDS = 15 * 60;
const REVIEW_EXCERPT_LIMIT = 160;

const KIND_PRIORITY: Record<OnThisDayKind, number> = {
  completed: 7,
  finished: 6,
  'first-session': 5,
  started: 4,
  reviewed: 3,
  rated: 2,
  played: 1
};

export interface OnThisDayInputs {
  games: Game[];
  activityLog: StoredActivity[];
  sessionsByGame: Map<string, PlaytimeSession[]>;
  achievementsByGame: Map<string, GameAchievements | null>;
}

interface ParsedDay {
  year: number;
  month: number; // 1..12
  day: number;   // 1..31
  key: string;
}

function parseDateOnly(raw?: string): ParsedDay | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, key: `${match[1]}-${match[2]}-${match[3]}` };
}

function parseIsoLocalDay(iso?: string): ParsedDay | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    key: localDayKey(d)
  };
}

export function excerptReview(review?: string, maxLength = REVIEW_EXCERPT_LIMIT): string | undefined {
  const clean = review?.trim().replace(/\s+/g, ' ');
  if (!clean) return undefined;
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const trimmed = lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return `${trimmed.trimEnd()}…`;
}

function netSeconds(session: PlaytimeSession): number {
  return Math.max(0, session.durationSeconds - (session.idleSeconds ?? 0));
}

function isSameAnniversary(parsed: ParsedDay | null, todayYear: number, todayMonth: number, todayDay: number): parsed is ParsedDay {
  return !!parsed && parsed.year < todayYear && parsed.month === todayMonth && parsed.day === todayDay;
}

/** Collects anniversary memories from purely local library logs, activity history, sessions and achievements. */
export function collectOnThisDayCandidates(inputs: OnThisDayInputs, now = new Date()): OnThisDayMemory[] {
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  const visibleGames = new Map(inputs.games.filter((g) => !g.isHidden).map((g) => [g.id, g]));
  const bestByGameYear = new Map<string, OnThisDayMemory>();

  const consider = (game: Game, kind: OnThisDayKind, day: ParsedDay, extra: Partial<OnThisDayMemory> = {}) => {
    if (!isSameAnniversary(day, todayYear, todayMonth, todayDay)) return;
    const yearsAgo = todayYear - day.year;
    const key = `${game.id}|${day.year}`;
    const existing = bestByGameYear.get(key);
    if (existing && KIND_PRIORITY[existing.kind] >= KIND_PRIORITY[kind]) {
      bestByGameYear.set(key, {
        ...existing,
        rating: existing.rating ?? extra.rating,
        playtimeSeconds: existing.playtimeSeconds ?? extra.playtimeSeconds
      });
      return;
    }

    bestByGameYear.set(key, {
      id: `${kind}|${key}`,
      kind,
      gameId: game.id,
      gameTitle: game.title,
      coverUrl: game.media?.coverUrl,
      yearsAgo,
      date: day.key,
      rating: extra.rating ?? game.log?.rating,
      reviewExcerpt: excerptReview(game.log?.review),
      playtimeSeconds: extra.playtimeSeconds ?? existing?.playtimeSeconds
    });
  };

  for (const game of visibleGames.values()) {
    const finishedDay = parseDateOnly(game.log?.finishedOn);
    if (finishedDay) {
      consider(game, game.log?.status === 'completed' ? 'completed' : 'finished', finishedDay);
    }
    const startedDay = parseDateOnly(game.log?.startedOn);
    if (startedDay) {
      consider(game, 'started', startedDay);
    }

    const achievements = inputs.achievementsByGame.get(game.id);
    if (achievements && achievements.total > 0 && achievements.source !== 'lazulium' && achievements.unlocked >= achievements.total) {
      const unlockedDates = achievements.items
        .filter((a) => a.unlocked && a.unlockedAt && !Number.isNaN(Date.parse(a.unlockedAt)))
        .map((a) => a.unlockedAt!)
        .sort();
      const lastUnlocked = unlockedDates.at(-1);
      const parsed = parseIsoLocalDay(lastUnlocked);
      if (parsed) consider(game, 'completed', parsed);
    }

    const sessions = (inputs.sessionsByGame.get(game.id) ?? []).filter((s) => !Number.isNaN(Date.parse(s.startedAt)));
    if (sessions.length > 0) {
      const sorted = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
      const dayTotals = new Map<string, { day: ParsedDay; seconds: number }>();
      for (const session of sorted) {
        const day = parseIsoLocalDay(session.endedAt || session.startedAt) ?? parseIsoLocalDay(session.startedAt);
        if (!day) continue;
        const entry = dayTotals.get(day.key) ?? { day, seconds: 0 };
        entry.seconds += netSeconds(session);
        dayTotals.set(day.key, entry);
      }

      const firstDay = parseIsoLocalDay(sorted[0].startedAt);
      if (firstDay) {
        const firstDaySeconds = dayTotals.get(firstDay.key)?.seconds ?? netSeconds(sorted[0]);
        consider(game, 'first-session', firstDay, { playtimeSeconds: firstDaySeconds > 0 ? firstDaySeconds : undefined });
      }

      for (const { day, seconds } of dayTotals.values()) {
        if (seconds >= MIN_PLAYED_MEMORY_SECONDS) {
          consider(game, 'played', day, { playtimeSeconds: seconds });
        }
      }
    }
  }

  for (const entry of inputs.activityLog) {
    const game = visibleGames.get(entry.gameId);
    if (!game) continue;
    const day = parseIsoLocalDay(entry.at);
    if (!day) continue;
    if (entry.kind === 'completed' || entry.kind === 'finished' || entry.kind === 'started') {
      consider(game, entry.kind, day);
    } else if (entry.kind === 'reviewed' && game.log?.review?.trim()) {
      consider(game, 'reviewed', day);
    } else if (entry.kind === 'rated') {
      consider(game, 'rated', day, { rating: entry.rating });
    }
  }

  return [...bestByGameYear.values()]
    .sort((a, b) => {
      const priorityDiff = KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind];
      if (priorityDiff !== 0) return priorityDiff;
      const yearDiff = b.yearsAgo - a.yearsAgo;
      if (yearDiff !== 0) return yearDiff;
      return a.gameTitle.localeCompare(b.gameTitle, 'pt-BR');
    })
    .slice(0, MAX_MEMORIES);
}

function pickScreenshotForMemory(shots: Screenshot[], memoryDate: string): Screenshot | undefined {
  if (shots.length === 0) return undefined;
  const sameDay = shots.find((s) => parseIsoLocalDay(s.takenAt)?.key === memoryDate);
  return sameDay ?? shots[0];
}

/** Loads today's local memories and attaches matching game screenshots when available. */
export async function getOnThisDayMemories(now = new Date()): Promise<OnThisDayMemory[]> {
  const games = db.getGames();
  const visibleGames = games.filter((g) => !g.isHidden);
  const sessionsByGame = new Map<string, PlaytimeSession[]>();
  const achievementsByGame = new Map<string, GameAchievements | null>();

  for (const game of visibleGames) {
    sessionsByGame.set(game.id, db.getPlaytimeSessions(game.id));
    achievementsByGame.set(game.id, db.getGameAchievements(game.id));
  }

  const candidates = collectOnThisDayCandidates(
    {
      games,
      activityLog: db.getActivityLog(),
      sessionsByGame,
      achievementsByGame
    },
    now
  );

  if (candidates.length === 0) return [];

  const gamesById = new Map(visibleGames.map((g) => [g.id, g]));
  const shotsCache = new Map<string, Screenshot[]>();

  return Promise.all(
    candidates.map(async (memory) => {
      const game = gamesById.get(memory.gameId);
      if (!game) return memory;
      let shots = shotsCache.get(game.id);
      if (!shots) {
        shots = await screenshotsService.list(game).catch(() => []);
        shotsCache.set(game.id, shots);
      }
      const chosen = pickScreenshotForMemory(shots, memory.date);
      if (!chosen) return memory;
      return {
        ...memory,
        screenshotUrl: chosen.url,
        screenshotThumbUrl: chosen.thumbUrl
      };
    })
  );
}
