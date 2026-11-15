import { describe, expect, it } from 'vitest';
import { Game, GamePlatform } from '../../src/shared/types/game';
import { EMPTY_EDITION_PREFS } from '../../src/shared/utils/editions';
import { findOwnedGame, indexGamesByKey, libraryTitleKey } from '../../src/shared/utils/game-match';

const game = (id: string, platform: GamePlatform, extra: Partial<Game> = {}): Game =>
  ({ id, title: 'Portal 2', platform, isFavorite: false, isHidden: false, totalPlaytimeSeconds: 0, media: {}, tags: [], ...extra }) as Game;

describe('game-match', () => {
  it('indexa jogos dobrados por título normalizado e AppID da Steam', () => {
    const raw = [
      game('steam-hades', 'steam', { title: 'Hades', detectedTitle: 'Hades', platformGameId: '1145360' }),
      game('epic-hades', 'epic', { title: 'Hades', detectedTitle: 'Hades' }),
      game('standalone-celeste', 'standalone', { title: 'Celeste (Switch)' }),
      game('hidden', 'steam', { title: 'Secreto', platformGameId: '999', isHidden: true })
    ];
    const index = indexGamesByKey(raw, EMPTY_EDITION_PREFS);

    const matchByTitle = findOwnedGame(index, { titleKey: libraryTitleKey('Hades')! });
    expect(matchByTitle?.game.id).toBe('steam-hades');
    expect(matchByTitle?.members.map((m) => m.id)).toEqual(['steam-hades', 'epic-hades']);

    const matchBySteam = findOwnedGame(index, { titleKey: 't:outronome', steamKey: 'steam:1145360' });
    expect(matchBySteam?.game.id).toBe('steam-hades');

    expect(findOwnedGame(index, { titleKey: 't:celeste' })?.game.id).toBe('standalone-celeste');
    expect(findOwnedGame(index, { titleKey: 't:secreto', steamKey: 'steam:999' })).toBeUndefined();
  });
});
