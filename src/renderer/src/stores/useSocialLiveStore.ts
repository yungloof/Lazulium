import { create } from 'zustand';
import { CallAnswer, IncomingCall, PresenceState } from '@shared/types/social';

// O que muda ao vivo na conta Lazulium: seu status e as chamadas (recebidas e as que você fez)

export interface OutgoingCall {
  callId: string;
  at: number;              // Quando você chamou
  rang?: boolean;          // Já tocou no PC do amigo
  answer?: CallAnswer;
  answeredAt?: number;
}

interface SocialLiveState {
  connected: boolean;
  presence: PresenceState | null;
  incoming: IncomingCall[];
  outgoing: Record<string, OutgoingCall>;   // Por amigo: a última chamada que você fez

  setConnected: (connected: boolean) => void;
  setPresence: (presence: PresenceState) => void;
  setIncoming: (calls: IncomingCall[]) => void;
  addIncoming: (call: IncomingCall) => void;
  removeIncoming: (callId: string) => void;
  markCalled: (friendId: string, callId: string) => void;
  markRang: (friendId: string, callId: string) => void;
  markAnswered: (friendId: string, callId: string, answer: CallAnswer) => void;
  clearOutgoing: (friendId: string) => void;
}

export const useSocialLiveStore = create<SocialLiveState>((set) => ({
  connected: false,
  presence: null,
  incoming: [],
  outgoing: {},

  setConnected: (connected) => set(connected ? { connected } : { connected, incoming: [], outgoing: {} }),
  setPresence: (presence) => set({ presence }),
  setIncoming: (incoming) => set({ incoming }),
  addIncoming: (call) => set((s) => ({ incoming: [...s.incoming.filter((c) => c.id !== call.id), call] })),
  removeIncoming: (callId) => set((s) => ({ incoming: s.incoming.filter((c) => c.id !== callId) })),
  markCalled: (friendId, callId) => set((s) => ({ outgoing: { ...s.outgoing, [friendId]: { callId, at: Date.now() } } })),
  // Só a chamada mais recente de cada amigo: aviso de uma chamada antiga não mexe no botão
  markRang: (friendId, callId) =>
    set((s) => {
      const current = s.outgoing[friendId];
      if (current?.callId !== callId || current.rang || current.answer) return s;
      return { outgoing: { ...s.outgoing, [friendId]: { ...current, rang: true } } };
    }),
  markAnswered: (friendId, callId, answer) =>
    set((s) => {
      const current = s.outgoing[friendId];
      if (current && current.callId !== callId && current.at > Date.now() - 2 * 60_000 && !current.answer) return s;
      return { outgoing: { ...s.outgoing, [friendId]: { callId, at: current?.callId === callId ? current.at : Date.now(), rang: true, answer, answeredAt: Date.now() } } };
    }),
  clearOutgoing: (friendId) =>
    set((s) => {
      const { [friendId]: _gone, ...rest } = s.outgoing;
      return { outgoing: rest };
    })
}));
