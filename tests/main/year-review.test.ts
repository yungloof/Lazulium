import { describe, expect, it } from 'vitest';
import { assembleYearReview, parseYearMonth } from '../../src/main/services/profile/year-review.service';
import { makeAchievements, makeGame } from '../helpers/fixtures';

describe('year-review service', () => {
  it('interpreta datas YYYY-MM-DD sem deslocamento de fuso em 1 de janeiro', () => {
    expect(parseYearMonth('2025-01-01')).toEqual({ year: 2025, month: 0 });
    expect(parseYearMonth('1970-01-01')).toBeUndefined();
    expect(parseYearMonth('invalida')).toBeUndefined();
  });

  it('monta contagem mensal, jogos mais jogados no app e ignora jogos ocultos', () => {
    const celeste = makeGame({
      id: 'celeste',
      title: 'Celeste',
      lastPlayedAt: '2025-03-10T20:00:00-03:00',
      log: { status: 'finished', finishedOn: '2025-01-01', rating: 5 }
    });
    const hades = makeGame({
      id: 'hades',
      title: 'Hades',
      lastPlayedAt: '2025-05-02T20:00:00-03:00'
    });
    const hidden = makeGame({
      id: 'hidden',
      title: 'Secreto',
      isHidden: true,
      log: { status: 'finished', finishedOn: '2025-06-01' }
    });

    const celesteAch = makeAchievements('celeste', 2);
    celesteAch.items[0] = {
      ...celesteAch.items[0],
      unlocked: true,
      unlockedAt: '2025-03-10T20:30:00-03:00',
      globalPercent: 42
    };
    celesteAch.items[1] = {
      ...celesteAch.items[1],
      unlocked: true,
      unlockedAt: '2025-03-11T21:00:00-03:00',
      globalPercent: 3.2
    };

    const review = assembleYearReview(
      {
        games: [celeste, hades, hidden],
        sessionsByGame: new Map([
          ['celeste', [{ id: 's1', gameId: 'celeste', startedAt: '2025-03-10T18:00:00-03:00', endedAt: '2025-03-10T20:00:00-03:00', durationSeconds: 7200 }]],
          ['hades', [{ id: 's2', gameId: 'hades', startedAt: '2025-05-02T18:00:00-03:00', endedAt: '2025-05-02T21:00:00-03:00', durationSeconds: 10800 }]]
        ]),
        achievementsByGame: new Map([['celeste', celesteAch]]),
        screenshotCountByGame: new Map([['celeste', 4]]),
        playerName: 'Lazuli'
      },
      2025
    );

    expect(review.year).toBe(2025);
    expect(review.availableYears).toEqual([2025]);
    expect(review.achievementsUnlocked).toBe(2);
    expect(review.monthlyAchievements?.[2]).toBe(2);
    expect(review.bestMonth).toEqual({ month: 2, achievements: 2 });
    expect(review.rarestAchievement?.name).toBe('Segunda');
    expect(review.rarestAchievement?.globalPercent).toBe(3.2);
    expect(review.finishedGames.map((g) => g.id)).toEqual(['celeste']);
    expect(review.topGames.map((g) => [g.id, g.achievements])).toEqual([['celeste', 2]]);
    expect(review.topPlayedGames?.map((g) => [g.id, g.seconds])).toEqual([
      ['hades', 10800],
      ['celeste', 7200]
    ]);
    expect(review.trackedSeconds).toBe(18000);
    expect(review.screenshots).toBe(4);
    expect(review.playerName).toBe('Lazuli');
  });
});
