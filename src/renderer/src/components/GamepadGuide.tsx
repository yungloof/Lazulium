import React from 'react';
import { useGamepadStore } from '../stores/useGamepadStore';

export const GamepadGuide: React.FC = () => {
  const { gamepad } = useGamepadStore();

  return (
    <footer className="h-9 bg-[#0b0c13] border-t border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-400 select-none">
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-[10px]">
            A
          </span>
          <span>Jogar / Selecionar</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 flex items-center justify-center font-bold text-[10px]">
            B
          </span>
          <span>Voltar</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center font-bold text-[10px]">
            X
          </span>
          <span>Favoritar</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[10px]">
            LB / RB
          </span>
          <span>Mudar Filtro</span>
        </div>
      </div>

      <div className="text-[11px] text-slate-500">
        {gamepad?.connected ? (
          <span className="text-emerald-400">● Controle Ativo</span>
        ) : (
          <span>Teclado / Mouse Conectado</span>
        )}
      </div>
    </footer>
  );
};
