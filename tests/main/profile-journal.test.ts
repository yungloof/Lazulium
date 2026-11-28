import { describe, expect, it } from 'vitest';
import { Game } from '@shared/types/game';
import {
  exportableJournal,
  maskShowcaseJournal,
  MAX_PROFILE_JOURNAL
} from '../../src/main/services/profile/profile-journal';

const makeGame = (overrides: Partial<Game> & { id: string; title: string }): Game => ({
  platform: 'steam',
  executablePath: '',
  media: {},
  isFavorite: false,
  isHidden: false,
  tags: [],
  totalPlaytimeSeconds: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

describe('exportableJournal', () => {
  it('exclui jogos ocultos, sem registro e jogos com apenas anotações pessoais (notes)', () => {
    const out = exportableJournal([
      makeGame({ id: '1', title: 'Só horas', totalPlaytimeSeconds: 7200 }),
      makeGame({ id: '2', title: 'Oculto', isHidden: true, log: { status: 'finished' } }),
      makeGame({ id: '3', title: 'Segredo', log: { notes: 'lembrar senha do cofre 4821' } }),
      makeGame({
        id: '4',
        title: 'Público',
        log: { status: 'finished', notes: 'anotação privada', finishedOn: '2026-04-10', rating: 4.5 }
      })
    ]);

    expect(out.map((e) => e.id)).toEqual(['4']);
    expect(out[0]).not.toHaveProperty('notes');
    expect(JSON.stringify(out)).not.toContain('anotação privada');
    expect(JSON.stringify(out)).not.toContain('lembrar senha');
  });

  it('dobra edições entre lojas somando horas, filtra capas locais e ordena por data/título', () => {
    const out = exportableJournal([
      makeGame({
        id: 'steam-hades',
        platform: 'steam',
        title: 'Hades',
        totalPlaytimeSeconds: 36000,
        media: { coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/hades.jpg' },
        log: { status: 'completed', rating: 5, startedOn: '2026-01-05', finishedOn: '2026-02-20' }
      }),
      makeGame({
        id: 'epic-hades',
        platform: 'epic',
        title: 'Hades',
        totalPlaytimeSeconds: 7200
      }),
      makeGame({
        id: 'console-zelda',
        platform: 'standalone',
        manualEntry: true,
        manualPlatform: 'Switch',
        title: 'Tears of the Kingdom',
        media: { coverUrl: 'lazulium-media://cover/zelda.png' },
        log: { status: 'playing', startedOn: '2026-04-01' }
      }),
      makeGame({
        id: 'backlog-celeste',
        platform: 'gog',
        title: 'Celeste',
        lastPlayedAt: '2026-03-15T18:30:00.000Z',
        log: { status: 'backlog' }
      }),
      makeGame({
        id: 'sem-data-b',
        platform: 'steam',
        title: 'Zelda II',
        log: { status: 'backlog' }
      }),
      makeGame({
        id: 'sem-data-a',
        platform: 'steam',
        title: 'Hollow Knight',
        log: { status: 'backlog' }
      })
    ]);

    expect(out.map((e) => e.id)).toEqual([
      'console-zelda',
      'backlog-celeste',
      'steam-hades',
      'sem-data-a',
      'sem-data-b'
    ]);

    expect(out[0]).toEqual({
      id: 'console-zelda',
      title: 'Tears of the Kingdom',
      platform: 'Switch',
      status: 'playing',
      startedOn: '2026-04-01',
      date: '2026-04-01',
      playtimeSeconds: 0
    });
    expect(out[1].date).toBe('2026-03-15');
    expect(out[2]).toEqual({
      id: 'steam-hades',
      title: 'Hades',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/hades.jpg',
      platform: 'steam',
      status: 'completed',
      rating: 5,
      startedOn: '2026-01-05',
      finishedOn: '2026-02-20',
      date: '2026-02-20',
      playtimeSeconds: 43200
    });
  });

  it('limita a exportação a MAX_PROFILE_JOURNAL entradas', () => {
    const many = Array.from({ length: MAX_PROFILE_JOURNAL + 25 }, (_, i) =>
      makeGame({
        id: `g-${i}`,
        title: `Jogo ${String(i).padStart(3, '0')}`,
        log: { status: 'backlog', startedOn: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` }
      })
    );
    expect(exportableJournal(many)).toHaveLength(MAX_PROFILE_JOURNAL);
  });
});

describe('maskShowcaseJournal', () => {
  const sample = [
    {
      id: 'steam-1',
      title: 'Jogo 1',
      coverUrl: 'https://private.example.com/custom.jpg',
      platform: 'steam',
      status: 'finished' as const,
      rating: 4,
      date: '2026-04-02',
      playtimeSeconds: 5400
    }
  ];

  it('zera o Diário quando shareReviews está desligado', () => {
    expect(maskShowcaseJournal(sample, { shareReviews: false, sharePlaytime: true }, () => 'https://cdn.example/c.jpg')).toEqual([]);
  });

  it('troca capa para pública e zera horas quando sharePlaytime está desligado', () => {
    expect(maskShowcaseJournal(sample, { shareReviews: true, sharePlaytime: false }, () => 'https://cdn.example/pub.jpg')).toEqual([
      {
        id: 'steam-1',
        title: 'Jogo 1',
        coverUrl: 'https://cdn.example/pub.jpg',
        platform: 'steam',
        status: 'finished',
        rating: 4,
        date: '2026-04-02',
        playtimeSeconds: 0
      }
    ]);
  });
});
