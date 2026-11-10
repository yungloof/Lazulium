import React from 'react';
import { LoadingLabel, Skeleton } from '../ui';

// Esqueletos enquanto uma página carrega: a tela já tem a forma do que vem
export const PageSkeleton: React.FC<{ variant?: 'page' | 'game' }> = ({ variant = 'page' }) => {
  if (variant === 'game') {
    return (
      <div className="min-h-full">
        <LoadingLabel>Carregando o jogo</LoadingLabel>
        <Skeleton className="h-[clamp(220px,40vh,420px)] rounded-none" />
        <div className="flex items-center gap-6 px-8 py-4 border-b border-slate-800/80">
          <Skeleton className="w-36 h-11 rounded-lg" />
          <Skeleton className="w-28 h-8" />
          <Skeleton className="w-28 h-8" />
          <Skeleton className="w-28 h-8" />
        </div>
        <div className="px-8 py-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
          <div className="space-y-5">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-36 rounded-lg" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
      <LoadingLabel>Carregando</LoadingLabel>
      <div className="space-y-2">
        <Skeleton className="w-48 h-7" />
        <Skeleton className="w-72 h-4" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
};

// Janela carregando: só o fundo escurecido (o conteúdo chega em milissegundos)
export const ModalFallback: React.FC = () => <div className="fixed inset-0 z-50 bg-black/40 animate-fade-in" aria-hidden="true" />;
