import { describe, expect, it } from 'vitest';
import { YearReview } from '../../src/shared/types/profile';
import { buildYearReviewSlides, formatReviewDuration, hasYearReviewActivity } from '../../src/renderer/src/utils/yearReviewStory';

const emptyReview: YearReview = {
  year: 2025,
  availableYears: [2025],
  achievementsUnlocked: 0,
  monthlyAchievements: new Array<number>(12).fill(0),
  topGames: [],
  topPlayedGames: [],
  finishedGames: [],
  gamesPlayed: 0,
  screenshots: 0,
  trackedSeconds: 0
};

describe('yearReviewStory', () => {
  it('mantém apenas resumo e cartão final quando o ano ainda não tem registros', () => {
    expect(hasYearReviewActivity(emptyReview)).toBe(false);
    expect(buildYearReviewSlides(emptyReview).map((s) => s.id)).toEqual(['overview', 'card']);
  });

  it('inclui telas em sequência na ordem esperada quando há dados locais', () => {
    const rich: YearReview = {
      ...emptyReview,
      achievementsUnlocked: 12,
      monthlyAchievements: [0, 0, 5, 0, 7, 0, 0, 0, 0, 0, 0, 0],
      bestMonth: { month: 4, achievements: 7 },
      rarestAchievement: { name: 'Sem Dano', iconUrl: 'https://example.com/i.png', gameTitle: 'Hollow Knight', globalPercent: 1.8 },
      topGames: [{ id: 'g1', title: 'Hollow Knight', achievements: 12 }],
      topPlayedGames: [{ id: 'g1', title: 'Hollow Knight', seconds: 14400 }],
      finishedGames: [{ id: 'g1', title: 'Hollow Knight', rating: 5 }],
      gamesPlayed: 3,
      screenshots: 2,
      trackedSeconds: 14400
    };

    expect(hasYearReviewActivity(rich)).toBe(true);
    expect(buildYearReviewSlides(rich).map((s) => s.id)).toEqual([
      'overview',
      'rhythm',
      'games',
      'finished',
      'rarest',
      'card'
    ]);
  });

  it('formata horas e minutos em português', () => {
    expect(formatReviewDuration(0)).toBe('0 min');
    expect(formatReviewDuration(900)).toBe('15 min');
    expect(formatReviewDuration(5400)).toBe('1,5 h');
    expect(formatReviewDuration(36000)).toBe('10 h');
  });
});
