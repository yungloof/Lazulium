import React from 'react';
import { Star } from 'lucide-react';
import { GameLogStatus } from '@shared/types/game';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export const LOG_STATUS: { id: GameLogStatus; label: string; className: string }[] = [
  { id: 'playing', label: 'Jogando', className: 'text-[#a3cf06]' },
  { id: 'finished', label: 'Zerado', className: 'text-indigo-300' },
  { id: 'completed', label: '100%', className: 'text-amber-300' },
  { id: 'paused', label: 'Pausado', className: 'text-slate-300' },
  { id: 'dropped', label: 'Abandonado', className: 'text-red-300' },
  { id: 'backlog', label: 'Quero jogar', className: 'text-slate-300' }
];

export const StatusSelect: React.FC<{
  value?: GameLogStatus;
  onChange: (status: GameLogStatus | undefined) => void;
  className?: string;
}> = ({ value, onChange, className = '' }) => (
  <select
    value={value ?? ''}
    onChange={(e) => onChange((e.target.value || undefined) as GameLogStatus | undefined)}
    onClick={(e) => e.stopPropagation()}
    aria-label="Status do jogo"
    className={`px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded-sm text-slate-200 ${focusRing} ${className}`}
  >
    <option value="">Sem status</option>
    {LOG_STATUS.map((s) => (
      <option key={s.id} value={s.id}>
        {s.label}
      </option>
    ))}
  </select>
);

// Clicar na nota atual remove a avaliação
export const StarRating: React.FC<{ value?: number; onChange: (rating: number | undefined) => void; size?: string }> = ({
  value,
  onChange,
  size = 'w-4 h-4'
}) => (
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
        <Star className={`${size} ${value && n <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-600 hover:text-slate-400'}`} />
      </button>
    ))}
  </span>
);
