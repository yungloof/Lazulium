import React from 'react';

interface EmptyStateProps {
  icon: React.ElementType;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;          // Botões: o próximo passo útil
  tone?: 'neutral' | 'warn';
  compact?: boolean;                  // Dentro de cartões e janelas
  className?: string;
}

// Tela sem conteúdo: diz o que aconteceu e o que fazer, em vez de um vazio
export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, actions, tone = 'neutral', compact = false, className = '' }) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-2 py-8 px-4' : 'gap-3 py-16 px-6'} animate-fade-in ${className}`}>
    <span
      className={`flex items-center justify-center rounded-lg border ${compact ? 'w-11 h-11' : 'w-14 h-14'} ${
        tone === 'warn' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : 'bg-indigo-500/10 border-indigo-400/20 text-indigo-300'
      }`}
    >
      <Icon className={compact ? 'w-5 h-5' : 'w-6 h-6'} />
    </span>
    <div className="max-w-md space-y-1">
      <h3 className={`font-semibold text-slate-100 ${compact ? 'text-sm' : 'text-base'}`}>{title}</h3>
      {description && <p className="text-xs leading-relaxed text-slate-400">{description}</p>}
    </div>
    {actions && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
  </div>
);
