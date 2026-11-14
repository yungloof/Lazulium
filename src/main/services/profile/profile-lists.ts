import { Game } from '@shared/types/game';
import { GameList } from '@shared/types/lists';
import { ProfileList, ProfileListGame } from '@shared/types/profile';
import { unrankedIds } from '@shared/utils/tier-list';

// Listas para a página do perfil (amigos e web): só o que aparece no cartão e na lista aberta, com capas públicas
export const MAX_PROFILE_LISTS = 12;
export const MAX_PROFILE_LIST_GAMES = 80;   // Por lista, somando as fileiras de uma tier list

const publicCover = (url?: string) => (url && url.startsWith('https://') ? url : undefined);

export function exportableLists(lists: GameList[], games: Map<string, Game>): ProfileList[] {
  const visible = (ids: string[]) =>
    ids.flatMap((id) => {
      const game = games.get(id);
      return game && !game.isHidden ? [game] : [];
    });
  const toGame = (game: Game): ProfileListGame => {
    const coverUrl = publicCover(game.media?.coverUrl);
    return coverUrl ? { title: game.title, coverUrl } : { title: game.title };
  };

  // Destacadas primeiro, como no perfil do app
  const ordered = [...lists.filter((l) => l.featured), ...lists.filter((l) => !l.featured)].slice(0, MAX_PROFILE_LISTS);
  return ordered.map((list) => {
    let budget = MAX_PROFILE_LIST_GAMES;
    const take = (items: Game[]) => {
      const chosen = items.slice(0, Math.max(0, budget));
      budget -= chosen.length;
      return chosen.map(toGame);
    };
    const base = {
      id: list.id,
      title: list.title,
      ...(list.description ? { description: list.description } : {}),
      ranked: !list.tiers && list.ranked,
      featured: list.featured
    };
    if (!list.tiers) return { ...base, games: take(visible(list.gameIds)) };
    const tiers = list.tiers.map((tier) => ({ label: tier.label, color: tier.color, games: take(visible(tier.gameIds)) }));
    return { ...base, tiers, games: take(visible(unrankedIds(list))) };
  });
}
