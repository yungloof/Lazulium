import { useEffect, useRef } from 'react';
import { useGamepadStore } from '../stores/useGamepadStore';
import { navAudio } from '../utils/navigationAudio';

interface UseGamepadOptions {
  itemCount: number;
  columns?: number;
  onSelect?: (index: number) => void;
  onBack?: () => void;
  onToggleFavorite?: (index: number) => void;
  onNextTab?: () => void;
  onPrevTab?: () => void;
  onSearch?: () => void;
  onMenu?: () => void;
}

export function useGamepad({
  itemCount,
  columns = 5,
  onSelect,
  onBack,
  onToggleFavorite,
  onNextTab,
  onPrevTab,
  onSearch,
  onMenu
}: UseGamepadOptions) {
  const { setGamepad, setActiveFocusedIndex, setIsGamepadActive } = useGamepadStore();
  const lastButtonPress = useRef<{ [key: number]: number }>({});
  const lastAxisPress = useRef<{ [key: string]: number }>({});

  // 1. Monitoramento do Gamepad
  useEffect(() => {
    let animationFrameId = 0;
    let polling = false;
    let startPolling = () => {};

    const handleConnected = (e: GamepadEvent) => {
      console.log('[Gamepad] Conectado:', e.gamepad.id);
      startPolling();
      setGamepad({
        index: e.gamepad.index,
        id: e.gamepad.id,
        connected: true
      });
      setIsGamepadActive(true);
      navAudio.playSelect();
    };

    const handleDisconnected = (e: GamepadEvent) => {
      console.log('[Gamepad] Desconectado:', e.gamepad.id);
      setGamepad(null);
    };

    window.addEventListener('gamepadconnected', handleConnected);
    window.addEventListener('gamepaddisconnected', handleDisconnected);

    // Verificação inicial
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

    const poll = (time: number) => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0];

      // Sem grade visível (ex: página do jogo) os botões de ação continuam valendo; só o direcional depende de itens
      if (gp) {
        const hasItems = itemCount > 0;
        const BUTTON_COOLDOWN = 180; // ms de intervalo entre repetições
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

        // Mapeamento padrão (W3C Standard Gamepad):
        // D-Pad: 12 (Cima), 13 (Baixo), 14 (Esquerda), 15 (Direita)
        // Botões Frontais: 0 (A / Cross), 1 (B / Circle), 2 (X / Square), 3 (Y / Triangle)
        // Bumpers: 4 (LB / L1), 5 (RB / R1)
        // Sistema: 8 (Select / Back / Share), 9 (Start / Menu / Options)
        // Analógico Esquerdo: Eixos 0 (X), 1 (Y)

        const leftStickX = gp.axes[0] || 0;
        const leftStickY = gp.axes[1] || 0;

        // Navegação: Direita
        if (hasItems && ((isPressed(15) && canPress(15)) || (leftStickX > AXIS_THRESHOLD && canMoveAxis('stick-right')))) {
          setActiveFocusedIndex((prev) => {
            const next = Math.min(prev + 1, itemCount - 1);
            if (next !== prev) navAudio.playMove();
            return next;
          });
        }

        // Navegação: Esquerda
        if (hasItems && ((isPressed(14) && canPress(14)) || (leftStickX < -AXIS_THRESHOLD && canMoveAxis('stick-left')))) {
          setActiveFocusedIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            if (next !== prev) navAudio.playMove();
            return next;
          });
        }

        // Navegação: Baixo
        if (hasItems && ((isPressed(13) && canPress(13)) || (leftStickY > AXIS_THRESHOLD && canMoveAxis('stick-down')))) {
          setActiveFocusedIndex((prev) => {
            const next = Math.min(prev + columns, itemCount - 1);
            if (next !== prev) navAudio.playMove();
            return next;
          });
        }

        // Navegação: Cima
        if (hasItems && ((isPressed(12) && canPress(12)) || (leftStickY < -AXIS_THRESHOLD && canMoveAxis('stick-up')))) {
          setActiveFocusedIndex((prev) => {
            const next = Math.max(prev - columns, 0);
            if (next !== prev) navAudio.playMove();
            return next;
          });
        }

        // Ação: A / Cross (Selecionar / Jogar)
        if (isPressed(0) && canPress(0)) {
          const currentIndex = useGamepadStore.getState().activeFocusedIndex;
          navAudio.playSelect();
          onSelect?.(currentIndex);
        }

        // Ação: B / Circle (Voltar / Fechar)
        if (isPressed(1) && canPress(1)) {
          navAudio.playBack();
          onBack?.();
        }

        // Ação: X / Square (Favoritar)
        if (isPressed(2) && canPress(2)) {
          const currentIndex = useGamepadStore.getState().activeFocusedIndex;
          navAudio.playFavorite();
          onToggleFavorite?.(currentIndex);
        }

        // Ação: Y / Triangle (Busca rápida)
        if (isPressed(3) && canPress(3)) {
          navAudio.playSelect();
          onSearch?.();
        }

        // Ação: LB / L1 (Filtro Anterior)
        if (isPressed(4) && canPress(4)) {
          navAudio.playTab();
          onPrevTab?.();
        }

        // Ação: RB / R1 (Próximo Filtro)
        if (isPressed(5) && canPress(5)) {
          navAudio.playTab();
          onNextTab?.();
        }

        // Ação: Start / Menu (Configurações / Menu)
        if (isPressed(9) && canPress(9)) {
          navAudio.playSelect();
          onMenu?.();
        }
      }

      // Sem controle conectado o loop para (evita 60 leituras/s à toa); volta no gamepadconnected
      if (Array.from(gamepads).some(Boolean)) animationFrameId = requestAnimationFrame(poll);
      else polling = false;
    };

    startPolling = () => {
      if (polling) return;
      polling = true;
      animationFrameId = requestAnimationFrame(poll);
    };
    if (Array.from(pads).some(Boolean)) startPolling();

    return () => {
      window.removeEventListener('gamepadconnected', handleConnected);
      window.removeEventListener('gamepaddisconnected', handleDisconnected);
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    itemCount,
    columns,
    onSelect,
    onBack,
    onToggleFavorite,
    onNextTab,
    onPrevTab,
    onSearch,
    onMenu,
    setActiveFocusedIndex,
    setGamepad,
    setIsGamepadActive
  ]);

  // 2. Navegação Espacial pelo Teclado (quando usuário usa setas direcionais)
  useEffect(() => {
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

      if (itemCount === 0) return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setActiveFocusedIndex((prev) => {
            const next = Math.min(prev + 1, itemCount - 1);
            if (next !== prev) navAudio.playMove();
            return next;
          });
          break;

        case 'ArrowLeft':
          e.preventDefault();
          setActiveFocusedIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            if (next !== prev) navAudio.playMove();
            return next;
          });
          break;

        case 'ArrowDown':
          e.preventDefault();
          setActiveFocusedIndex((prev) => {
            const next = Math.min(prev + columns, itemCount - 1);
            if (next !== prev) navAudio.playMove();
            return next;
          });
          break;

        case 'ArrowUp':
          e.preventDefault();
          setActiveFocusedIndex((prev) => {
            const next = Math.max(prev - columns, 0);
            if (next !== prev) navAudio.playMove();
            return next;
          });
          break;

        case 'Enter':
          e.preventDefault();
          navAudio.playSelect();
          onSelect?.(useGamepadStore.getState().activeFocusedIndex);
          break;

        case 'f':
        case 'F':
          e.preventDefault();
          navAudio.playFavorite();
          onToggleFavorite?.(useGamepadStore.getState().activeFocusedIndex);
          break;

        case '/':
          e.preventDefault();
          navAudio.playSelect();
          onSearch?.();
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [itemCount, columns, onSelect, onToggleFavorite, onSearch, setActiveFocusedIndex]);
}
