import { Game } from '../types/game';

type Dated = Pick<Game, 'title' | 'lastPlayedAt'> & { log?: Pick<NonNullable<Game['log']>, 'finishedOn'> };

// Data que a resenha mostra: o dia em que zerou ou, sem ele, o último dia jogado (AAAA-MM-DD)
export const reviewDateOf = (game: Dated): string | undefined => game.log?.finishedOn ?? game.lastPlayedAt?.slice(0, 10);

// Resenhas na ordem da data que aparece nelas, da mais nova para a mais antiga; sem data, no fim, por nome
export function sortByReviewDate<T extends Dated>(games: T[]): T[] {
  return [...games].sort((a, b) => {
    const da = reviewDateOf(a) ?? '';
    const db = reviewDateOf(b) ?? '';
    return db.localeCompare(da) || a.title.localeCompare(b.title, 'pt-BR');
  });
}
