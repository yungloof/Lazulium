import { create } from 'zustand';

export interface GamepadInfo {
  index: number;
  id: string; // Ex: "Xbox 360 Controller (XInput STANDARD GAMEPAD)"
  connected: boolean;
}

interface GamepadState {
  gamepad: GamepadInfo | null;
  setGamepad: (gamepad: GamepadInfo | null) => void;
}

export const useGamepadStore = create<GamepadState>((set) => ({
  gamepad: null,
  setGamepad: (gamepad) => set({ gamepad })
}));
