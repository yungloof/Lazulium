import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronRight, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { GameScreenshots, Screenshot } from '@shared/types/screenshots';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, EmptyState, Skeleton, compactInputClass, focusRing, focusRingInset } from './ui';

interface GalleryPageProps {
  version: number;                  // Muda quando uma captura é apagada ou anexada
  onOpenGallery: (gameId: string, screenshot?: Screenshot) => void;
}

// Todas as capturas do PC, separadas por jogo
export const GalleryPage: React.FC<GalleryPageProps> = ({ version, onOpenGallery }) => {
  const [groups, setGroups] = useState<GameScreenshots[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    window.electronAPI
      ?.listScreenshotsByGame()
      .then((list) => !cancelled && setGroups(list))
      .catch((err) => !cancelled && setError(ipcErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [version, attempt]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (groups ?? []).filter((g) => !q || g.title.toLowerCase().includes(q));
  }, [groups, query]);
  const total = (groups ?? []).reduce((sum, g) => sum + g.count, 0);

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <EmptyState
          icon={AlertTriangle}
          tone="warn"
          title="Não deu para listar as capturas"
          description={error}
          actions={
            <Button size="md" data-nav-start onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-8 space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight text-white">Capturas</h1>
          <p className="mt-1 text-sm text-slate-400 tabular-nums">{groups ? `${total} capturas em ${groups.length} jogos` : 'Procurando capturas...'}</p>
        </div>
        {groups && groups.length > 0 && (
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jogo" aria-label="Buscar jogo nas capturas" className={`${compactInputClass} pl-8`} />
          </div>
        )}
      </header>

      {!groups ? (
        <div className="space-y-5" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-steam-panel/60 p-3 space-y-3">
              <Skeleton className="h-4 w-48" />
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {Array.from({ length: 6 }, (_, j) => (
                  <Skeleton key={j} className="aspect-video" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        groups.length === 0 ? (
          <EmptyState
            icon={Camera}
            title="Nenhuma captura ainda"
            description="Com o jogo aberto pelo Lazulium, aperte a tecla de captura (padrão Ctrl+F12). As do F12 da Steam e do Win+Alt+PrtScn aparecem aqui sozinhas."
          />
        ) : (
          <EmptyState icon={Search} title="Nenhum jogo com esse nome" compact actions={<Button onClick={() => setQuery('')}>Limpar busca</Button>} />
        )
      ) : (
        visible.map((group) => (
          <section key={group.gameId} className="bg-steam-panel/70 border border-slate-800/80 rounded-lg overflow-hidden">
            <button
              onClick={() => onOpenGallery(group.gameId)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left border-b border-slate-800/80 hover:bg-slate-800/40 transition-colors ${focusRingInset}`}
            >
              <span className="text-sm font-medium text-slate-100 truncate">{group.title}</span>
              <span className="flex items-center gap-1 flex-shrink-0 text-xs font-semibold text-indigo-300">
                Ver todas ({group.count}) <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </button>
            <div className="p-3 grid grid-cols-3 md:grid-cols-6 gap-2">
              {group.preview.map((shot) => (
                <button
                  key={shot.id}
                  onClick={() => onOpenGallery(group.gameId, shot)}
                  title={new Date(shot.takenAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  aria-label={`Captura de ${group.title}, ${new Date(shot.takenAt).toLocaleDateString('pt-BR')}`}
                  className={`group aspect-video rounded-md overflow-hidden bg-slate-800 ring-1 ring-slate-800 hover:ring-indigo-400 transition-shadow ${focusRing}`}
                >
                  <img src={shot.thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};
