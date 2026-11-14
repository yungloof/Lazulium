import { describe, expect, it } from 'vitest';
import {
  AUTO_AWAY_IDLE_SECONDS,
  DEFAULT_CALL_SETTINGS,
  decideCallDelivery,
  effectivePresence,
  friendPresence,
  parseCallSettings,
  parsePresenceStatus
} from '../../src/shared/utils/presence';

const NOW = Date.parse('2026-11-14T22:00:00Z');
const active = { idleSeconds: 5, locked: false, gameRunning: false };

describe('status (como no Discord)', () => {
  it('vale o que foi escolhido; prazo vencido volta para Disponível', () => {
    expect(effectivePresence('dnd', undefined, active, NOW)).toEqual({ status: 'dnd', auto: false, expired: false });
    expect(effectivePresence('dnd', '2026-11-14T23:00:00Z', active, NOW).status).toBe('dnd');
    expect(effectivePresence('invisible', '2026-11-14T21:00:00Z', active, NOW)).toEqual({ status: 'online', auto: false, expired: true });
  });

  it('PC parado ou tela bloqueada: Ausente sozinho, menos com jogo aberto', () => {
    const idle = { ...active, idleSeconds: AUTO_AWAY_IDLE_SECONDS };
    expect(effectivePresence('online', undefined, idle, NOW)).toEqual({ status: 'away', auto: true, expired: false });
    expect(effectivePresence('online', undefined, { ...active, locked: true }, NOW).status).toBe('away');
    expect(effectivePresence('online', undefined, { ...idle, gameRunning: true }, NOW).status).toBe('online');
    // Não perturbar e Invisível não viram Ausente
    expect(effectivePresence('dnd', undefined, idle, NOW).status).toBe('dnd');
    expect(effectivePresence('invisible', undefined, idle, NOW).status).toBe('invisible');
  });

  it('status desconhecido vira Disponível', () => {
    expect(parsePresenceStatus('ocupadíssimo')).toBe('online');
    expect(parsePresenceStatus('away')).toBe('away');
  });

  it('amigo: off-line com o app fechado ou invisível; servidor antigo sem status vale on-line', () => {
    const recent = new Date(NOW - 60_000).toISOString();
    const old = new Date(NOW - 20 * 60_000).toISOString();
    expect(friendPresence({ lastSeenAt: recent }, NOW)).toBe('online');
    expect(friendPresence({ lastSeenAt: recent, presence: 'dnd' }, NOW)).toBe('dnd');
    expect(friendPresence({ lastSeenAt: recent, presence: 'offline' }, NOW)).toBe('offline');
    expect(friendPresence({ lastSeenAt: old, presence: 'away' }, NOW)).toBe('offline');
  });
});

describe('chamar pra call no Discord: como o aviso chega', () => {
  const base = { presence: 'online' as const, gameRunning: false, missed: false };

  it('padrão: tela doida, inclusive para quem está Ausente (deitado olhando o monitor)', () => {
    expect(decideCallDelivery(DEFAULT_CALL_SETTINGS, base)).toBe('chaos');
    expect(decideCallDelivery(DEFAULT_CALL_SETTINGS, { ...base, presence: 'away' })).toBe('chaos');
  });

  it('Não perturbar e chamada perdida chegam quietas; desligado responde ocupado', () => {
    expect(decideCallDelivery(DEFAULT_CALL_SETTINGS, { ...base, presence: 'dnd' })).toBe('quiet');
    expect(decideCallDelivery(DEFAULT_CALL_SETTINGS, { ...base, missed: true })).toBe('quiet');
    expect(decideCallDelivery({ ...DEFAULT_CALL_SETTINGS, alert: 'off' }, base)).toBe('decline');
    expect(decideCallDelivery({ ...DEFAULT_CALL_SETTINGS, alert: 'off' }, { ...base, presence: 'dnd' })).toBe('decline');
  });

  it('com jogo aberto vira notificação, a não ser que a pessoa peça a tela doida mesmo jogando', () => {
    expect(decideCallDelivery(DEFAULT_CALL_SETTINGS, { ...base, gameRunning: true })).toBe('notify');
    expect(decideCallDelivery({ ...DEFAULT_CALL_SETTINGS, whilePlaying: true }, { ...base, gameRunning: true })).toBe('chaos');
    expect(decideCallDelivery({ ...DEFAULT_CALL_SETTINGS, alert: 'notify' }, base)).toBe('notify');
  });

  it('configurações salvas: lê e corrige valores ruins', () => {
    expect(parseCallSettings(undefined)).toEqual(DEFAULT_CALL_SETTINGS);
    expect(parseCallSettings({ callAlert: 'notify', callVolume: '250', callWhilePlaying: 'true', callOpenDiscord: 'false' })).toEqual({
      alert: 'notify',
      volume: 100,
      whilePlaying: true,
      openDiscord: false
    });
    expect(parseCallSettings({ callAlert: 'barulho', callVolume: 'alto' })).toEqual(DEFAULT_CALL_SETTINGS);
    expect(parseCallSettings({ callVolume: '0' }).volume).toBe(0);
  });
});
