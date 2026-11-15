import { Game } from '@shared/types/game';
import { ProfileJournalEntry } from '@shared/types/profile';
import { EditionPrefs, EMPTY_EDITION_PREFS, foldEditions } from '@shared/utils/editions';

export const MAX_PROFILE_JOURNAL = 400;

const httpsCover = (url?: string): string | undefined =>
  url && /^https:\/\//i.test(url) ? url : undefined;

// Anotações pessoais (`notes`) nunca saem do PC: quem só tem `notes` também fica de fora
const isPublicJournalGame = (game: Game): boolean => {
  const log = game.log;
  return Boolean(
    game.manualEntry ||
      log?.status ||
      log?.rating !== undefined ||
      log?.startedOn ||
      log?.finishedOn ||
      log?.review?.trim()
  );
};

export const journalDateOf = (game: Game): string | undefined =>
  game.log?.finishedOn ?? game.log?.startedOn ?? game.lastPlayedAt?.slice(0, 10);

/** Monta os registros exportáveis do Diário (edições dobradas, sem ocultos e sem `notes`). */
export function exportableJournal(
  rawGames: Game[],
  prefs: EditionPrefs = EMPTY_EDITION_PREFS
): ProfileJournalEntry[] {
  const entries = foldEditions(
    rawGames.filter((g) => !g.isHidden),
    prefs
  )
    .games.filter(isPublicJournalGame)
    .map((game) => ({ game, date: journalDateOf(game) }))
    .sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.date !== b.date) return a.date ? -1 : 1;
      return a.game.title.localeCompare(b.game.title, 'pt-BR');
    })
    .slice(0, MAX_PROFILE_JOURNAL);

  return entries.map(({ game, date }) => {
    const log = game.log;
    const coverUrl = httpsCover(game.media?.coverUrl);
    return {
      id: game.id,
      title: game.title,
      ...(coverUrl ? { coverUrl } : {}),
      platform: game.manualEntry && game.manualPlatform ? game.manualPlatform : game.platform,
      ...(log?.status ? { status: log.status } : {}),
      ...(log?.rating !== undefined ? { rating: log.rating } : {}),
      ...(log?.startedOn ? { startedOn: log.startedOn } : {}),
      ...(log?.finishedOn ? { finishedOn: log.finishedOn } : {}),
      ...(date ? { date } : {}),
      playtimeSeconds: Math.max(0, Math.round(game.totalPlaytimeSeconds ?? 0))
    };
  });
}

/** Aplica as chaves de privacidade da Conta Lazulium sobre os registros do Diário na vitrine. */
export function maskShowcaseJournal(
  entries: ProfileJournalEntry[] | undefined,
  opts: { shareReviews: boolean; sharePlaytime: boolean },
  publicCoverForId: (id: string) => string | undefined
): ProfileJournalEntry[] {
  if (!opts.shareReviews) return [];
  return (entries ?? []).map((entry) => ({
    ...entry,
    coverUrl: publicCoverForId(entry.id) || undefined,
    playtimeSeconds: opts.sharePlaytime ? entry.playtimeSeconds : 0
  }));
}
