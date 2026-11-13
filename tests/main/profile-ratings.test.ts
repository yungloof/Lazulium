import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerProfile } from '../../src/shared/types/profile';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';

type Db = typeof import('../../src/main/database/db')['db'];
type Service = typeof import('../../src/main/services/profile/profile.service')['profileService'];

let db: Db;
let service: Service;

beforeEach(async () => {
  useTempUserData();
  vi.resetModules();
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  ({ profileService: service } = await import('../../src/main/services/profile/profile.service'));
});

// Só o que a exportação lê: listas vazias bastam
const emptyProfile = {
  schema: 'lazulium-profile/1',
  generatedAt: '',
  displayName: 'Teste',
  custom: { sections: [] },
  featuredGames: [],
  featuredAchievements: [],
  recentGames: [],
  mostPlayed: [],
  recentlyPlayed: [],
  favorites: [],
  recentAchievements: [],
  rarestAchievements: []
} as unknown as PlayerProfile;

const ratings = () => service.toExportable(emptyProfile).ratings ?? [];

describe('avaliações na página do perfil', () => {
  it('leva jogos com nota ou resenha, do mais recente ao mais antigo, e deixa de fora o resto', () => {
    db.upsertGames([
      makeGame({ id: 'a', title: 'A', log: { rating: 4, finishedOn: '2026-01-10' } }),
      makeGame({ id: 'b', title: 'B', log: { review: 'Gostei', finishedOn: '2026-03-01', status: 'finished' } }),
      makeGame({ id: 'c', title: 'C', log: { status: 'playing' } }), // só status: não é avaliação
      makeGame({ id: 'd', title: 'D', isHidden: true, log: { rating: 5 } })
    ]);
    const list = ratings();
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
    expect(list[0]).toMatchObject({ title: 'B', review: 'Gostei', status: 'finished', date: '2026-03-01' });
    expect(list[1]).toMatchObject({ rating: 4, review: undefined });
  });

  it('usa o nome digitado à mão como plataforma e só capas públicas', () => {
    db.upsertGames([
      makeGame({ id: 'x', title: 'Celeste', platform: 'standalone', manualEntry: true, manualPlatform: 'Switch', log: { rating: 4 }, media: { coverUrl: 'lazulium-media://covers/x.jpg' } }),
      makeGame({ id: 'y', title: 'Hades', log: { rating: 5 }, media: { coverUrl: 'https://example.com/hades.jpg' } })
    ]);
    const byId = Object.fromEntries(ratings().map((r) => [r.id, r]));
    expect(byId.x.platform).toBe('Switch');
    expect(byId.x.coverUrl).toBeUndefined();
    expect(byId.y.coverUrl).toBe('https://example.com/hades.jpg');
  });

  it('corta resenhas enormes e respeita o teto de texto total', () => {
    db.upsertGames(Array.from({ length: 100 }, (_, i) => makeGame({ id: `g${i}`, log: { review: 'x'.repeat(20_000), finishedOn: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` } })));
    const list = ratings();
    expect(list.every((r) => (r.review?.length ?? 0) <= 6000)).toBe(true);
    const total = list.reduce((sum, r) => sum + (r.review?.length ?? 0), 0);
    expect(total).toBeLessThanOrEqual(450_000);
    // Passado o teto, a nota continua; só o texto some
    expect(list.some((r) => !r.review)).toBe(true);
  });
});
