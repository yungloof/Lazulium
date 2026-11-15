import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseCeremonyEnabled,
  shouldHoldCeremony,
  useCeremonyStore,
  vibrateGamepadForCeremony
} from '../../src/renderer/src/stores/useCeremonyStore';

beforeEach(() => {
  useCeremonyStore.getState().setEnabled(true);
  useCeremonyStore.getState().dismissAll();
  useCeremonyStore.setState({ deferred: [] });
});

describe('useCeremonyStore & ceremony feedback', () => {
  it('lê a chave ceremoniesEnabled corretamente', () => {
    expect(parseCeremonyEnabled(undefined)).toBe(true);
    expect(parseCeremonyEnabled({ ceremoniesEnabled: 'true' })).toBe(true);
    expect(parseCeremonyEnabled({ ceremoniesEnabled: 'false' })).toBe(false);
  });

  it('segura cerimônia quando há jogo rodando fora do foco e libera ao fechar', () => {
    expect(shouldHoldCeremony({ g1: { gameId: 'g1', state: 'running', isRunning: true } }, false)).toBe(true);
    expect(shouldHoldCeremony({ g1: { gameId: 'g1', state: 'running', isRunning: true } }, true)).toBe(false);

    useCeremonyStore.getState().enqueue(
      { id: 'c1', kind: 'achievement', gameId: 'g1', gameTitle: 'Hades', achievementName: 'Escapou' },
      true
    );
    expect(useCeremonyStore.getState().active).toBeNull();
    expect(useCeremonyStore.getState().deferred).toHaveLength(1);

    useCeremonyStore.getState().flushDeferred();
    expect(useCeremonyStore.getState().active?.id).toBe('c1');
    expect(useCeremonyStore.getState().deferred).toHaveLength(0);
  });

  it('respeita chave desligada limpando a fila', () => {
    useCeremonyStore.getState().setEnabled(false);
    useCeremonyStore.getState().enqueue({ id: 'c2', kind: 'finished', gameId: 'g2', gameTitle: 'Celeste' });
    expect(useCeremonyStore.getState().active).toBeNull();
  });

  it('vibra o controle quando normal e fica calmo em prefers-reduced-motion', () => {
    const playEffect = vi.fn(async () => 'complete');
    vi.stubGlobal('navigator', {
      getGamepads: () => [{ connected: true, vibrationActuator: { playEffect } }]
    });

    vibrateGamepadForCeremony('achievement', true);
    expect(playEffect).not.toHaveBeenCalled();

    vibrateGamepadForCeremony('perfect', false);
    expect(playEffect).toHaveBeenCalledWith(
      'dual-rumble',
      expect.objectContaining({ duration: 320, weakMagnitude: 0.55, strongMagnitude: 0.4 })
    );
    vi.unstubAllGlobals();
  });
});
