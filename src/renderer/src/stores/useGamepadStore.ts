import { create } from 'zustand';

export interface GamepadInfo {
  index: number;
  id: string; // Ex: "Xbox 360 Controller (XInput STANDARD GAMEPAD)"
  connected: boolean;
}

interface GamepadState {
  gamepad: GamepadInfo | null;
  activeFocusedIndex: number;
  isGamepadActive: boolean; // True when user pressed a gamepad button recently
  setGamepad: (gamepad: GamepadInfo | null) => void;
  setActiveFocusedIndex: (index: number | ((prev: number) => number)) => void;
  setIsGamepadActive: (active: boolean) => void;
}

export const useGamepadStore = create<GamepadState>((set) => ({
  gamepad: null,
  activeFocusedIndex: 0,
  isGamepadActive: false,
  setGamepad: (gamepad) => set({ gamepad }),
  setActiveFocusedIndex: (index) =>
    set((state) => ({
      activeFocusedIndex: typeof index === 'function' ? index(state.activeFocusedIndex) : index
    })),
  setIsGamepadActive: (isGamepadActive) => set({ isGamepadActive })
}));
