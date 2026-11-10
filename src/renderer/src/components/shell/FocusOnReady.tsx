import React, { useEffect } from 'react';
import { focusStart, isFocusTarget, isNavActive, topOverlay } from '../../utils/spatialNav';

// Fica dentro do Suspense: o efeito só roda quando a página carregada sob demanda já está na tela,
// então quem usa o controle recebe o foco no botão principal em vez de ficar sem foco
export const FocusOnReady: React.FC<{ gameId?: string; overlay?: boolean }> = ({ gameId, overlay = false }) => {
  useEffect(() => {
    if (!isNavActive()) return;
    // Uma página que termina de carregar por baixo de uma janela não rouba o foco dela
    if (!overlay && topOverlay()) return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      const scope = topOverlay() ?? document.querySelector('main');
      if (isFocusTarget(active) && scope?.contains(active)) return;
      focusStart(gameId);
    });
    return () => cancelAnimationFrame(frame);
  }, [gameId, overlay]);
  return null;
};
