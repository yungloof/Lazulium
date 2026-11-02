import React from 'react';
import { useGamepadStore } from '../stores/useGamepadStore';
import { Gamepad2 } from 'lucide-react';

export const GamepadGuide: React.FC = () => {
  const { gamepad } = useGamepadStore();

  return (
    <footer className="h-9 bg-[#0b0c13] border-t border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-400 select-none flex-shrink-0 z-30">
      <div className="flex items-center gap-4 overflow-x-auto py-1">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-[10px]">
            A
          </span>
          <span className="text-[11px]">Jogar / Selecionar</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 flex items-center justify-center font-bold text-[10px]">
            B
          </span>
          <span className="text-[11px]">Voltar</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center font-bold text-[10px]">
            X
          </span>
          <span className="text-[11px]">Favoritar</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold text-[10px]">
            Y
          </span>
          <span className="text-[11px]">Buscar</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[9px]">
            LB / RB
          </span>
          <span className="text-[11px]">Filtros</span>
        </div>
      </div>

      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-shrink-0 ml-3">
        {gamepad?.connected ? (
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <Gamepad2 className="w-3.5 h-3.5" /> Controle Ativo
          </span>
        ) : (
          <span>Teclado (Setas, Enter, F, /)</span>
        )}
      </div>
    </footer>
  );
};
