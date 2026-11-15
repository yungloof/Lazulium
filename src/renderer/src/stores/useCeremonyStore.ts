import { create } from 'zustand';
import { CeremonyEvent, CeremonyKind, GameLaunchStatus } from '@shared/types/ipc';

export const CEREMONY_SETTING_KEYS = {
  enabled: 'ceremoniesEnabled'
} as const;

const MAX_RENDERER_QUEUE = 20;

export function parseCeremonyEnabled(settings?: Record<string, string>): boolean {
  return settings?.[CEREMONY_SETTING_KEYS.enabled] !== 'false';
}

export function shouldHoldCeremony(
  launchStatuses: Record<string, GameLaunchStatus>,
  hasFocus: boolean
): boolean {
  if (hasFocus) return false;
  return Object.values(launchStatuses).some((status) => status.state === 'running');
}

interface RumbleParams {
  startDelay?: number;
  duration: number;
  weakMagnitude: number;
  strongMagnitude: number;
}

const RUMBLE_PROFILE: Record<CeremonyKind, RumbleParams> = {
  achievement: { duration: 160, weakMagnitude: 0.35, strongMagnitude: 0.15 },
  finished: { duration: 240, weakMagnitude: 0.45, strongMagnitude: 0.3 },
  perfect: { duration: 320, weakMagnitude: 0.55, strongMagnitude: 0.4 }
};

/**
 * Emits a subtle pulse via Gamepad Haptics API when ceremonies are active and reduced motion is off.
 */
export function vibrateGamepadForCeremony(kind: CeremonyKind, calm: boolean): void {
  if (calm || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
  const profile = RUMBLE_PROFILE[kind];
  try {
    const pads = Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => Boolean(pad?.connected));
    for (const pad of pads) {
      const actuator = (pad as Gamepad & {
        vibrationActuator?: { playEffect?: (type: string, params: RumbleParams) => Promise<unknown> };
      }).vibrationActuator;
      if (typeof actuator?.playEffect === 'function') {
        void actuator.playEffect('dual-rumble', { startDelay: 0, ...profile }).catch(() => undefined);
      }
    }
  } catch {
    // Controles sem suporte de vibração nunca devem quebrar a interface
  }
}

const hasDuplicate = (list: CeremonyEvent[], id: string) => list.some((item) => item.id === id);

interface CeremonyState {
  enabled: boolean;
  active: CeremonyEvent | null;
  queue: CeremonyEvent[];
  deferred: CeremonyEvent[];

  setEnabled: (enabled: boolean) => void;
  enqueue: (event: CeremonyEvent, holdWhilePlaying?: boolean) => void;
  flushDeferred: () => void;
  dismissActive: () => void;
  dismissAll: () => void;
}

export const useCeremonyStore = create<CeremonyState>((set) => ({
  enabled: true,
  active: null,
  queue: [],
  deferred: [],

  setEnabled: (enabled) =>
    set((state) => (enabled ? { enabled } : { enabled: false, active: null, queue: [], deferred: [] })),

  enqueue: (event, holdWhilePlaying = false) =>
    set((state) => {
      if (!state.enabled) return state;
      if (
        state.active?.id === event.id ||
        hasDuplicate(state.queue, event.id) ||
        hasDuplicate(state.deferred, event.id)
      ) {
        return state;
      }
      if (holdWhilePlaying) {
        const nextDeferred = [...state.deferred, event].slice(-MAX_RENDERER_QUEUE);
        return { deferred: nextDeferred };
      }
      if (!state.active) return { active: event };
      const nextQueue = [...state.queue, event].slice(-MAX_RENDERER_QUEUE);
      return { queue: nextQueue };
    }),

  flushDeferred: () =>
    set((state) => {
      if (!state.enabled || state.deferred.length === 0) return state.deferred.length ? { deferred: [] } : state;
      const incoming = state.deferred;
      if (!state.active) {
        const [first, ...rest] = incoming;
        return { active: first, queue: [...state.queue, ...rest].slice(-MAX_RENDERER_QUEUE), deferred: [] };
      }
      return { queue: [...state.queue, ...incoming].slice(-MAX_RENDERER_QUEUE), deferred: [] };
    }),

  dismissActive: () =>
    set((state) => {
      if (state.queue.length === 0) return { active: null };
      const [next, ...rest] = state.queue;
      return { active: next, queue: rest };
    }),

  dismissAll: () => set({ active: null, queue: [] })
}));
