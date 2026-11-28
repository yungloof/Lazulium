import type { OutgoingCall } from '../stores/useSocialLiveStore';

// Em que pé está a chamada que você fez para um amigo, como num telefone
export const CALL_RING_MS = 2 * 60_000;     // Mesmo prazo do servidor: depois disso a chamada vira "perdida"
export const CALL_RESULT_MS = 2 * 60_000;   // Quanto tempo a resposta (ou o "não atendeu") fica em cima do botão

export type CallPhase = 'idle' | 'ringing' | 'answered' | 'unanswered';

export function callPhase(outgoing: OutgoingCall | undefined, now: number): CallPhase {
  if (!outgoing) return 'idle';
  if (outgoing.answer) return now - (outgoing.answeredAt ?? outgoing.at) < CALL_RESULT_MS ? 'answered' : 'idle';
  if (now - outgoing.at < CALL_RING_MS) return 'ringing';
  return now - outgoing.at < CALL_RING_MS + CALL_RESULT_MS ? 'unanswered' : 'idle';
}
