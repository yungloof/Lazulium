import { describe, expect, it } from 'vitest';
import { GameList } from '../../src/shared/types/lists';
import { ProfileGame } from '../../src/shared/types/profile';
import { needsPublicCoverLookup, publicCoverOf, publicHeroOf, STEAM_COVER } from '../../src/main/services/metadata/public-cover';
import { showcaseGameIds } from '../../src/main/services/social/showcase-covers';
import { makeGame } from '../helpers/fixtures';

const SGDB = 'https://cdn2.steamgriddb.com/grid/abc.png';
const IGDB = 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/zelda.jpg';

describe('capa pública (a mesma regra na vitrine, listas, Diário e feed)', () => {
  it('a arte escolhida vale para todo jogo, Steam inclusive: os amigos veem a mesma capa que você', () => {
    const cyberpunk = makeGame({ id: 's', platformGameId: '1091500', media: { coverUrl: 'lazulium-media://media/s/cover.png', coverSourceUrl: SGDB } });
    expect(publicCoverOf(cyberpunk)).toBe(SGDB);
    expect(needsPublicCoverLookup(cyberpunk)).toBe(false);
  });

  it('Steam sem arte escolhida: a capa conferida, ou o endereço padrão até conferir', () => {
    const fresh = makeGame({ id: 's', platformGameId: '42', media: { coverUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/42/library_600x900.jpg' } });
    expect(publicCoverOf(fresh)).toBe(STEAM_COVER('42'));
    expect(needsPublicCoverLookup(fresh)).toBe(true);
    const checked = makeGame({ id: 's', platformGameId: '42', media: { publicCoverUrl: IGDB } });
    expect(publicCoverOf(checked)).toBe(IGDB);
    expect(needsPublicCoverLookup(checked)).toBe(false);
  });

  it('emulador com capa só no PC: nada até achar a do IGDB', () => {
    const zelda = makeGame({ id: 'e', platform: 'emulator', media: { coverUrl: 'lazulium-media://media/e/cover.png' } });
    expect(publicCoverOf(zelda)).toBeNull();
    expect(needsPublicCoverLookup(zelda)).toBe(true);
    expect(publicCoverOf({ ...zelda, media: { ...zelda.media, publicCoverUrl: IGDB } })).toBe(IGDB);
  });

  it('endereço https que a página barra (CDN da Epic) não conta como capa pública', () => {
    const epic = makeGame({ id: 'p', platform: 'epic', media: { coverUrl: 'https://cdn1.epicgames.com/offer/x/capa.jpg', heroUrl: 'https://cdn1.epicgames.com/offer/x/hero.jpg' } });
    expect(publicCoverOf(epic)).toBeNull();
    expect(needsPublicCoverLookup(epic)).toBe(true);
    expect(publicHeroOf(epic.media.heroUrl)).toBeUndefined();
    expect(publicHeroOf('https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1/library_hero.jpg')).toBeDefined();
  });
});

describe('ordem das capas procuradas para a vitrine', () => {
  const shelf = (...ids: string[]) => ids.map((id) => ({ id, title: id, platform: 'steam', playtimeSeconds: 0 }) as ProfileGame);
  const list = (id: string, gameIds: string[], extra: Partial<GameList> = {}): GameList => ({ id, title: id, ranked: false, featured: false, gameIds, createdAt: '', updatedAt: '', ...extra });
  const games = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'oculto', 'diario'].map((id) =>
    makeGame({ id, isHidden: id === 'oculto', ...(id === 'diario' ? { log: { status: 'finished' as const } } : {}) })
  );

  it('primeiro o que está à vista (destaques, atividade, cartão das listas), sem repetir nem ocultos', () => {
    const profile = { featuredGames: shelf('a'), recentGames: shelf('b', 'a'), favorites: shelf('h'), mostPlayed: [], recentlyPlayed: [] };
    const lists = [list('comum', ['c', 'oculto', 'd', 'e', 'f', 'g', 'h']), list('destaque', ['g'], { featured: true })];
    expect(showcaseGameIds(profile, lists, games, true)).toEqual(['a', 'b', 'g', 'c', 'd', 'e', 'f', 'h', 'diario']);
    // Diário e avaliações fora da vitrine: não gasta busca com eles
    expect(showcaseGameIds(profile, lists, games, false)).not.toContain('diario');
  });
});
