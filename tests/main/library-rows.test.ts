import { describe, expect, it } from 'vitest';
import { Game, GamePlatform } from '../../src/shared/types/game';
import { GameAchievements } from '../../src/shared/types/achievements';
import { EMPTY_EDITION_PREFS } from '../../src/shared/utils/editions';
import { buildLibraryRows, compareWithFriend, libraryKeysOf } from '../../src/main/services/social/library-rows';

const game = (id: string, platform: GamePlatform, extra: Partial<Game> = {}): Game =>
  ({ id, title: 'Portal 2', platform, isFavorite: false, isHidden: false, totalPlaytimeSeconds: 0, media: {}, tags: [], ...extra }) as Game;

const steamList = (gameId: string, unlocked: string[], total = 3): GameAchievements => ({
  gameId,
  source: 'steam',
  total,
  unlocked: unlocked.length,
  syncedAt: '2026-11-14T00:00:00Z',
  items: [
    ...unlocked.map((id, i) => ({ id, name: id, description: '', iconUrl: '', unlocked: true, unlockedAt: i === 0 ? '2026-11-01T12:00:00Z' : undefined })),
    { id: 'MINHA', name: 'Criada por mim', description: '', iconUrl: '', unlocked: true, custom: true }
  ]
});

const ALL = { sharePlaytime: true, shareReviews: true, shareAchievements: true };
const noCover = () => null;

describe('biblioteca resumida para os amigos', () => {
  it('só jogos com atividade; Steam e Epic viram um registro com as horas somadas e o AppID', () => {
    const raw = [
      game('steam-portal', 'steam', { platformGameId: '620', totalPlaytimeSeconds: 3600, log: { status: 'completed', rating: 4.5, review: '  Ótimo  ' } }),
      game('epic-portal', 'epic', { totalPlaytimeSeconds: 1800, lastPlayedAt: '2026-11-10T00:00:00Z' }),
      game('steam-nunca', 'steam', { title: 'Nunca Abri', platformGameId: '10' }),
      game('steam-oculto', 'steam', { title: 'Escondido', totalPlaytimeSeconds: 999, isHidden: true })
    ];
    const lists: Record<string, GameAchievements> = { 'steam-portal': steamList('steam-portal', ['A', 'B']) };
    const rows = buildLibraryRows(raw, EMPTY_EDITION_PREFS, (id) => lists[id], ALL, noCover);
    expect(rows).toHaveLength(1);
    const [portal] = rows;
    expect(portal).toMatchObject({ titleKey: 't:portal2', steamKey: 'steam:620', title: 'Portal 2', playtimeSeconds: 5400, lastPlayedAt: '2026-11-10T00:00:00Z', status: 'completed', rating: 4.5, review: 'Ótimo' });
    // A criada pelo jogador não vai; sem data vira 0
    expect(portal.achievements).toEqual({ source: 'steam', unlocked: 2, total: 3, ids: { A: Math.floor(Date.parse('2026-11-01T12:00:00Z') / 1000), B: 0 } });
  });

  it('chaves de privacidade tiram horas, Diário e conquistas', () => {
    const raw = [game('steam-portal', 'steam', { platformGameId: '620', totalPlaytimeSeconds: 3600, lastPlayedAt: '2026-11-10T00:00:00Z', log: { rating: 4, review: 'x' } })];
    const [row] = buildLibraryRows(raw, EMPTY_EDITION_PREFS, () => steamList('steam-portal', ['A']), { sharePlaytime: false, shareReviews: false, shareAchievements: false }, noCover);
    expect(row).toEqual({ titleKey: 't:portal2', steamKey: 'steam:620', title: 'Portal 2' });
  });

  it('marcos do Lazulium não contam como conquista entre pessoas', () => {
    const raw = [game('pc-jogo', 'standalone', { title: 'Jogo Avulso' })];
    const milestones = { ...steamList('pc-jogo', ['M']), source: 'lazulium' as const };
    expect(buildLibraryRows(raw, EMPTY_EDITION_PREFS, () => milestones, ALL, noCover)).toEqual([]);
  });

  it('chaves para achar o jogo nos amigos: AppID e os nomes (o atual e o da loja)', () => {
    expect(libraryKeysOf([game('s', 'steam', { platformGameId: '620', title: 'Portal 2 (renomeado)', detectedTitle: 'Portal 2' }), game('e', 'epic')])).toEqual([
      'steam:620',
      't:portal2'
    ]);
  });

  it('comparar: cruza pelo nome ou pelo AppID, inclusive jogo meu nunca aberto', () => {
    const raw = [
      game('steam-portal', 'steam', { platformGameId: '620', totalPlaytimeSeconds: 7200, log: { rating: 5 } }),
      game('epic-hades', 'epic', { title: 'Hades' }),
      game('steam-celeste', 'steam', { title: 'Celeste', platformGameId: '504230' })
    ];
    const common = compareWithFriend(raw, EMPTY_EDITION_PREFS, (id) => (id === 'steam-portal' ? steamList(id, ['A']) : null), [
      { titleKey: 't:hades', title: 'Hades', coverUrl: null, playtimeSeconds: 36_000 },
      { titleKey: 't:portaltwo', steamKey: 'steam:620', title: 'Portal Two', coverUrl: null, playtimeSeconds: 100, rating: 3 },
      { titleKey: 't:outro', title: 'Outro', coverUrl: null }
    ]);
    expect(common.map((c) => c.gameId)).toEqual(['epic-hades', 'steam-portal']);
    expect(common[1].mine).toEqual({ playtimeSeconds: 7200, rating: 5, achievements: { source: 'steam', unlocked: 1, total: 3 } });
    expect(common[1].theirs.rating).toBe(3);
    expect(common[0].mine).toEqual({ playtimeSeconds: 0 });
  });
});

describe('imagens na resenha para os amigos', () => {
  const images = [
    { id: 'aaaaaaaaaaaaaaaa.webp', at: 6, width: 1600, height: 900 },
    { id: 'bbbbbbbbbbbbbbbb.webp', at: 6, width: 800, height: 600 }
  ];
  const uploaded = (id: string) => (id.startsWith('a') ? `https://social.test/v1/review-images/${'t'.repeat(32)}` : undefined);

  it('vão só as já enviadas ao servidor, na posição do texto', () => {
    const raw = [game('p', 'steam', { platformGameId: '620', totalPlaytimeSeconds: 60, log: { review: 'Antes.\n\nDepois.', reviewImages: images } })];
    const [row] = buildLibraryRows(raw, EMPTY_EDITION_PREFS, () => null, ALL, noCover, uploaded);
    expect(row.review).toBe('Antes.\n\nDepois.');
    expect(row.reviewImages).toEqual([{ at: 6, url: uploaded('a'), width: 1600, height: 900 }]);
  });

  it('resenha só com imagem também conta; com resenhas desligadas não vai nada', () => {
    const raw = [game('p', 'epic', { log: { reviewImages: [images[0]] } })];
    const [row] = buildLibraryRows(raw, EMPTY_EDITION_PREFS, () => null, ALL, noCover, uploaded);
    expect(row.review).toBeUndefined();
    expect(row.reviewImages).toHaveLength(1);
    const [hidden] = buildLibraryRows(raw, EMPTY_EDITION_PREFS, () => null, { ...ALL, shareReviews: false }, noCover, uploaded);
    expect(hidden.reviewImages).toBeUndefined();
  });
});
