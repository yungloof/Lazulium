import React from 'react';
import { GameLogStatus } from '@shared/types/game';
import { focusRing } from '../ui';
import { LOG_STATUS } from '../GameLogFields';

export type StatusFilter = 'all' | 'none' | GameLogStatus;

// Filtro por status em pílulas, com a contagem de cada um. Status sem jogos ficam apagados, mas clicáveis.
export const StatusChips: React.FC<{
  value: StatusFilter;
  counts: Partial<Record<StatusFilter, number>>;
  onChange: (value: StatusFilter) => void;
  allLabel?: string;
}> = ({ value, counts, onChange, allLabel = 'Todos' }) => {
  const chips: { id: StatusFilter; label: string; dot?: string }[] = [
    { id: 'all', label: allLabel },
    ...LOG_STATUS.map((s) => ({ id: s.id as StatusFilter, label: s.label, dot: s.dot })),
    ...(counts.none ? [{ id: 'none' as StatusFilter, label: 'Sem status' }] : [])
  ];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
      {chips.map((chip) => {
        const on = value === chip.id;
        const count = counts[chip.id] ?? 0;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onChange(chip.id)}
            aria-pressed={on}
            className={`inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[13px] transition-colors ${
              on ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-950/50' : `border-slate-700/80 hover:border-slate-500 hover:text-white ${count ? 'text-slate-300' : 'text-slate-500'}`
            } ${focusRing}`}
          >
            {chip.dot && <span className={`w-2 h-2 rounded-full ${chip.dot}`} />}
            {chip.label}
            <span className={`tabular-nums text-xs ${on ? 'text-indigo-100' : 'text-slate-500'}`}>{count}</span>
          </button>
        );
      })}
    </div>
  );
};

export function countByStatus<T extends { log?: { status?: GameLogStatus } }>(items: T[]): Partial<Record<StatusFilter, number>> {
  const counts: Partial<Record<StatusFilter, number>> = { all: items.length, none: 0 };
  for (const item of items) {
    const key: StatusFilter = item.log?.status ?? 'none';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export const matchesStatus = (status: GameLogStatus | undefined, filter: StatusFilter) => (filter === 'all' ? true : filter === 'none' ? !status : status === filter);
