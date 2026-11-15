import React from 'react';
import { Gamepad2 } from 'lucide-react';
import { useGamepadStore } from '../stores/useGamepadStore';
import {
  ButtonShape,
  detectGamepadFamily,
  FaceButtonBinding,
  GAMEPAD_FAMILY_LABEL,
  getGamepadBindings
} from '../utils/gamepadGlyphs';

const PlayStationGlyph: React.FC<{ shape: ButtonShape }> = ({ shape }) => {
  switch (shape) {
    case 'ps-cross':
      return (
        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      );
    case 'ps-circle':
      return (
        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="6" cy="6" r="3.4" />
        </svg>
      );
    case 'ps-square':
      return (
        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <rect x="2.8" y="2.8" width="6.4" height="6.4" />
        </svg>
      );
    case 'ps-triangle':
      return (
        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 2.5L9.5 9H2.5L6 2.5Z" />
        </svg>
      );
  }
};

export const GamepadFaceBadge: React.FC<{ button: FaceButtonBinding }> = ({ button }) => (
  <span
    aria-label={button.keyLabel}
    className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center font-bold text-[10px] ${button.className}`}
  >
    {button.shape ? <PlayStationGlyph shape={button.shape} /> : button.keyLabel}
  </span>
);

// Faixa de ajuda: só aparece com controle conectado, adaptando os símbolos à marca do controle
export const GamepadGuide: React.FC = () => {
  const gamepad = useGamepadStore((s) => s.gamepad);
  if (!gamepad?.connected) return null;

  const family = detectGamepadFamily(gamepad.id);
  const { face, extra } = getGamepadBindings(family);

  return (
    <footer
      data-gamepad-family={family}
      className="h-9 bg-surface-header border-t border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-300 select-none flex-shrink-0 z-30 animate-fade-in"
      aria-label="Comandos do controle"
    >
      <div className="flex items-center gap-3.5 overflow-x-auto py-1">
        {face.map((b) => (
          <span key={b.id} className="flex items-center gap-1.5 flex-shrink-0">
            <GamepadFaceBadge button={b} />
            <span className="text-[11px]">{b.label}</span>
          </span>
        ))}
        {extra.map((b) => (
          <span key={b.id} className="flex items-center gap-1.5 flex-shrink-0">
            <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-semibold">
              {b.keyLabel}
            </span>
            <span className="text-[11px]">{b.label}</span>
          </span>
        ))}
      </div>

      <span className="flex items-center gap-1.5 flex-shrink-0 ml-3 text-[11px] font-medium text-emerald-400">
        <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" /> {GAMEPAD_FAMILY_LABEL[family]}
      </span>
    </footer>
  );
};
