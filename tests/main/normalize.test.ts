import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, normalizeAchievements, normalizeData } from '../../src/main/database/normalize';
import { makeAchievements, makeGame } from '../helpers/fixtures';

describe('normalizeData', () => {
  it('recusa o que não é um banco', () => {
    expect(() => normalizeData(null)).toThrow();
    expect(() => normalizeData({ settings: {} })).toThrow();
    expect(() => normalizeData({ games: 'nenhum' })).toThrow();
  });

  it('preenche o que falta num banco mínimo', () => {
    const data = normalizeData({ games: [] });
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.playtimeSessions).toEqual([]);
    expect(data.emulatorConfigs).toEqual([]);
    expect(data.gameAchievements).toEqual({});
    expect(data.settings).toEqual({});
  });

  it('descarta jogos sem id e conserta campos de tipo errado', () => {
    const data = normalizeData({
      games: [
        { title: 'Sem id' },
        'texto solto',
        { id: 'a', title: '', customTitle: 'Nome meu', platform: 7, media: null, tags: ['ok', 3], isFavorite: 1, isHidden: 0, totalPlaytimeSeconds: '120', isRunning: true }
      ]
    });
    expect(data.games).toHaveLength(1);
    const [game] = data.games;
    expect(game.title).toBe('Nome meu');
    expect(game.platform).toBe('standalone');
    expect(game.media).toEqual({});
    expect(game.tags).toEqual(['ok']);
    expect(game.isFavorite).toBe(true);
    expect(game.isHidden).toBe(false);
    expect(game.totalPlaytimeSeconds).toBe(120);
    expect(game.isRunning).toBeUndefined();
    expect(typeof game.createdAt).toBe('string');
  });

  it('não mexe em jogo válido e mantém campos que não conhece', () => {
    const game = { ...makeGame({ id: 'steam-1', title: 'Jogo', isFavorite: true, totalPlaytimeSeconds: 90 }), campoDoFuturo: { x: 1 } };
    const data = normalizeData({ games: [game], recursoDoFuturo: [1, 2] });
    expect(data.games[0]).toEqual(game);
    expect((data as unknown as Record<string, unknown>).recursoDoFuturo).toEqual([1, 2]);
  });

  it('filtra sessões e sessões em andamento incompletas', () => {
    const data = normalizeData({
      games: [],
      playtimeSessions: [{ gameId: 'a', startedAt: 'x', endedAt: 'y', durationSeconds: 10 }, { gameId: 'a', durationSeconds: -5 }, null],
      activeSessions: [{ gameId: 'a', startedAt: 1, lastSeenAt: 2 }, { gameId: 'b' }]
    });
    expect(data.playtimeSessions).toHaveLength(1);
    expect(data.activeSessions).toHaveLength(1);
  });

  it('configurações viram texto e o que não é texto simples sai', () => {
    const data = normalizeData({ games: [], settings: { theme: 'dark', idle: 15, auto: true, lixo: { a: 1 }, nada: null } });
    expect(data.settings).toEqual({ theme: 'dark', idle: '15', auto: 'true' });
  });

  it('categorias: fica só a que tem id e nome, com ids de jogo em texto', () => {
    const data = normalizeData({
      games: [],
      gameCategories: [{ id: 'c1', name: 'Zelda', gameIds: ['a', 5, null, 'b'] }, { id: 'c2', name: '   ' }, { name: 'Sem id' }, 'solta']
    });
    expect(data.gameCategories).toEqual([{ id: 'c1', name: 'Zelda', gameIds: ['a', 'b'] }]);
  });

  it('coleções com tipo errado são descartadas em vez de derrubar a tela', () => {
    const data = normalizeData({ games: [], gameLists: 'x', wishlist: {}, achievementExtras: [], profileCustom: 3 });
    expect(data.gameLists).toBeUndefined();
    expect(data.wishlist).toBeUndefined();
    expect(data.achievementExtras).toBeUndefined();
    expect(data.profileCustom).toBeUndefined();
  });
});

describe('normalizeAchievements', () => {
  it('aceita só listas com itens', () => {
    const ok = makeAchievements('steam-1');
    expect(normalizeAchievements({ gameAchievements: { 'steam-1': ok, quebrada: { total: 3 }, texto: 'x' } })).toEqual({ 'steam-1': ok });
  });

  it('arquivo sem o campo vira vazio', () => {
    expect(normalizeAchievements({})).toEqual({});
    expect(normalizeAchievements(null)).toEqual({});
    expect(normalizeAchievements({ gameAchievements: [] })).toEqual({});
  });
});
