import { useEffect, useRef } from 'react';
import { useGamepadStore } from '../stores/useGamepadStore';
import { navAudio } from '../utils/navigationAudio';
import { activateFocused, moveFocus, NavDirection, setNavActive } from '../utils/spatialNav';

interface UseGamepadOptions {
  onBack?: () => void;
  onToggleFavorite?: () => void;
  onNextFilter?: () => void;
  onPrevFilter?: () => void;
  onNextSection?: () => void;
  onPrevSection?: () => void;
  onSearch?: () => void;
  onMenu?: () => void;
}

const AXIS_THRESHOLD = 0.5;
const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 130;

// Mapeamento padrão (W3C Standard Gamepad): D-Pad 12-15, analógico esquerdo nos eixos 0 e 1
const DIRECTIONS: { direction: NavDirection; button: number; axis: number; sign: number }[] = [
  { direction: 'up', button: 12, axis: 1, sign: -1 },
  { direction: 'down', button: 13, axis: 1, sign: 1 },
  { direction: 'left', button: 14, axis: 0, sign: -1 },
  { direction: 'right', button: 15, axis: 0, sign: 1 }
];

const move = (direction: NavDirection) => {
  if (moveFocus(direction)) navAudio.playMove();
};

export function useGamepad(options: UseGamepadOptions) {
  const setGamepad = useGamepadStore((s) => s.setGamepad);
  // As funções mudam a cada render do App; o monitoramento lê sempre as atuais sem precisar reiniciar
  const handlers = useRef(options);
  handlers.current = options;

  // 1. Monitoramento do Gamepad
  useEffect(() => {
    let animationFrameId = 0;
    let polling = false;
    const held = new Set<number>();
    const nextRepeat = new Map<NavDirection, number>();

    // Botões de ação valem uma vez por aperto: segurar o A ao abrir um jogo não pode iniciar o jogo
    const actions: [number, () => void][] = [
      [0, () => { navAudio.playSelect(); activateFocused(); }],
      [1, () => { navAudio.playBack(); handlers.current.onBack?.(); }],
      [2, () => { navAudio.playFavorite(); handlers.current.onToggleFavorite?.(); }],
      [3, () => { navAudio.playSelect(); handlers.current.onSearch?.(); }],
      [4, () => { navAudio.playTab(); handlers.current.onPrevFilter?.(); }],
      [5, () => { navAudio.playTab(); handlers.current.onNextFilter?.(); }],
      [6, () => { navAudio.playTab(); handlers.current.onPrevSection?.(); }],
      [7, () => { navAudio.playTab(); handlers.current.onNextSection?.(); }],
      [9, () => { navAudio.playSelect(); handlers.current.onMenu?.(); }]
    ];

    const poll = (time: number) => {
      const pads = Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => !!pad);
      // Com um jogo na frente, o controle é do jogo: o Lazulium não reage em segundo plano
      const focused = document.hasFocus();
      const isPressed = (button: number) => pads.some((pad) => pad.buttons[button]?.pressed);

      for (const [button, action] of actions) {
        const pressed = isPressed(button);
        if (pressed && !held.has(button) && focused) action();
        if (pressed) held.add(button);
        else held.delete(button);
      }

      for (const { direction, button, axis, sign } of DIRECTIONS) {
        const pressed = isPressed(button) || pads.some((pad) => (pad.axes[axis] ?? 0) * sign > AXIS_THRESHOLD);
        if (!pressed) {
          nextRepeat.delete(direction);
          continue;
        }
        const next = nextRepeat.get(direction);
        if (!focused) {
          nextRepeat.set(direction, Infinity);
        } else if (next === undefined) {
          move(direction);
          nextRepeat.set(direction, time + REPEAT_DELAY_MS);
        } else if (time >= next) {
          move(direction);
          nextRepeat.set(direction, time + REPEAT_INTERVAL_MS);
        }
      }

      // Sem controle conectado o loop para (evita 60 leituras/s à toa); volta no gamepadconnected
      if (pads.length > 0) animationFrameId = requestAnimationFrame(poll);
      else polling = false;
    };

    const startPolling = () => {
      if (polling) return;
      polling = true;
      animationFrameId = requestAnimationFrame(poll);
    };

    const handleConnected = (e: GamepadEvent) => {
      console.log('[Gamepad] Conectado:', e.gamepad.id);
      setGamepad({ index: e.gamepad.index, id: e.gamepad.id, connected: true });
      navAudio.playSelect();
      startPolling();
    };

    const handleDisconnected = (e: GamepadEvent) => {
      console.log('[Gamepad] Desconectado:', e.gamepad.id);
      const remaining = Array.from(navigator.getGamepads()).find((pad) => pad && pad.index !== e.gamepad.index);
      setGamepad(remaining ? { index: remaining.index, id: remaining.id, connected: true } : null);
    };

    window.addEventListener('gamepadconnected', handleConnected);
    window.addEventListener('gamepaddisconnected', handleDisconnected);

    // Verificação inicial
    const connected = Array.from(navigator.getGamepads()).find(Boolean);
    if (connected) {
      setGamepad({ index: connected.index, id: connected.id, connected: true });
      startPolling();
    }

    return () => {
      window.removeEventListener('gamepadconnected', handleConnected);
      window.removeEventListener('gamepaddisconnected', handleDisconnected);
      cancelAnimationFrame(animationFrameId);
    };
  }, [setGamepad]);

  // 2. Setas do teclado: mesma navegação do controle
  useEffect(() => {
    const ARROWS: Record<string, NavDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora atalhos de navegação se o usuário estiver digitando em um input ou textarea
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (isInput) {
        if (e.key === 'Escape') {
          target.blur();
          navAudio.playBack();
        }
        return;
      }

      if (ARROWS[e.key] && !e.altKey) {
        e.preventDefault();
        move(ARROWS[e.key]);
        return;
      }

      switch (e.key) {
        case 'Enter':
          // Botões já respondem ao Enter sozinhos
          if (target?.tagName === 'BUTTON' || target?.tagName === 'A') return;
          e.preventDefault();
          navAudio.playSelect();
          activateFocused();
          break;

        case 'f':
        case 'F':
          e.preventDefault();
          navAudio.playFavorite();
          handlers.current.onToggleFavorite?.();
          break;

        case '/':
          e.preventDefault();
          navAudio.playSelect();
          handlers.current.onSearch?.();
          break;

        default:
          break;
      }
    };

    const endNavigation = () => setNavActive(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', endNavigation);
    window.addEventListener('mousemove', endNavigation);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', endNavigation);
      window.removeEventListener('mousemove', endNavigation);
    };
  }, []);
}
