import { GameAchievements } from '@shared/types/achievements';
import { Game, PlaytimeSession } from '@shared/types/game';
import { YearReview, YearReviewGame, YearReviewPlayedGame } from '@shared/types/profile';
import { db } from '../../database/db';
import { screenshotsService } from '../metadata/screenshots.service';

const TOP_GAMES = 5;

// Data zerada (unlocktime 0 vira 1970) ou inválida não é um ano de verdade: fica fora dos anos, meses e contagens
const MIN_YEAR = 1990;

/**
 * Extracts year and zero-based month (0..11) from an ISO timestamp or YYYY-MM-DD log date without timezone drift.
 */
export function parseYearMonth(date?: string): { year: number; month: number } | undefined {
  if (!date) return undefined;
  const trimmed = date.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]) - 1;
    if (year >= MIN_YEAR && month >= 0 && month <= 11) return { year, month };
    return undefined;
  }
  const parsed = new Date(trimmed);
  const year = parsed.getFullYear();
  const month = parsed.getMonth();
  return Number.isFinite(year) && year >= MIN_YEAR && month >= 0 && month <= 11 ? { year, month } : undefined;
}

export interface YearReviewInputs {
  games: Game[];
  sessionsByGame: Map<string, PlaytimeSession[]>;
  achievementsByGame: Map<string, GameAchievements | null>;
  screenshotCountByGame?: Map<string, number>;
  playerName?: string;
}

/**
 * Computes annual metrics and story highlights from purely local game, achievement, session, and screenshot records.
 */
export function assembleYearReview(inputs: YearReviewInputs, requestedYear?: number): YearReview {
  const games = inputs.games.filter((g) => !g.isHidden);

  const years = new Set<number>();
  const add = (date?: string) => {
    const ym = parseYearMonth(date);
    if (ym) years.add(ym.year);
  };
  for (const game of games) {
    add(game.lastPlayedAt);
    add(game.log?.finishedOn);
    for (const session of inputs.sessionsByGame.get(game.id) ?? []) add(session.startedAt);
    for (const achievement of inputs.achievementsByGame.get(game.id)?.items ?? []) {
      if (achievement.unlocked) add(achievement.unlockedAt);
    }
  }
  const availableYears = [...years].sort((a, b) => b - a);
  const year = requestedYear && availableYears.includes(requestedYear) ? requestedYear : availableYears[0] ?? new Date().getFullYear();

  const months = new Array<number>(12).fill(0);
  const topGames: YearReviewGame[] = [];
  const topPlayedGames: YearReviewPlayedGame[] = [];
  const finishedGames: YearReviewGame[] = [];
  let achievementsUnlocked = 0;
  let gamesPlayed = 0;
  let screenshots = 0;
  let trackedSeconds = 0;
  let rarestAchievement: YearReview['rarestAchievement'];

  for (const game of games) {
    const base = { id: game.id, title: game.title, coverUrl: game.media?.coverUrl, rating: game.log?.rating };
    if (parseYearMonth(game.lastPlayedAt)?.year === year) gamesPlayed++;
    if (parseYearMonth(game.log?.finishedOn)?.year === year) finishedGames.push(base);

    let gameSeconds = 0;
    for (const session of inputs.sessionsByGame.get(game.id) ?? []) {
      if (parseYearMonth(session.startedAt)?.year === year) {
        trackedSeconds += session.durationSeconds;
        gameSeconds += session.durationSeconds;
      }
    }
    if (gameSeconds > 0) {
      topPlayedGames.push({ id: game.id, title: game.title, coverUrl: game.media?.coverUrl, seconds: gameSeconds });
    }

    let unlockedHere = 0;
    for (const a of inputs.achievementsByGame.get(game.id)?.items ?? []) {
      const ym = a.unlocked ? parseYearMonth(a.unlockedAt) : undefined;
      if (!ym || ym.year !== year) continue;
      unlockedHere++;
      months[ym.month]++;
      if (typeof a.globalPercent === 'number' && (!rarestAchievement || a.globalPercent < rarestAchievement.globalPercent)) {
        rarestAchievement = { name: a.name, iconUrl: a.iconUrl, gameTitle: game.title, globalPercent: a.globalPercent };
      }
    }
    achievementsUnlocked += unlockedHere;
    if (unlockedHere > 0) topGames.push({ ...base, achievements: unlockedHere });

    screenshots += inputs.screenshotCountByGame?.get(game.id) ?? 0;
  }

  const best = Math.max(...months);
  return {
    year,
    availableYears,
    achievementsUnlocked,
    monthlyAchievements: months,
    bestMonth: best > 0 ? { month: months.indexOf(best), achievements: best } : undefined,
    rarestAchievement,
    topGames: topGames.sort((a, b) => (b.achievements ?? 0) - (a.achievements ?? 0)).slice(0, TOP_GAMES),
    topPlayedGames: topPlayedGames.sort((a, b) => b.seconds - a.seconds).slice(0, TOP_GAMES),
    finishedGames: finishedGames.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
    gamesPlayed,
    screenshots,
    trackedSeconds,
    playerName: inputs.playerName?.trim() || undefined
  };
}

// Monta o ano com o que tem data de verdade. Horas por ano só existem nas sessões do Lazulium: a Steam guarda só o total.
export async function buildYearReview(requestedYear?: number): Promise<YearReview> {
  const games = db.getGames().filter((g) => !g.isHidden);
  const sessionsByGame = new Map<string, PlaytimeSession[]>();
  const achievementsByGame = new Map<string, GameAchievements | null>();
  const screenshotDatesByGame = new Map<string, { takenAt?: string }[]>();

  for (const game of games) {
    sessionsByGame.set(game.id, db.getPlaytimeSessions(game.id));
    achievementsByGame.set(game.id, db.getGameAchievements(game.id));
    try {
      screenshotDatesByGame.set(game.id, await screenshotsService.list(game));
    } catch {
      // Fonte de capturas indisponível: segue com os outros jogos
    }
  }

  const preliminary = assembleYearReview({ games, sessionsByGame, achievementsByGame }, requestedYear);
  const targetYear = preliminary.year;
  const screenshotCountByGame = new Map<string, number>();
  for (const [gameId, shots] of screenshotDatesByGame) {
    const count = shots.filter((shot) => parseYearMonth(shot.takenAt)?.year === targetYear).length;
    if (count > 0) screenshotCountByGame.set(gameId, count);
  }

  const settings = db.getSettings();
  const custom = db.getProfileCustom();
  const steamCache = db.getSteamProfileCache();
  const playerName =
    custom.displayName?.trim() || settings.steamPersonaName || steamCache?.personaName || settings.retroAchievementsUser || undefined;

  return assembleYearReview(
    { games, sessionsByGame, achievementsByGame, screenshotCountByGame, playerName },
    requestedYear
  );
}
