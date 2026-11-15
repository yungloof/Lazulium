import { describe, expect, it } from 'vitest';
import { collectOnThisDayCandidates, excerptReview } from '../../src/main/services/profile/on-this-day.service';
import { formatMemoryHeadline } from '../../src/renderer/src/components/OnThisDayShelf';
import { makeAchievements, makeGame } from '../helpers/fixtures';

const TODAY = new Date('2026-11-15T14:00:00-03:00');

describe('on-this-day service', () => {
  it('retorna lista vazia quando não há eventos no mesmo dia de anos anteriores', () => {
    const games = [
      makeGame({ id: 'g1', title: 'Hoje Mesmo', log: { status: 'finished', finishedOn: '2026-11-15' } }),
      makeGame({ id: 'g2', title: 'Outro Dia', log: { status: 'finished', finishedOn: '2024-11-14' } })
    ];

    const memories = collectOnThisDayCandidates(
      {
        games,
        activityLog: [],
        sessionsByGame: new Map(),
        achievementsByGame: new Map()
      },
      TODAY
    );

    expect(memories).toEqual([]);
  });

  it('reconhece zeramento, 100%, primeira sessão e trecho da resenha local', () => {
    const hades = makeGame({
      id: 'hades',
      title: 'Hades',
      log: {
        status: 'finished',
        finishedOn: '2024-11-15',
        rating: 4.5,
        review: 'Combate afiado, trilha sonora incrível e diálogos que fazem cada tentativa valer muito a pena mesmo depois dos créditos.'
      }
    });
    const celeste = makeGame({
      id: 'celeste',
      title: 'Celeste',
      log: { status: 'completed', finishedOn: '2023-11-15' }
    });
    const hollow = makeGame({
      id: 'hollow',
      title: 'Hollow Knight'
    });
    const hidden = makeGame({
      id: 'secret',
      title: 'Oculto',
      isHidden: true,
      log: { status: 'finished', finishedOn: '2024-11-15' }
    });

    const memories = collectOnThisDayCandidates(
      {
        games: [hades, celeste, hollow, hidden],
        activityLog: [
          { id: 'a1', kind: 'reviewed', gameId: 'hades', at: '2024-11-15T18:00:00-03:00' }
        ],
        sessionsByGame: new Map([
          ['hollow', [
            { id: 's1', gameId: 'hollow', startedAt: '2025-11-15T10:00:00-03:00', endedAt: '2025-11-15T11:30:00-03:00', durationSeconds: 5400 },
            { id: 's2', gameId: 'hollow', startedAt: '2025-11-16T10:00:00-03:00', endedAt: '2025-11-16T11:00:00-03:00', durationSeconds: 3600 }
          ]]
        ]),
        achievementsByGame: new Map([
          ['celeste', makeAchievements('celeste', 2)]
        ])
      },
      TODAY
    );

    expect(memories.map((m) => [m.gameId, m.kind, m.yearsAgo])).toEqual([
      ['celeste', 'completed', 3],
      ['hades', 'finished', 2],
      ['hollow', 'first-session', 1]
    ]);
    expect(memories[1]?.reviewExcerpt).toContain('Combate afiado');
    expect(memories[2]?.playtimeSeconds).toBe(5400);
    expect(formatMemoryHeadline(memories[1]!)).toBe('Há 2 anos você zerou Hades');
    expect(formatMemoryHeadline(memories[2]!)).toBe('Sua primeira sessão de Hollow Knight foi hoje (há 1 ano)');
  });

  it('resume resenhas longas mantendo palavras inteiras e usa data de conquista 100%', () => {
    const portal = makeGame({ id: 'portal', title: 'Portal 2' });
    const longReview = 'Um jogo de quebra-cabeça brilhante com humor ácido, ritmo perfeito e quebra-cabeças inteligentes do começo ao fim da campanha cooperativa.';
    expect(excerptReview(longReview, 55)?.length).toBeLessThanOrEqual(55);
    expect(excerptReview(longReview, 55)?.endsWith('…')).toBe(true);

    const achs = makeAchievements('portal', 2);
    achs.items[1] = { ...achs.items[1], unlockedAt: '2024-11-15T16:00:00-03:00' };

    const memories = collectOnThisDayCandidates(
      {
        games: [portal],
        activityLog: [],
        sessionsByGame: new Map(),
        achievementsByGame: new Map([['portal', achs]])
      },
      TODAY
    );

    expect(memories).toHaveLength(1);
    expect(memories[0]?.kind).toBe('completed');
    expect(memories[0]?.yearsAgo).toBe(2);
  });
});
