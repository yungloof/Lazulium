import { describe, expect, it } from 'vitest';
import { MIN_GAP_MS, PIGGYBACK_MS, bringForward, nextTickIn, partsDue } from '../../src/main/services/social/poll-plan';

const NOW = 1_000_000;

describe('consulta única: quando perguntar o quê', () => {
  it('nada vencido: não pergunta', () => {
    expect(partsDue({ calls: NOW + 10_000, friends: NOW + 50_000, notifications: NOW + 60_000 }, NOW)).toEqual([]);
  });

  it('chamadas vencidas levam junto o que venceria logo', () => {
    const due = { calls: NOW, friends: NOW + PIGGYBACK_MS - 1, notifications: NOW + PIGGYBACK_MS + 1 };
    expect(partsDue(due, NOW)).toEqual(['calls', 'friends']);
  });

  it('amigos vencidos sempre levam as chamadas, sem pedido a mais', () => {
    const due = { calls: NOW + 45_000, friends: NOW, notifications: NOW };
    expect(partsDue(due, NOW)).toEqual(['calls', 'friends', 'notifications']);
  });

  it('próxima consulta: na parte que vence primeiro, nunca antes do intervalo mínimo', () => {
    expect(nextTickIn({ calls: NOW + 15_000, friends: NOW + 90_000, notifications: NOW + 80_000 }, NOW)).toBe(15_000);
    expect(nextTickIn({ calls: NOW - 5_000, friends: NOW, notifications: NOW }, NOW)).toBe(MIN_GAP_MS);
  });

  it('adiantar só aproxima, nunca atrasa', () => {
    const due = { calls: NOW + 60_000, friends: NOW + 90_000, notifications: NOW + 90_000 };
    expect(bringForward(due, 'calls', NOW, 1_000).calls).toBe(NOW + 1_000);
    expect(bringForward({ ...due, calls: NOW + 500 }, 'calls', NOW, 15_000).calls).toBe(NOW + 500);
  });

  it('ritmo com amigo on-line (15 s) e amigos a cada 90 s: um pedido a cada 15 s, amigos dentro deles', () => {
    let due = { calls: NOW, friends: NOW, notifications: NOW };
    let now = NOW;
    let requests = 0;
    let friendFetches = 0;
    const hour = 60 * 60_000;
    while (now < NOW + hour) {
      const parts = partsDue(due, now);
      if (parts.length) {
        requests++;
        if (parts.includes('friends')) friendFetches++;
        for (const part of parts) due = { ...due, [part]: now + (part === 'calls' ? 15_000 : 90_000) };
      }
      now += nextTickIn(due, now);
    }
    expect(requests).toBe(240);                      // antes: 300 de chamadas + 40 de amigos + 40 de avisos
    expect(friendFetches).toBeGreaterThanOrEqual(40);
  });
});
