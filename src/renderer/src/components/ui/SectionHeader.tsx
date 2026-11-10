import React from 'react';

interface SectionHeaderProps {
  icon?: React.ElementType;
  title: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
  className?: string;
}

// Título de seção das páginas: mesma hierarquia em toda parte
export const SectionHeader: React.FC<SectionHeaderProps> = ({ icon: Icon, title, count, actions, className = '' }) => (
  <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3.5 ${className}`}>
    <h2 className="flex items-center gap-2 text-[17px] font-semibold text-slate-50">
      {Icon && <Icon className="w-4 h-4 text-indigo-400" />}
      {title}
      {count !== undefined && <span className="ml-0.5 text-sm font-medium text-slate-400 tabular-nums">{count}</span>}
    </h2>
    {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
  </div>
);
