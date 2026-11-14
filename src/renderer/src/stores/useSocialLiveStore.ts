import { create } from 'zustand';
import { CallAnswer, IncomingCall, PresenceState } from '@shared/types/social';

// O que muda ao vivo na conta Lazulium: seu status e as chamadas (recebidas e as que você fez)

export interface OutgoingCall {
  callId: string;
  at: number;
  answer?: CallAnswer;
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
  markAnswered: (friendId: string, callId: string, answer: CallAnswer) => void;
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
  markAnswered: (friendId, callId, answer) =>
    set((s) => {
      const current = s.outgoing[friendId];
      return { outgoing: { ...s.outgoing, [friendId]: { callId, at: current?.at ?? Date.now(), answer } } };
    })
}));
