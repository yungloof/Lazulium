import React from 'react';
import { ChevronDown, Star } from 'lucide-react';
import { GameLogStatus } from '@shared/types/game';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export const LOG_STATUS: { id: GameLogStatus; label: string; dot: string; active: string }[] = [
  { id: 'playing', label: 'Jogando', dot: 'bg-emerald-400', active: 'bg-emerald-400/15 border-emerald-400/60 text-emerald-200' },
  { id: 'finished', label: 'Zerado', dot: 'bg-indigo-400', active: 'bg-indigo-400/15 border-indigo-400/60 text-indigo-200' },
  { id: 'completed', label: '100%', dot: 'bg-amber-400', active: 'bg-amber-400/15 border-amber-400/60 text-amber-200' },
  { id: 'paused', label: 'Pausado', dot: 'bg-slate-400', active: 'bg-slate-400/15 border-slate-400/60 text-slate-100' },
  { id: 'dropped', label: 'Abandonado', dot: 'bg-red-400', active: 'bg-red-400/15 border-red-400/60 text-red-200' },
  { id: 'backlog', label: 'Quero jogar', dot: 'bg-cyan-400', active: 'bg-cyan-400/15 border-cyan-400/60 text-cyan-200' }
];

const RATING_LABEL = ['', 'Ruim', 'Fraco', 'Bom', 'Ótimo', 'Obra-prima'];

// Todas as opções à vista. Clicar no status atual remove.
export const StatusPicker: React.FC<{ value?: GameLogStatus; onChange: (status: GameLogStatus | undefined) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2" role="group" aria-label="Status do jogo">
    {LOG_STATUS.map((s) => {
      const on = value === s.id;
      return (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(on ? undefined : s.id)}
          aria-pressed={on}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[13px] transition-colors ${on ? s.active : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'} ${focusRing}`}
        >
          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
          {s.label}
        </button>
      );
    })}
  </div>
);

// Versão compacta para listas: parece um selo, e por baixo é um select, que funciona com teclado e controle
export const StatusPill: React.FC<{ value?: GameLogStatus; onChange: (status: GameLogStatus | undefined) => void }> = ({ value, onChange }) => {
  const current = LOG_STATUS.find((s) => s.id === value);
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className={`relative inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full border text-xs focus-within:ring-2 focus-within:ring-indigo-400 ${current ? current.active : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'}`}
    >
      {current && <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />}
      {current?.label ?? 'Sem status'}
      <ChevronDown className="w-3 h-3 opacity-70" />
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as GameLogStatus | undefined)}
        aria-label="Status do jogo"
        className="absolute inset-0 w-full opacity-0 cursor-pointer focus:outline-none"
      >
        <option value="">Sem status</option>
        {LOG_STATUS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </span>
  );
};

// Clicar na nota atual remove a avaliação
export const StarRating: React.FC<{ value?: number; onChange: (rating: number | undefined) => void; size?: string; showLabel?: boolean }> = ({
  value,
  onChange,
  size = 'w-4 h-4',
  showLabel = false
}) => (
  <span className="inline-flex items-center gap-2">
    <span className="inline-flex items-center gap-0.5" role="group" aria-label="Sua nota">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(value === n ? undefined : n);
          }}
          aria-label={`${n} de 5 estrelas`}
          aria-pressed={value === n}
          className={`rounded-sm p-0.5 ${focusRing}`}
        >
          <Star className={`${size} transition-colors ${value && n <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-600 hover:text-slate-400'}`} />
        </button>
      ))}
    </span>
    {showLabel && <span className="text-[13px] text-slate-400">{value ? RATING_LABEL[value] : 'Sem nota'}</span>}
  </span>
);
