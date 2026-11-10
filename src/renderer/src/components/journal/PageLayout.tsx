import React from 'react';

// Peças de página do Diário, das Listas e dos Desejos: mesmo cabeçalho e mesmos números.
// Estados vazios e blocos de carregamento usam EmptyState e Skeleton de ../ui.

export const pageClass = 'max-w-6xl mx-auto px-8 pt-8 pb-14 space-y-6 animate-fade-in';

// Moldura dos estados vazios de página inteira
export const emptyBox = 'rounded-xl border border-dashed border-slate-700/70 bg-slate-900/30';

export const PageHeader: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
    <div className="min-w-0 max-w-2xl">
      <h1 className="text-3xl leading-tight text-white">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export interface Stat {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: boolean;
}

// Números grandes com rótulo, separados por linhas finas (estilo Backloggd)
export const StatStrip: React.FC<{ stats: Stat[]; className?: string }> = ({ stats, className = '' }) => (
  <dl className={`grid divide-x divide-slate-800/80 ${className}`} style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
    {stats.map((s) => (
      <div key={s.label} title={s.hint} className="px-3 py-1 text-center min-w-0">
        <dd className={`font-display text-[28px] leading-none tabular-nums ${s.accent ? 'text-indigo-300' : 'text-white'}`}>{s.value}</dd>
        <dt className="mt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400 truncate">{s.label}</dt>
      </div>
    ))}
  </dl>
);
