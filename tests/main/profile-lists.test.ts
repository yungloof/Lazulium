import { describe, expect, it } from 'vitest';
import { Game } from '../../src/shared/types/game';
import { GameList } from '../../src/shared/types/lists';
import { MAX_PROFILE_LISTS, MAX_PROFILE_LIST_GAMES, exportableLists } from '../../src/main/services/profile/profile-lists';

const game = (id: string, extra: Partial<Game> = {}) => ({ id, title: `Jogo ${id}`, media: { coverUrl: `https://images.igdb.com/igdb/image/upload/t_cover_big/${id}.jpg` }, isHidden: false, ...extra }) as Game;
const list = (id: string, gameIds: string[], extra: Partial<GameList> = {}): GameList => ({ id, title: `Lista ${id}`, ranked: false, featured: false, gameIds, createdAt: '', updatedAt: '', ...extra });

describe('listas na página do perfil', () => {
  const games = new Map(['a', 'b', 'c', 'd'].map((id) => [id, game(id)]));
  games.set('local', game('local', { media: { coverUrl: 'lazulium-media://capa.jpg' } }));
  games.set('oculto', game('oculto', { isHidden: true }));

  it('lista comum: jogos na ordem, só capa pública, sem ocultos nem apagados', () => {
    const [out] = exportableLists([list('l', ['b', 'local', 'oculto', 'sumiu', 'a'], { ranked: true, description: 'top' })], games);
    expect(out).toEqual({
      id: 'l',
      title: 'Lista l',
      description: 'top',
      ranked: true,
      featured: false,
      games: [{ title: 'Jogo b', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/b.jpg' }, { title: 'Jogo local' }, { title: 'Jogo a', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg' }]
    });
  });

  it('tier list: cada fileira com seus jogos e os outros em Sem tier; nunca ranqueada', () => {
    const tiers = [
      { id: 's', label: 'S', color: '#ff7f7f', gameIds: ['c'] },
      { id: 'a', label: 'A', color: '#ffbf7f', gameIds: [] }
    ];
    const [out] = exportableLists([list('t', ['a', 'b', 'c'], { ranked: true, tiers })], games);
    expect(out.ranked).toBe(false);
    expect(out.tiers).toEqual([
      { label: 'S', color: '#ff7f7f', games: [{ title: 'Jogo c', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/c.jpg' }] },
      { label: 'A', color: '#ffbf7f', games: [] }
    ]);
    expect(out.games.map((g) => g.title)).toEqual(['Jogo a', 'Jogo b']);
  });

  it('destacadas primeiro, com teto de listas e de jogos por lista', () => {
    const many = Array.from({ length: MAX_PROFILE_LISTS + 3 }, (_, i) => list(`l${i}`, [], { featured: i === 7 }));
    const out = exportableLists(many, games);
    expect(out).toHaveLength(MAX_PROFILE_LISTS);
    expect(out[0].id).toBe('l7');

    const big = new Map(Array.from({ length: 120 }, (_, i) => [`g${i}`, game(`g${i}`)]));
    const ids = [...big.keys()];
    const [tier] = exportableLists([list('t', ids, { tiers: [{ id: 's', label: 'S', color: '#ff7f7f', gameIds: ids.slice(0, 50) }] })], big);
    expect(tier.tiers![0].games).toHaveLength(50);
    expect(tier.games).toHaveLength(MAX_PROFILE_LIST_GAMES - 50);
  });
});
