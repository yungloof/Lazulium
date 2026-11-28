import { beforeEach, describe, expect, it } from 'vitest';
import { CALL_RESULT_MS, CALL_RING_MS, callPhase } from '../../src/renderer/src/utils/callPhase';
import { useSocialLiveStore } from '../../src/renderer/src/stores/useSocialLiveStore';

const T0 = 1_800_000_000_000;

describe('em que pé está a chamada que você fez', () => {
  it('chamando, depois "não atendeu" por um tempo, depois volta ao normal', () => {
    const call = { callId: 'c1', at: T0 };
    expect(callPhase(undefined, T0)).toBe('idle');
    expect(callPhase(call, T0 + 1_000)).toBe('ringing');
    expect(callPhase(call, T0 + CALL_RING_MS + 1)).toBe('unanswered');
    expect(callPhase(call, T0 + CALL_RING_MS + CALL_RESULT_MS + 1)).toBe('idle');
  });

  it('a resposta fica em cima do botão um tempo a partir de quando chegou, mesmo se chegou tarde', () => {
    const late = { callId: 'c1', at: T0, answer: 'yes' as const, answeredAt: T0 + 10 * 60_000 };
    expect(callPhase(late, T0 + 10 * 60_000 + 1_000)).toBe('answered');
    expect(callPhase(late, T0 + 10 * 60_000 + CALL_RESULT_MS + 1)).toBe('idle');
  });
});

describe('loja das chamadas', () => {
  beforeEach(() => useSocialLiveStore.setState({ outgoing: {}, incoming: [] }));

  it('"tocou" e a resposta só mexem na chamada mais recente do amigo', () => {
    const store = useSocialLiveStore.getState();
    store.markCalled('amiga', 'nova');
    store.markRang('amiga', 'velha');
    expect(useSocialLiveStore.getState().outgoing.amiga.rang).toBeUndefined();
    store.markRang('amiga', 'nova');
    expect(useSocialLiveStore.getState().outgoing.amiga.rang).toBe(true);
    // Resposta atrasada de uma chamada antiga não estraga a que está tocando
    store.markAnswered('amiga', 'velha', 'no');
    expect(useSocialLiveStore.getState().outgoing.amiga.callId).toBe('nova');
    expect(useSocialLiveStore.getState().outgoing.amiga.answer).toBeUndefined();
    store.markAnswered('amiga', 'nova', 'yes');
    expect(useSocialLiveStore.getState().outgoing.amiga).toMatchObject({ callId: 'nova', answer: 'yes', rang: true });
  });

  it('desligar tira a chamada do botão', () => {
    const store = useSocialLiveStore.getState();
    store.markCalled('amiga', 'c1');
    store.markCalled('outra', 'c2');
    store.clearOutgoing('amiga');
    expect(Object.keys(useSocialLiveStore.getState().outgoing)).toEqual(['outra']);
  });
});
