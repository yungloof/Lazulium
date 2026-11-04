import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Timer, Camera, Check, Copy, ChevronLeft, ChevronRight, FolderOpen, ImagePlus, ListChecks, Loader2, Trash2, X, AlertTriangle } from 'lucide-react';
import { GamePickerModal } from './GamePickerModal';
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
const COUNTDOWN_SECONDS = 5;
const COPIED_MS = 2000;

const SOURCE_LABEL: Record<ScreenshotSource, string> = {
  steam: 'Steam',
  gamebar: 'Xbox Game Bar',
  custom: 'Anexada',
  lazulium: 'Lazulium'
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
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<string[] | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  // Para jogos abertos fora do Lazulium: dá tempo de voltar para o jogo antes de capturar
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      window.electronAPI
        ?.takeScreenshot(game.id)
        .then(() => load())
        .catch((err) => setError(ipcErrorMessage(err)));
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, game.id, load]);

  const handleCopy = async (shot: Screenshot) => {
    setError(null);
    try {
      await window.electronAPI?.copyScreenshot(game.id, shot.id);
      setCopiedId(shot.id);
      setTimeout(() => setCopiedId((id) => (id === shot.id ? null : id)), COPIED_MS);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const handleShowInFolder = (shot: Screenshot) => {
    setError(null);
    window.electronAPI?.showScreenshotInFolder(game.id, shot.id).catch((err) => setError(ipcErrorMessage(err)));
  };

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggleSelected = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleMove = async (target: Game) => {
    if (!moving) return;
    setError(null);
    try {
      await window.electronAPI?.moveScreenshots(game.id, moving, target.id);
      stopSelecting();
      setViewing((v) => (v === null || shots.length <= moving.length ? null : Math.min(v, shots.length - moving.length - 1)));
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
          <div className="flex items-center gap-2 flex-shrink-0">
            {selecting ? (
              <>
                <button onClick={() => setSelected(selected.size === shots.length ? new Set() : new Set(shots.map((s) => s.id)))} className={`px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                  {selected.size === shots.length ? 'Desmarcar todas' : 'Marcar todas'}
                </button>
                <button onClick={() => setMoving([...selected])} disabled={selected.size === 0} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Mover {selected.size || ''} para outro jogo
                </button>
                <button onClick={stopSelecting} className={`px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                  Cancelar
                </button>
              </>
            ) : (
              shots.length > 0 && (
                <button onClick={() => setSelecting(true)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                  <ListChecks className="w-3.5 h-3.5" /> Selecionar
                </button>
              )
            )}
            {!selecting && (
              <button onClick={() => setCountdown(COUNTDOWN_SECONDS)} disabled={countdown !== null} title="Com o jogo aberto pelo Lazulium, use a tecla de captura das Configurações" className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-60 ${focusRing}`}>
                <Timer className="w-3.5 h-3.5" /> {countdown !== null ? `Capturando em ${countdown} s` : `Capturar em ${COUNTDOWN_SECONDS} s`}
              </button>
            )}
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
                Nenhuma captura ainda. Com o jogo aberto pelo Lazulium, aperte a tecla de captura (padrão Ctrl+F12). As do F12 da Steam e do
                Win+Alt+PrtScn aparecem aqui sozinhas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {shots.map((shot, index) => (
                <button
                  key={shot.id}
                  onClick={() => (selecting ? toggleSelected(shot.id) : setViewing(index))}
                  aria-pressed={selecting ? selected.has(shot.id) : undefined}
                  className={`group relative aspect-video rounded-lg overflow-hidden bg-slate-900 border transition-colors ${selected.has(shot.id) ? 'border-indigo-400 ring-2 ring-indigo-400' : 'border-slate-800 hover:border-indigo-400'} ${focusRing}`}
                  title={`${SOURCE_LABEL[shot.source]} · ${formatDate(shot.takenAt)}`}
                >
                  <img src={shot.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 left-1 px-1.5 rounded bg-black/70 text-[9px] text-slate-300">{formatDate(shot.takenAt)}</span>
                  {selected.has(shot.id) && <Check className="absolute top-1.5 right-1.5 w-5 h-5 p-0.5 rounded-md bg-indigo-500 text-white" />}
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
              <button onClick={() => handleCopy(current)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 ${focusRing}`}>
                {copiedId === current.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copiedId === current.id ? 'Copiada' : 'Copiar imagem'}
              </button>
              <button onClick={() => handleShowInFolder(current)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 ${focusRing}`}>
                <FolderOpen className="w-3.5 h-3.5" /> Mostrar na pasta
              </button>
              <button onClick={() => setMoving([current.id])} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 ${focusRing}`}>
                <ArrowRightLeft className="w-3.5 h-3.5" /> Mover para outro jogo
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
          {error && (
            <p className="mx-5 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300" onClick={(e) => e.stopPropagation()}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </p>
          )}
          <div className="relative flex-1 min-h-0 flex items-center justify-center px-16 pb-6">
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

      {moving && (
        <GamePickerModal
          title={moving.length === 1 ? 'Mover captura para' : `Mover ${moving.length} capturas para`}
          hint="Só muda onde ela aparece no Lazulium: o arquivo continua na pasta da Steam."
          excludeIds={[game.id]}
          onPick={handleMove}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
};
