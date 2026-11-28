import { Game } from '@shared/types/game';
import { GameList } from '@shared/types/lists';
import { PlayerProfile } from '@shared/types/profile';
import { unrankedIds } from '@shared/utils/tier-list';
import { MAX_PROFILE_LISTS } from '../profile/profile-lists';

const COLLAGE_SIZE = 5; // Capas no cartão de cada lista da página (COLLAGE_SIZE em web/profile/index.html)

type ShowcaseShelves = Pick<PlayerProfile, 'featuredGames' | 'recentGames' | 'favorites' | 'mostPlayed' | 'recentlyPlayed'>;

// Jogos da vitrine na ordem em que aparecem na página, sem repetir e sem ocultos: quem está logo à vista
// (destaques, atividade, cartões das listas) tem a capa pública procurada primeiro; o resto vai nas próximas vezes.
export function showcaseGameIds(profile: ShowcaseShelves, lists: GameList[], games: Game[], withJournal: boolean): string[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const shown = (ids: string[]) => ids.filter((id) => byId.has(id) && !byId.get(id)!.isHidden);
  const listOrder = [...lists.filter((l) => l.featured), ...lists.filter((l) => !l.featured)]
    .slice(0, MAX_PROFILE_LISTS)
    .map((list) => shown(list.tiers ? [...list.tiers.flatMap((t) => t.gameIds), ...unrankedIds(list)] : list.gameIds));
  const logged = withJournal ? games.filter((g) => !g.isHidden && (g.log?.status || g.log?.rating || g.log?.review?.trim() || g.manualEntry)).map((g) => g.id) : [];

  return [
    ...new Set([
      ...profile.featuredGames.map((g) => g.id),
      ...profile.recentGames.map((g) => g.id),
      ...listOrder.flatMap((ids) => ids.slice(0, COLLAGE_SIZE)),
      ...profile.favorites.map((g) => g.id),
      ...profile.mostPlayed.map((g) => g.id),
      ...profile.recentlyPlayed.map((g) => g.id),
      ...listOrder.flatMap((ids) => ids.slice(COLLAGE_SIZE)),
      ...logged
    ])
  ];
}
