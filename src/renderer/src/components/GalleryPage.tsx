import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronRight, Loader2, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { GameScreenshots, Screenshot } from '@shared/types/screenshots';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface GalleryPageProps {
  version: number;                  // Muda quando uma captura é apagada ou anexada
  onOpenGallery: (gameId: string, screenshot?: Screenshot) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

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
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
        <AlertTriangle className="w-8 h-8 text-amber-400/80" />
        <p className="text-sm text-slate-300">{error}</p>
        <button onClick={() => setAttempt((n) => n + 1)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-sm bg-slate-800 hover:bg-slate-700 ${focusRing}`}>
          <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
        </button>
      </div>
    );
  }

  if (!groups) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Procurando capturas...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-white">Capturas</h1>
          <p className="mt-1 text-sm text-slate-400">
            {total} capturas em {groups.length} jogos
          </p>
        </div>
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar jogo"
            className={`w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-sm text-slate-200 placeholder-slate-500 ${focusRing}`}
          />
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-2 text-center">
          <Camera className="w-8 h-8 text-slate-600" />
          <p className="text-xs text-slate-400 max-w-sm">
            {groups.length === 0 ? 'Nenhuma captura ainda. Fotos com F12 na Steam e Win+Alt+PrtScn aparecem aqui sozinhas.' : 'Nenhum jogo com esse nome.'}
          </p>
        </div>
      ) : (
        visible.map((group) => (
          <section key={group.gameId} className="bg-steam-panel/80 border border-black/30 rounded-sm">
            <button
              onClick={() => onOpenGallery(group.gameId)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left border-b border-black/30 hover:bg-black/20 ${focusRing}`}
            >
              <span className="text-sm text-slate-100 truncate">{group.title}</span>
              <span className="flex items-center gap-1 flex-shrink-0 text-xs text-indigo-300">
                Ver todas ({group.count}) <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </button>
            <div className="p-3 grid grid-cols-3 md:grid-cols-6 gap-2">
              {group.preview.map((shot) => (
                <button
                  key={shot.id}
                  onClick={() => onOpenGallery(group.gameId, shot)}
                  title={new Date(shot.takenAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  className={`aspect-video rounded-sm overflow-hidden bg-slate-800 hover:brightness-110 ${focusRing}`}
                >
                  <img src={shot.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};
