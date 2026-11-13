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

describe('categorias dinâmicas, metadados e filtros combinados', () => {
  const catalogGames = [
    makeGame({
      id: 'doom',
      title: 'DOOM (1993)',
      platform: 'steam',
      genres: ['Tiro', 'Ação'],
      series: 'Doom',
      releaseYear: 1993,
      totalPlaytimeSeconds: 3600,
      log: { status: 'finished', rating: 5 }
    }),
    makeGame({
      id: 'mario64',
      title: 'Super Mario 64',
      platform: 'emulator',
      genres: ['Plataforma', 'Aventura'],
      series: 'Super Mario',
      releaseYear: 1996,
      isFavorite: true,
      totalPlaytimeSeconds: 1800,
      log: { status: 'playing', rating: 4.5 }
    }),
    makeGame({
      id: 'pacman',
      title: 'Pac-Man',
      platform: 'standalone',
      genres: ['Arcade'],
      releaseYear: 1980,
      totalPlaytimeSeconds: 0
    }),
    makeGame({
      id: 'hades2',
      title: 'Hades II',
      platform: 'steam',
      genres: ['Ação', 'RPG'],
      series: 'Hades',
      releaseYear: 2024,
      totalPlaytimeSeconds: 0
    })
  ];

  const dynamicCats: GameCategory[] = [
    {
      id: 'dyn-retro',
      name: 'Clássicos 90',
      gameIds: [],
      rule: { yearFrom: 1990, yearTo: 1999 },
      createdAt: '',
      updatedAt: ''
    },
    {
      id: 'dyn-fav-rpg',
      name: 'RPGs da Steam',
      gameIds: [],
      rule: { platforms: ['steam'], genres: ['RPG'] },
      createdAt: '',
      updatedAt: ''
    }
  ];

  it('filtra categoria dinâmica e exclui seus jogos de "sem categoria"', () => {
    expect(ids(filterGames(catalogGames, categoryFilter('dyn-retro'), '', false, dynamicCats))).toEqual(['doom', 'mario64']);
    expect(ids(filterGames(catalogGames, categoryFilter('dyn-fav-rpg'), '', false, dynamicCats))).toEqual(['hades2']);
    expect(ids(filterGames(catalogGames, 'uncategorized', '', false, dynamicCats))).toEqual(['pacman']);
  });

  it('busca textual encontra gênero e série além do título', () => {
    expect(ids(filterGames(catalogGames, 'all', 'Super Mario', false))).toEqual(['mario64']);
    expect(ids(filterGames(catalogGames, 'all', 'tiro', false))).toEqual(['doom']);
  });

  it('combina plataforma, status, gênero, série e faixas de ano (década, anterior a 1990 e exato)', () => {
    expect(ids(sortLibrary(catalogGames, 'title', 'all', { year: '1990s' }))).toEqual(['doom', 'mario64']);
    expect(ids(sortLibrary(catalogGames, 'title', 'all', { year: 'older' }))).toEqual(['pacman']);
    expect(ids(sortLibrary(catalogGames, 'title', 'all', { year: '2024' }))).toEqual(['hades2']);
    expect(
      ids(
        sortLibrary(catalogGames, 'title', 'finished', {
          platform: 'steam',
          genre: 'Tiro',
          series: 'Doom',
          year: '1993'
        })
      )
    ).toEqual(['doom']);
  });

  it('ordena por ano de lançamento com mais novos primeiro e sem ano no fim', () => {
    const withUnknown = [...catalogGames, makeGame({ id: 'indie', title: 'Alpha Sem Ano', platform: 'standalone' })];
    expect(ids(sortLibrary(withUnknown, 'released', 'all'))).toEqual(['hades2', 'mario64', 'doom', 'pacman', 'indie']);
  });
});
