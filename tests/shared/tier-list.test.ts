import { describe, expect, it } from 'vitest';
import { GameTier } from '../../src/shared/types/lists';
import { MAX_TIERS, TIER_COLORS, defaultTiers, moveInTierList, normalizeTiers, unrankedIds } from '../../src/shared/utils/tier-list';

let counter = 0;
const newId = () => `novo-${++counter}`;
const tier = (id: string, gameIds: string[], label = id.toUpperCase()): GameTier => ({ id, label, color: '#ff7f7f', gameIds });

describe('tier list: fileiras', () => {
  it('começa com S, A, B, C, D nas cores do TierMaker e sem jogos', () => {
    const tiers = defaultTiers(newId);
    expect(tiers.map((t) => t.label)).toEqual(['S', 'A', 'B', 'C', 'D']);
    expect(tiers.map((t) => t.color)).toEqual(TIER_COLORS.slice(0, 5));
    expect(tiers.every((t) => t.gameIds.length === 0)).toBe(true);
    expect(new Set(tiers.map((t) => t.id)).size).toBe(5);
  });

  it('ao salvar: só jogos da lista, cada um numa fileira só, nome e cor válidos, id único', () => {
    const tiers = normalizeTiers(
      [
        { id: 's', label: '  Obra   prima  ', color: '#FF7F7F', gameIds: ['a', 'fora', 'b'] },
        { id: 's', label: '', color: 'vermelho', gameIds: ['b', 'c'] },
        'lixo',
        { label: 'x'.repeat(40), gameIds: 'nada' }
      ],
      ['a', 'b', 'c'],
      newId
    );
    expect(tiers).toHaveLength(3);
    expect(tiers[0]).toEqual({ id: 's', label: 'Obra prima', color: '#ff7f7f', gameIds: ['a', 'b'] });
    expect(tiers[1].id).not.toBe('s');
    expect(tiers[1]).toMatchObject({ label: '?', color: TIER_COLORS[1], gameIds: ['c'] });
    expect(tiers[2].label).toHaveLength(24);
    expect(tiers[2].gameIds).toEqual([]);
    expect(normalizeTiers('nada', ['a'], newId)).toEqual([]);
    expect(normalizeTiers(Array.from({ length: 30 }, (_, i) => tier(`t${i}`, [])), [], newId)).toHaveLength(MAX_TIERS);
  });

  it('Sem tier: os jogos da lista fora das fileiras, na ordem da lista', () => {
    expect(unrankedIds({ gameIds: ['a', 'b', 'c', 'd'], tiers: [tier('s', ['c']), tier('a', ['a'])] })).toEqual(['b', 'd']);
    expect(unrankedIds({ gameIds: ['a'] })).toEqual(['a']);
  });
});

describe('tier list: mover jogo', () => {
  const list = { gameIds: ['a', 'b', 'c', 'd'], tiers: [tier('s', ['a']), tier('b', ['c'])] };

  it('de Sem tier para o fim de uma fileira', () => {
    const next = moveInTierList(list, 'b', 's');
    expect(next.tiers!.map((t) => t.gameIds)).toEqual([['a', 'b'], ['c']]);
    expect(next.gameIds).toEqual(list.gameIds);
  });

  it('de uma fileira para outra, antes de um jogo', () => {
    const next = moveInTierList(list, 'c', 's', 'a');
    expect(next.tiers!.map((t) => t.gameIds)).toEqual([['c', 'a'], []]);
  });

  it('de volta para Sem tier: vai para o fim, ou antes do vizinho escolhido', () => {
    expect(unrankedIds(moveInTierList(list, 'a', null))).toEqual(['b', 'd', 'a']);
    expect(unrankedIds(moveInTierList(list, 'a', null, 'd'))).toEqual(['b', 'a', 'd']);
    expect(unrankedIds(moveInTierList(list, 'd', null, 'b'))).toEqual(['d', 'b']);
  });

  it('não muda nada com jogo de fora da lista, nem soltando em cima de si mesmo', () => {
    expect(moveInTierList(list, 'x', 's')).toBe(list);
    expect(moveInTierList(list, 'a', 's', 'a')).toBe(list);
  });

  it('fileira que não existe: o jogo sai da fileira mas continua na lista', () => {
    const next = moveInTierList(list, 'a', 'sumiu');
    expect(next.gameIds).toEqual(list.gameIds);
    expect(unrankedIds(next)).toContain('a');
  });
});
