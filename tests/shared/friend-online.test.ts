import { describe, expect, it } from 'vitest';
import { FRIEND_ONLINE_WINDOW_MS, isFriendOnline } from '../../src/shared/types/social';

describe('amigo on-line', () => {
  const now = Date.parse('2026-11-14T18:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('visto há menos de 5 min está com o app aberto', () => {
    expect(isFriendOnline(ago(0), now)).toBe(true);
    expect(isFriendOnline(ago(4.5 * 60_000), now)).toBe(true); // 90 s de consulta + 3 min de folga do servidor
  });

  it('depois disso, ou sem data, não', () => {
    expect(isFriendOnline(ago(FRIEND_ONLINE_WINDOW_MS), now)).toBe(false);
    expect(isFriendOnline(ago(20 * 60_000), now)).toBe(false);
    expect(isFriendOnline(undefined, now)).toBe(false);
    expect(isFriendOnline('não é data', now)).toBe(false);
  });
});
