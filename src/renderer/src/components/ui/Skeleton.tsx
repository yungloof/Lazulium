import React from 'react';

// Bloco de carregamento: ocupa o lugar do conteúdo em vez de deixar a tela vazia
export const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div aria-hidden="true" style={style} className={`rounded-md bg-slate-800/70 animate-shimmer ${className}`} />
);

// Texto acessível para leitores de tela enquanto os blocos aparecem
export const LoadingLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span role="status" className="sr-only">
    {children}
  </span>
);
