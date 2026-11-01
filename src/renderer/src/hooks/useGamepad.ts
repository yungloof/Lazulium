import { useEffect, useRef } from 'react';
import { useGamepadStore } from '../stores/useGamepadStore';

interface UseGamepadOptions {
  itemCount: number;
  columns?: number;
  onSelect?: (index: number) => void;
  onBack?: () => void;
  onToggleFavorite?: (index: number) => void;
  onNextTab?: () => void;
  onPrevTab?: () => void;
}

export function useGamepad({
  itemCount,
  columns = 5,
  onSelect,
  onBack,
  onToggleFavorite,
  onNextTab,
  onPrevTab
}: UseGamepadOptions) {
  const { setGamepad, setActiveFocusedIndex, setIsGamepadActive } = useGamepadStore();
  const lastButtonPress = useRef<{ [key: number]: number }>({});
  const lastAxisPress = useRef<{ [key: string]: number }>({});

  useEffect(() => {
    const handleConnected = (e: GamepadEvent) => {
      console.log('[Gamepad] Connected:', e.gamepad.id);
      setGamepad({
        index: e.gamepad.index,
        id: e.gamepad.id,
        connected: true
      });
      setIsGamepadActive(true);
    };

    const handleDisconnected = (e: GamepadEvent) => {
      console.log('[Gamepad] Disconnected:', e.gamepad.id);
      setGamepad(null);
    };

    window.addEventListener('gamepadconnected', handleConnected);
    window.addEventListener('gamepaddisconnected', handleDisconnected);

    // Initial check
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (pad) {
        setGamepad({
          index: pad.index,
          id: pad.id,
          connected: true
        });
        break;
      }
    }

    let animationFrameId: number;

    const poll = (time: number) => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0];

      if (gp && itemCount > 0) {
        const BUTTON_COOLDOWN = 180; // ms between repeat inputs
        const AXIS_THRESHOLD = 0.5;

        const isPressed = (btnIndex: number) => gp.buttons[btnIndex]?.pressed;
        const canPress = (btnIndex: number) => {
          const last = lastButtonPress.current[btnIndex] || 0;
          if (time - last > BUTTON_COOLDOWN) {
            lastButtonPress.current[btnIndex] = time;
            setIsGamepadActive(true);
            return true;
          }
          return false;
        };

        const canMoveAxis = (axisKey: string) => {
          const last = lastAxisPress.current[axisKey] || 0;
          if (time - last > BUTTON_COOLDOWN) {
            lastAxisPress.current[axisKey] = time;
            setIsGamepadActive(true);
            return true;
          }
          return false;
        };

        // Standard Gamepad Mapping:
        // D-Pad: 12 (Up), 13 (Down), 14 (Left), 15 (Right)
        // Face Buttons: 0 (A / Cross), 1 (B / Circle), 2 (X / Square), 3 (Y / Triangle)
        // Bumpers: 4 (LB / L1), 5 (RB / R1)
        // Left Stick: Axes 0 (X), 1 (Y)

        const leftStickX = gp.axes[0] || 0;
        const leftStickY = gp.axes[1] || 0;

        // Navigation: Right
        if ((isPressed(15) && canPress(15)) || (leftStickX > AXIS_THRESHOLD && canMoveAxis('stick-right'))) {
          setActiveFocusedIndex((prev) => Math.min(prev + 1, itemCount - 1));
        }

        // Navigation: Left
        if ((isPressed(14) && canPress(14)) || (leftStickX < -AXIS_THRESHOLD && canMoveAxis('stick-left'))) {
          setActiveFocusedIndex((prev) => Math.max(prev - 1, 0));
        }

        // Navigation: Down
        if ((isPressed(13) && canPress(13)) || (leftStickY > AXIS_THRESHOLD && canMoveAxis('stick-down'))) {
          setActiveFocusedIndex((prev) => Math.min(prev + columns, itemCount - 1));
        }

        // Navigation: Up
        if ((isPressed(12) && canPress(12)) || (leftStickY < -AXIS_THRESHOLD && canMoveAxis('stick-up'))) {
          setActiveFocusedIndex((prev) => Math.max(prev - columns, 0));
        }

        // Action: A / Cross (Select / Launch)
        if (isPressed(0) && canPress(0)) {
          const currentIndex = useGamepadStore.getState().activeFocusedIndex;
          onSelect?.(currentIndex);
        }

        // Action: B / Circle (Back)
        if (isPressed(1) && canPress(1)) {
          onBack?.();
        }

        // Action: X / Square (Toggle Favorite)
        if (isPressed(2) && canPress(2)) {
          const currentIndex = useGamepadStore.getState().activeFocusedIndex;
          onToggleFavorite?.(currentIndex);
        }

        // Action: LB / RB (Tab Switching)
        if (isPressed(4) && canPress(4)) {
          onPrevTab?.();
        }
        if (isPressed(5) && canPress(5)) {
          onNextTab?.();
        }
      }

      animationFrameId = requestAnimationFrame(poll);
    };

    animationFrameId = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('gamepadconnected', handleConnected);
      window.removeEventListener('gamepaddisconnected', handleDisconnected);
    };
  }, [itemCount, columns, onSelect, onBack, onToggleFavorite, onNextTab, onPrevTab, setGamepad, setActiveFocusedIndex, setIsGamepadActive]);
}
