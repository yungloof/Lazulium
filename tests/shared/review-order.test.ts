import { describe, expect, it } from 'vitest';
import { reviewDateOf, sortByReviewDate } from '../../src/shared/utils/review-order';

describe('ordem das resenhas', () => {
  it('segue a data que aparece na resenha: zerado em, senão o último dia jogado; sem data no fim', () => {
    const games = [
      { title: 'Castle Crashers', log: { finishedOn: '2019-12-15' } },
      { title: 'Sem data', log: {} },
      { title: 'SpongeBob', lastPlayedAt: '2024-08-16T21:00:00.000Z', log: {} },
      { title: 'Super Chicken Jumper', log: { finishedOn: '2022-06-17' }, lastPlayedAt: '2026-11-10T10:00:00.000Z' },
      { title: 'People Playground', lastPlayedAt: '2022-09-24T12:00:00.000Z' }
    ];
    expect(sortByReviewDate(games).map((g) => g.title)).toEqual(['SpongeBob', 'People Playground', 'Super Chicken Jumper', 'Castle Crashers', 'Sem data']);
    expect(reviewDateOf(games[3])).toBe('2022-06-17');
    expect(reviewDateOf(games[2])).toBe('2024-08-16');
  });
});
