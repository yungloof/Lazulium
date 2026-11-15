import { Game } from '../types/game';
import { EditionPrefs, EMPTY_EDITION_PREFS, foldEditions } from './editions';
import { titleKey } from './title-key';

// Chaves de cruzamento de jogos entre pessoas e PCs (mesma regra para amigos no jogo, Comparar e listas em grupo):
// junta por t:<título normalizado> ou steam:<appid> quando houver, sempre sem depender do id local do banco.

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

export interface MatchedOwnedGame {
  game: Game;
  members: Game[];
}

export function indexGamesByKey(raw: Game[], prefs: EditionPrefs = EMPTY_EDITION_PREFS, includeHidden = false): Map<string, MatchedOwnedGame> {
  const source = includeHidden ? raw : raw.filter((g) => !g.isHidden);
  const byId = new Map(source.map((g) => [g.id, g]));
  const byKey = new Map<string, MatchedOwnedGame>();
  for (const game of foldEditions(source, prefs).games) {
    const members = game.editions ? game.editions.map((e) => byId.get(e.id)).filter((g): g is Game => !!g) : [game];
    for (const key of libraryKeysOf(members)) if (!byKey.has(key)) byKey.set(key, { game, members });
  }
  return byKey;
}

export function findOwnedGame(byKey: Map<string, MatchedOwnedGame>, ref: { titleKey: string; steamKey?: string | null }): MatchedOwnedGame | undefined {
  return byKey.get(ref.titleKey) ?? (ref.steamKey ? byKey.get(ref.steamKey) : undefined);
}
