import React from 'react';
import { CalendarCheck, ChevronDown, Star, X } from 'lucide-react';
import { GameLogStatus } from '@shared/types/game';
import { Select, SelectOption } from './Select';
import { focusRing, inputClass } from './ui';
import { todayDay } from './journal/format';

// Cores só dos tokens do tema: o editor de aparência troca todas juntas
export const LOG_STATUS: { id: GameLogStatus; label: string; dot: string; active: string }[] = [
  { id: 'playing', label: 'Jogando', dot: 'bg-emerald-400', active: 'bg-emerald-400/15 border-emerald-400/60 text-emerald-200' },
  { id: 'finished', label: 'Zerado', dot: 'bg-indigo-400', active: 'bg-indigo-400/15 border-indigo-400/60 text-indigo-200' },
  { id: 'completed', label: '100%', dot: 'bg-amber-400', active: 'bg-amber-400/15 border-amber-400/60 text-amber-200' },
  { id: 'paused', label: 'Pausado', dot: 'bg-slate-400', active: 'bg-slate-400/15 border-slate-400/60 text-slate-100' },
  { id: 'dropped', label: 'Abandonado', dot: 'bg-red-400', active: 'bg-red-400/15 border-red-400/60 text-red-200' },
  { id: 'backlog', label: 'Quero jogar', dot: 'bg-transparent ring-2 ring-inset ring-indigo-200', active: 'bg-indigo-200/10 border-indigo-200/60 text-indigo-100' }
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
          className={`inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[13px] transition-colors ${on ? s.active : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'} ${focusRing}`}
        >
          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
          {s.label}
        </button>
      );
    })}
  </div>
);

const STATUS_OPTIONS: SelectOption<GameLogStatus | ''>[] = [{ value: '', label: 'Sem status' }, ...LOG_STATUS.map((s) => ({ value: s.id, label: s.label, dot: s.dot }))];

// Versão compacta para listas: parece um selo e abre o menu do app
export const StatusPill: React.FC<{ value?: GameLogStatus; onChange: (status: GameLogStatus | undefined) => void }> = ({ value, onChange }) => {
  const current = LOG_STATUS.find((s) => s.id === value);
  return (
    <Select
      value={value ?? ''}
      options={STATUS_OPTIONS}
      onChange={(next) => onChange(next || undefined)}
      ariaLabel="Status do jogo"
      className={`inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full border text-xs transition-colors ${focusRing} ${current ? current.active : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'}`}
    >
      {current && <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />}
      {current?.label ?? 'Sem status'}
      <ChevronDown className="w-3 h-3 opacity-70" />
    </Select>
  );
};

// Ponto do status, para cartões e linhas
export const StatusDot: React.FC<{ status?: GameLogStatus; withLabel?: boolean }> = ({ status, withLabel = true }) => {
  const s = LOG_STATUS.find((item) => item.id === status);
  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400" title={s.label}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {withLabel && s.label}
    </span>
  );
};

const StarIcon: React.FC<{ fill: number; size: string; emptyClass?: string }> = ({ fill, size, emptyClass = 'text-slate-600' }) => (
  <span className={`relative inline-block ${size}`}>
    <Star className={`absolute inset-0 ${size} ${emptyClass}`} />
    {fill > 0 && (
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
        <Star className={`${size} text-amber-400 fill-amber-400`} />
      </span>
    )}
  </span>
);

const starFill = (value: number | undefined, star: number) => (!value ? 0 : value >= star ? 1 : value >= star - 0.5 ? 0.5 : 0);

// Nota só para mostrar, com meia estrela
export const Stars: React.FC<{ value: number; size?: string }> = ({ value, size = 'w-3.5 h-3.5' }) => (
  <span className="inline-flex items-center gap-px" aria-label={`${String(value).replace('.', ',')} de 5 estrelas`} title={`${String(value).replace('.', ',')} de 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <StarIcon key={n} fill={starFill(value, n)} size={size} />
    ))}
  </span>
);

// Clicar na mesma estrela tira meia estrela e, depois, a nota: funciona igual no mouse e no controle
const nextRating = (value: number | undefined, star: number) => (value === star ? star - 0.5 : value === star - 0.5 ? undefined : star);

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
            onChange(nextRating(value, n));
          }}
          aria-label={`${n} de 5 estrelas`}
          aria-pressed={!!value && Math.ceil(value) === n}
          className={`rounded-sm p-0.5 transition-transform hover:scale-110 ${focusRing}`}
        >
          <StarIcon fill={starFill(value, n)} size={size} emptyClass="text-slate-600 hover:text-slate-400 transition-colors" />
        </button>
      ))}
    </span>
    {showLabel && <span className="text-[13px] text-slate-400">{value ? `${String(value).replace('.', ',')} · ${RATING_LABEL[Math.ceil(value)]}` : 'Sem nota'}</span>}
  </span>
);

// Data com atalho "Hoje": o campo de data nativo não abre pelo controle
export const DateField: React.FC<{ label: string; value?: string; onChange: (day: string | undefined) => void }> = ({ label, value, onChange }) => (
  <div className="min-w-0">
    <span className="block mb-1.5 text-[13px] font-medium text-slate-300">{label}</span>
    <div className="flex items-center gap-1.5">
      <input type="date" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className={`${inputClass} min-w-0`} />
      {value ? (
        <button type="button" onClick={() => onChange(undefined)} aria-label={`Limpar ${label.toLowerCase()}`} title="Limpar" className={`flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button type="button" onClick={() => onChange(todayDay())} title="Usar a data de hoje" className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white ${focusRing}`}>
          <CalendarCheck className="w-3.5 h-3.5" /> Hoje
        </button>
      )}
    </div>
  </div>
);
