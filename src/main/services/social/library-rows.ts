import { Game } from '@shared/types/game';
import { GameAchievements } from '@shared/types/achievements';
import { FriendCompareGame, FriendGameAchievements, FriendLibraryGame, SocialSettings } from '@shared/types/social';
import { EditionPrefs, foldEditions } from '@shared/utils/editions';
import { reviewDateOf } from '@shared/utils/review-order';
import { titleKey } from '@shared/utils/title-key';

// Biblioteca resumida que vai para a conta Lazulium: um registro por jogo com alguma atividade (horas, Diário ou
// conquista), para a página do jogo dos amigos mostrar quem jogou. Jogo comprado e nunca aberto não vai.
// O mesmo jogo em lojas diferentes vira um registro só, como na biblioteca. Sem nada que dependa do Electron,
// para os testes montarem direto.

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

export const libraryTitleKey = (title: string): string | null => {
  const key = titleKey(title);
  return key ? `t:${key}` : null;
};

export const steamKeyOf = (game: Pick<Game, 'platform' | 'platformGameId'>): string | undefined =>
  game.platform === 'steam' && game.platformGameId && /^\d{1,10}$/.test(game.platformGameId) ? `steam:${game.platformGameId}` : undefined;

// Todas as chaves com que um amigo pode ter guardado este jogo (cada loja, nome atual e o da loja)
export function libraryKeysOf(games: Pick<Game, 'title' | 'detectedTitle' | 'platform' | 'platformGameId'>[]): string[] {
  const keys = new Set<string>();
  for (const game of games) {
    const steam = steamKeyOf(game);
    if (steam) keys.add(steam);
    for (const title of [game.title, game.detectedTitle]) {
      const key = title ? libraryTitleKey(title) : null;
      if (key) keys.add(key);
    }
  }
  return [...keys].slice(0, 8);
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
  const byId = new Map(raw.map((g) => [g.id, g]));
  const byKey = new Map<string, { game: Game; members: Game[] }>();
  for (const game of foldEditions(raw.filter((g) => !g.isHidden), prefs).games) {
    const members = game.editions ? game.editions.map((e) => byId.get(e.id)).filter((g): g is Game => !!g) : [game];
    for (const key of libraryKeysOf(members)) if (!byKey.has(key)) byKey.set(key, { game, members });
  }
  const seen = new Set<string>();
  const common: FriendCompareGame[] = [];
  for (const friendGame of theirs) {
    const match = byKey.get(friendGame.titleKey) ?? (friendGame.steamKey ? byKey.get(friendGame.steamKey) : undefined);
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
