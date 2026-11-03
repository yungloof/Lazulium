import { YearReview, YearReviewGame } from '@shared/types/profile';
import { db } from '../../database/db';
import { screenshotsService } from '../metadata/screenshots.service';

const TOP_GAMES = 5;

const yearOf = (date?: string): number | undefined => {
  const year = date ? new Date(date).getFullYear() : NaN;
  return Number.isFinite(year) ? year : undefined;
};

// Monta o ano com o que tem data de verdade. Horas por ano só existem nas sessões do Lazulium: a Steam guarda só o total.
export async function buildYearReview(requestedYear?: number): Promise<YearReview> {
  const games = db.getGames().filter((g) => !g.isHidden);

  const years = new Set<number>();
  const add = (date?: string) => {
    const year = yearOf(date);
    if (year) years.add(year);
  };
  for (const game of games) {
    add(game.lastPlayedAt);
    add(game.log?.finishedOn);
    for (const session of db.getPlaytimeSessions(game.id)) add(session.startedAt);
    for (const achievement of db.getGameAchievements(game.id)?.items ?? []) if (achievement.unlocked) add(achievement.unlockedAt);
  }
  const availableYears = [...years].sort((a, b) => b - a);
  const year = requestedYear && availableYears.includes(requestedYear) ? requestedYear : availableYears[0] ?? new Date().getFullYear();

  const months = new Array<number>(12).fill(0);
  const topGames: YearReviewGame[] = [];
  const finishedGames: YearReviewGame[] = [];
  let achievementsUnlocked = 0;
  let gamesPlayed = 0;
  let screenshots = 0;
  let trackedSeconds = 0;
  let rarestAchievement: YearReview['rarestAchievement'];

  for (const game of games) {
    const base = { id: game.id, title: game.title, coverUrl: game.media?.coverUrl, rating: game.log?.rating };
    if (yearOf(game.lastPlayedAt) === year) gamesPlayed++;
    if (yearOf(game.log?.finishedOn) === year) finishedGames.push(base);
    for (const session of db.getPlaytimeSessions(game.id)) {
      if (yearOf(session.startedAt) === year) trackedSeconds += session.durationSeconds;
    }

    let unlockedHere = 0;
    for (const a of db.getGameAchievements(game.id)?.items ?? []) {
      if (!a.unlocked || yearOf(a.unlockedAt) !== year) continue;
      unlockedHere++;
      months[new Date(a.unlockedAt!).getMonth()]++;
      if (typeof a.globalPercent === 'number' && (!rarestAchievement || a.globalPercent < rarestAchievement.globalPercent)) {
        rarestAchievement = { name: a.name, iconUrl: a.iconUrl, gameTitle: game.title, globalPercent: a.globalPercent };
      }
    }
    achievementsUnlocked += unlockedHere;
    if (unlockedHere > 0) topGames.push({ ...base, achievements: unlockedHere });

    try {
      screenshots += (await screenshotsService.list(game)).filter((shot) => yearOf(shot.takenAt) === year).length;
    } catch {
      // Fonte de capturas indisponível: segue com os outros jogos
    }
  }

  const best = Math.max(...months);
  return {
    year,
    availableYears,
    achievementsUnlocked,
    bestMonth: best > 0 ? { month: months.indexOf(best), achievements: best } : undefined,
    rarestAchievement,
    topGames: topGames.sort((a, b) => (b.achievements ?? 0) - (a.achievements ?? 0)).slice(0, TOP_GAMES),
    finishedGames: finishedGames.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
    gamesPlayed,
    screenshots,
    trackedSeconds
  };
}
