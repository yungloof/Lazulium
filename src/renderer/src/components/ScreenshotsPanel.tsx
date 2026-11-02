import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, FolderOpen, ImagePlus, Loader2, Trash2, X, AlertTriangle } from 'lucide-react';
import { Game } from '@shared/types/game';
import { Screenshot, ScreenshotSource } from '@shared/types/screenshots';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface ScreenshotsPanelProps {
  game: Game;
  onClose: () => void;
  onChanged?: (count: number) => void;
  initialScreenshotId?: string;     // Abre direto nesta captura
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const SOURCE_LABEL: Record<ScreenshotSource, string> = {
  steam: 'Steam',
  gamebar: 'Xbox Game Bar',
  custom: 'Anexada'
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export const ScreenshotsPanel: React.FC<ScreenshotsPanelProps> = ({ game, onClose, onChanged, initialScreenshotId }) => {
  const [shots, setShots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const initialIdRef = useRef(initialScreenshotId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref: o pai pode passar uma função nova a cada render sem recarregar a lista
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = (await window.electronAPI?.listScreenshots(game.id)) ?? [];
      setShots(list);
      if (initialIdRef.current) {
        const index = list.findIndex((s) => s.id === initialIdRef.current);
        if (index >= 0) setViewing(index);
        initialIdRef.current = undefined;
      }
      onChangedRef.current?.(list.length);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [game.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setConfirmDeleteId(null);
  }, [viewing]);

  // Esc fecha o visualizador primeiro; setas navegam entre as capturas
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewing !== null) setViewing(null);
        else onClose();
      } else if (viewing !== null && e.key === 'ArrowRight') {
        setConfirmDeleteId(null);
        setViewing((v) => (v === null ? v : (v + 1) % shots.length));
      } else if (viewing !== null && e.key === 'ArrowLeft') {
        setConfirmDeleteId(null);
        setViewing((v) => (v === null ? v : (v - 1 + shots.length) % shots.length));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, viewing, shots.length]);

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const added = (await window.electronAPI?.importScreenshots(game.id)) ?? 0;
      if (added > 0) await load();
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (shot: Screenshot) => {
    setError(null);
    try {
      await window.electronAPI?.deleteScreenshot(game.id, shot.id);
      setConfirmDeleteId(null);
      // No visualizador segue para a próxima captura; sem mais nenhuma, volta para a grade
      setViewing((v) => (v === null || shots.length <= 1 ? null : Math.min(v, shots.length - 2)));
      await load();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const current = viewing !== null ? shots[viewing] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="w-full max-w-5xl h-[85vh] flex flex-col rounded-lg bg-steam-bg border border-slate-800 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100 truncate">
            <Camera className="w-4 h-4 text-indigo-400 flex-shrink-0" /> Capturas · {game.title}
            {!loading && <span className="text-slate-500 font-normal">({shots.length})</span>}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={handleImport} disabled={busy} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
              Anexar imagens
            </button>
            <button onClick={onClose} className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Procurando capturas...
            </div>
          ) : shots.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
              <Camera className="w-8 h-8 text-slate-600" />
              <p className="text-xs text-slate-400 max-w-sm">
                Nenhuma captura ainda. As fotos tiradas com F12 na Steam e com Win+Alt+PrtScn (Game Bar) aparecem aqui sozinhas, ou
                use “Anexar imagens”.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {shots.map((shot, index) => (
                <button
                  key={shot.id}
                  onClick={() => setViewing(index)}
                  className={`group relative aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-800 hover:border-indigo-400 transition-colors ${focusRing}`}
                  title={`${SOURCE_LABEL[shot.source]} · ${formatDate(shot.takenAt)}`}
                >
                  <img src={shot.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 left-1 px-1.5 rounded bg-black/70 text-[9px] text-slate-300">{formatDate(shot.takenAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {current && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={(e) => { e.stopPropagation(); setViewing(null); }}>
          <div className="flex items-center justify-between px-5 py-3 text-xs text-slate-300" onClick={(e) => e.stopPropagation()}>
            <span>
              {SOURCE_LABEL[current.source]} · {formatDate(current.takenAt)} · {viewing! + 1}/{shots.length}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => window.electronAPI?.showScreenshotInFolder(game.id, current.id)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 ${focusRing}`}>
                <FolderOpen className="w-3.5 h-3.5" /> Mostrar na pasta
              </button>
              {confirmDeleteId === current.id ? (
                <>
                  <span className="text-amber-300">Enviar para a Lixeira?</span>
                  <button onClick={() => handleDelete(current)} className={`px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold ${focusRing}`}>
                    Apagar
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className={`px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 ${focusRing}`}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmDeleteId(current.id)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-300 ${focusRing}`}>
                  <Trash2 className="w-3.5 h-3.5" /> Apagar
                </button>
              )}
              <button onClick={() => setViewing(null)} className={`p-1.5 rounded-lg hover:bg-slate-800 ${focusRing}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative flex-1 flex items-center justify-center px-16 pb-6">
            <img src={current.url} alt="" className="max-w-full max-h-full object-contain rounded" onClick={(e) => e.stopPropagation()} />
            {shots.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setViewing((viewing! - 1 + shots.length) % shots.length); }}
                  className={`absolute left-4 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 ${focusRing}`}
                  title="Anterior (←)"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setViewing((viewing! + 1) % shots.length); }}
                  className={`absolute right-4 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 ${focusRing}`}
                  title="Próxima (→)"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
