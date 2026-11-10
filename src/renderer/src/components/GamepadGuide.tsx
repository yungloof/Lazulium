import React from 'react';
import { useGamepadStore } from '../stores/useGamepadStore';
import { Gamepad2 } from 'lucide-react';

// Botões de face com as cores de sempre, mas vindas do tema (o editor de aparência troca)
const FACE: { key: string; label: string; className: string }[] = [
  { key: 'A', label: 'Selecionar', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { key: 'B', label: 'Voltar', className: 'bg-red-500/20 text-red-300 border-red-500/40' },
  { key: 'X', label: 'Favoritar', className: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  { key: 'Y', label: 'Buscar', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
];

const SHOULDER: { key: string; label: string }[] = [
  { key: 'LB / RB', label: 'Filtros' },
  { key: 'LT / RT', label: 'Seções' },
  { key: 'Start', label: 'Configurações' }
];

// Faixa de ajuda: só aparece com controle conectado
export const GamepadGuide: React.FC = () => {
  const connected = useGamepadStore((s) => !!s.gamepad?.connected);
  if (!connected) return null;

  return (
    <footer className="h-9 bg-steam-header border-t border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-300 select-none flex-shrink-0 z-30 animate-fade-in" aria-label="Comandos do controle">
      <div className="flex items-center gap-4 overflow-x-auto py-1">
        {FACE.map((b) => (
          <span key={b.key} className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center font-bold text-[10px] ${b.className}`}>{b.key}</span>
            <span className="text-[11px]">{b.label}</span>
          </span>
        ))}
        {SHOULDER.map((b) => (
          <span key={b.key} className="flex items-center gap-1.5 flex-shrink-0">
            <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-semibold">{b.key}</span>
            <span className="text-[11px]">{b.label}</span>
          </span>
        ))}
      </div>

      <span className="flex items-center gap-1.5 flex-shrink-0 ml-3 text-[11px] font-medium text-emerald-400">
        <Gamepad2 className="w-3.5 h-3.5" /> Controle ativo
      </span>
    </footer>
  );
};
