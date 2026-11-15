import { Game } from '@shared/types/game';
import { GameAchievements } from '@shared/types/achievements';
import { FriendCompareGame, FriendGameAchievements, FriendLibraryGame, SocialSettings } from '@shared/types/social';
import { EditionPrefs, foldEditions } from '@shared/utils/editions';
import { findOwnedGame, indexGamesByKey, libraryKeysOf, libraryTitleKey, steamKeyOf } from '@shared/utils/game-match';
import { reviewDateOf } from '@shared/utils/review-order';

// Biblioteca resumida que vai para a conta Lazulium: um registro por jogo com alguma atividade (horas, Diário ou
// conquista), para a página do jogo dos amigos mostrar quem jogou. Jogo comprado e nunca aberto não vai.
// O mesmo jogo em lojas diferentes vira um registro só, como na biblioteca. Sem nada que dependa do Electron,
// para os testes montarem direto.

export { libraryKeysOf, libraryTitleKey, steamKeyOf };

export const MAX_ROW_REVIEW = 6_000;     // Igual à vitrine
export const MAX_ACHIEVEMENT_IDS = 1_000;
const MAX_TITLE = 200;

export interface LibraryRow {
  titleKey: string;                    // t:<nome normalizado>: junta lojas diferentes entre amigos
  steamKey?: string;                   // steam:<appid>: acha mesmo quando o nome está escrito diferente
  title: string;
  coverUrl?: string;
  playtimeSeconds?: number;
  lastPlayedAt?: string;
  status?: string;
  rating?: number;
  review?: string;
  reviewAt?: string;
  achievements?: Required<FriendGameAchievements>;
}

// Conquistas que valem entre pessoas: listas da Steam e do RetroAchievements (os marcos do Lazulium e as criadas
// pelo jogador só existem neste PC)
function shareableAchievements(lists: (GameAchievements | null | undefined)[]): Required<FriendGameAchievements> | undefined {
  const best = lists
    .filter((a): a is GameAchievements => !!a && a.total > 0 && (a.source === 'steam' || a.source === 'retroachievements'))
    .sort((a, b) => b.unlocked - a.unlocked)[0];
  if (!best) return undefined;
  const ids: Record<string, number> = {};
  for (const item of best.items) {
    if (!item.unlocked || item.custom || Object.keys(ids).length >= MAX_ACHIEVEMENT_IDS) continue;
    const at = item.unlockedAt ? Math.floor(Date.parse(item.unlockedAt) / 1000) : 0;
    ids[item.id] = Number.isFinite(at) && at > 0 ? at : 0;
  }
  return { source: best.source as 'steam' | 'retroachievements', unlocked: best.unlocked, total: best.total, ids };
}

export function buildLibraryRows(
  raw: Game[],
  prefs: EditionPrefs,
  achievementsOf: (gameId: string) => GameAchievements | null | undefined,
  settings: Pick<SocialSettings, 'sharePlaytime' | 'shareReviews' | 'shareAchievements'>,
  coverOf: (game: Game) => string | null
): LibraryRow[] {
  const byId = new Map(raw.map((g) => [g.id, g]));
  const rows = new Map<string, LibraryRow & { seconds: number }>();
  for (const game of foldEditions(raw.filter((g) => !g.isHidden), prefs).games) {
    const key = libraryTitleKey(game.title);
    if (!key) continue;
    const members = game.editions ? game.editions.map((e) => byId.get(e.id)).filter((g): g is Game => !!g) : [game];
    const achievements = shareableAchievements(members.map((m) => achievementsOf(m.id)));
    const seconds = Math.max(0, Math.round(game.totalPlaytimeSeconds ?? 0));
    const log = game.log;
    const review = log?.review?.trim();
    if (seconds === 0 && !log?.status && !log?.rating && !review && !achievements?.unlocked) continue;

    const row: LibraryRow & { seconds: number } = { titleKey: key, title: game.title.slice(0, MAX_TITLE), seconds };
    const steamKey = members.map(steamKeyOf).find(Boolean);
    if (steamKey) row.steamKey = steamKey;
    const cover = coverOf(game);
    if (cover) row.coverUrl = cover;
    if (settings.sharePlaytime) {
      row.playtimeSeconds = seconds;
      if (game.lastPlayedAt) row.lastPlayedAt = game.lastPlayedAt;
    }
    if (settings.shareReviews) {
      if (log?.status) row.status = log.status;
      if (log?.rating) row.rating = log.rating;
      if (review) {
        row.review = review.slice(0, MAX_ROW_REVIEW);
        const date = reviewDateOf(game);
        if (date) row.reviewAt = date;
      }
    }
    if (settings.shareAchievements && achievements) row.achievements = achievements;

    // Dois cards com o mesmo nome (lojas separadas à mão): fica o mais jogado
    const current = rows.get(key);
    if (!current || seconds > current.seconds) rows.set(key, row);
  }
  return [...rows.values()].map(({ seconds: _seconds, ...row }) => row);
}

// Aba Comparar: cruza a biblioteca resumida do amigo com a sua (todos os seus jogos, até os nunca abertos),
// pelo nome ou pelo AppID, como a página do jogo
export function compareWithFriend(
  raw: Game[],
  prefs: EditionPrefs,
  achievementsOf: (gameId: string) => GameAchievements | null | undefined,
  theirs: FriendLibraryGame[]
): FriendCompareGame[] {
  const byKey = indexGamesByKey(raw, prefs);
  const seen = new Set<string>();
  const common: FriendCompareGame[] = [];
  for (const friendGame of theirs) {
    const match = findOwnedGame(byKey, friendGame);
    if (!match || seen.has(match.game.id)) continue;
    seen.add(match.game.id);
    const { game, members } = match;
    const achievements = shareableAchievements(members.map((m) => achievementsOf(m.id)));
    common.push({
      gameId: game.id,
      title: game.title,
      mine: {
        playtimeSeconds: Math.round(game.totalPlaytimeSeconds ?? 0),
        ...(game.log?.status ? { status: game.log.status } : {}),
        ...(game.log?.rating ? { rating: game.log.rating } : {}),
        ...(achievements ? { achievements: { source: achievements.source, unlocked: achievements.unlocked, total: achievements.total } } : {})
      },
      theirs: friendGame
    });
  }
  return common.sort((a, b) => b.mine.playtimeSeconds + (b.theirs.playtimeSeconds ?? 0) - (a.mine.playtimeSeconds + (a.theirs.playtimeSeconds ?? 0)));
}
