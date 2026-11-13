import type { DragEvent } from 'react';

// Arrastar um jogo (linha da lista lateral ou capa) para uma categoria

const GAME_DRAG_TYPE = 'application/x-lazulium-game';

export interface GameDrag {
  gameId: string;
  fromCategoryId?: string;          // Saiu de dentro desta categoria na lista lateral
}

export function startGameDrag(e: DragEvent, gameId: string, fromCategoryId?: string): void {
  const drag: GameDrag = { gameId, fromCategoryId };
  e.dataTransfer.setData(GAME_DRAG_TYPE, JSON.stringify(drag));
  e.dataTransfer.effectAllowed = 'copyMove';
}

// Durante o arrasto o navegador só mostra os tipos, não o conteúdo
export const isGameDrag = (e: DragEvent): boolean => e.dataTransfer.types.includes(GAME_DRAG_TYPE);

export function readGameDrag(e: DragEvent): GameDrag | null {
  try {
    const drag = JSON.parse(e.dataTransfer.getData(GAME_DRAG_TYPE)) as GameDrag;
    return typeof drag?.gameId === 'string' ? drag : null;
  } catch {
    return null;
  }
}
