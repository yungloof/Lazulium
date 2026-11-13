import { describe, expect, it } from 'vitest';
import { GameCategory } from '@shared/types/categories';
import { categoryFilter, categoryIdOf, filterGames, sortLibrary } from '../../src/renderer/src/hooks/useLibraryGames';
import { makeGame } from '../helpers/fixtures';

const games = [
  makeGame({ id: 'zelda', title: 'Zelda', platform: 'emulator', isFavorite: true, totalPlaytimeSeconds: 7200, log: { status: 'finished', rating: 5 } }),
  makeGame({ id: 'hades', title: 'Hades', platform: 'steam', totalPlaytimeSeconds: 3600, tags: ['Roguelike'] }),
  makeGame({ id: 'fortnite', title: 'Fortnite', platform: 'epic', lastPlayedAt: '2026-11-01T00:00:00.000Z' }),
  makeGame({ id: 'oculto', title: 'Oculto', platform: 'steam', isHidden: true }),
  makeGame({ id: 'removido', title: 'Removido', platform: 'steam', isInstalled: false })
];

const categories: GameCategory[] = [
  { id: 'c1', name: 'Nintendo', gameIds: ['zelda', 'oculto'], createdAt: '', updatedAt: '' },
  { id: 'c2', name: 'Multiplayer', gameIds: ['fortnite', 'zelda'], createdAt: '', updatedAt: '' }
];

const ids = (list: { id: string }[]) => list.map((g) => g.id);

describe('filtro da biblioteca', () => {
  it('"todos" esconde ocultos e desinstalados', () => {
    expect(ids(filterGames(games, 'all', '', false))).toEqual(['zelda', 'hades', 'fortnite']);
  });

  it('desinstalados aparecem com a opção ligada ou ao buscar pelo nome', () => {
    expect(ids(filterGames(games, 'all', '', true))).toContain('removido');
    expect(ids(filterGames(games, 'all', 'remov', false))).toEqual(['removido']);
  });

  it('filtra por plataforma e por favoritos', () => {
    expect(ids(filterGames(games, 'steam', '', false))).toEqual(['hades']);
    expect(ids(filterGames(games, 'favorites', '', false))).toEqual(['zelda']);
  });

  it('filtra por categoria, sem trazer jogo oculto que está nela', () => {
    expect(ids(filterGames(games, categoryFilter('c1'), '', false, categories))).toEqual(['zelda']);
    expect(ids(filterGames(games, categoryFilter('c2'), '', false, categories))).toEqual(['zelda', 'fortnite']);
  });

  it('categoria que não existe mais não mostra nada', () => {
    expect(filterGames(games, categoryFilter('apagada'), '', false, categories)).toEqual([]);
  });

  it('"sem categoria" traz só quem não está em nenhuma', () => {
    expect(ids(filterGames(games, 'uncategorized', '', false, categories))).toEqual(['hades']);
  });

  it('a busca vale dentro do filtro e também acha pela etiqueta', () => {
    expect(ids(filterGames(games, categoryFilter('c2'), 'fort', false, categories))).toEqual(['fortnite']);
    expect(ids(filterGames(games, 'all', 'rogue', false))).toEqual(['hades']);
  });

  it('o id da categoria vai e volta no filtro; plataforma não é categoria', () => {
    expect(categoryIdOf(categoryFilter('abc-123'))).toBe('abc-123');
    expect(categoryIdOf('steam')).toBeNull();
    expect(categoryIdOf('uncategorized')).toBeNull();
  });
});

describe('ordenação e filtro por status', () => {
  const visible = filterGames(games, 'all', '', false);

  it('ordena por nome, horas e última sessão', () => {
    expect(ids(sortLibrary([...visible], 'title', 'all'))).toEqual(['fortnite', 'hades', 'zelda']);
    expect(ids(sortLibrary([...visible], 'hours', 'all'))).toEqual(['zelda', 'hades', 'fortnite']);
    expect(ids(sortLibrary([...visible], 'recent', 'all'))[0]).toBe('fortnite');
  });

  it('filtra por status do Diário e por nunca jogados', () => {
    expect(ids(sortLibrary([...visible], 'title', 'finished'))).toEqual(['zelda']);
    expect(ids(sortLibrary([...visible], 'title', 'unplayed'))).toEqual(['fortnite']);
  });
});
