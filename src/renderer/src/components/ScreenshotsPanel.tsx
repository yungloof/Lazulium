import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, Timer, Camera, Check, Copy, ChevronLeft, ChevronRight, FolderOpen, ImagePlus, ListChecks, Trash2, X, AlertTriangle } from 'lucide-react';
import { GamePickerModal } from './GamePickerModal';
import { Game } from '@shared/types/game';
import { Screenshot, ScreenshotSource } from '@shared/types/screenshots';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, EmptyState, Modal, Skeleton, buttonClass, focusRing, warnBoxClass } from './ui';

interface ScreenshotsPanelProps {
  game: Game;
  onClose: () => void;
  onChanged?: (count: number) => void;
  initialScreenshotId?: string;     // Abre direto nesta captura
}

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

const viewerButton = `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-100 transition-colors ${focusRing}`;

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

  // No visualizador: Esc fecha só ele (antes da janela), setas trocam de captura
  useEffect(() => {
    if (viewing === null || moving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setViewing(null);
      } else if (e.key === 'ArrowRight') {
        setViewing((v) => (v === null ? v : (v + 1) % shots.length));
      } else if (e.key === 'ArrowLeft') {
        setViewing((v) => (v === null ? v : (v - 1 + shots.length) % shots.length));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [viewing, moving, shots.length]);

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

  const headerActions = selecting ? (
    <>
      <Button onClick={() => setSelected(selected.size === shots.length ? new Set() : new Set(shots.map((s) => s.id)))}>
        {selected.size === shots.length ? 'Desmarcar todas' : 'Marcar todas'}
      </Button>
      <Button variant="primary" onClick={() => setMoving([...selected])} disabled={selected.size === 0}>
        <ArrowRightLeft className="w-3.5 h-3.5" /> Mover {selected.size || ''} para outro jogo
      </Button>
      <Button onClick={stopSelecting}>Cancelar</Button>
    </>
  ) : (
    <>
      {shots.length > 0 && (
        <Button onClick={() => setSelecting(true)}>
          <ListChecks className="w-3.5 h-3.5" /> Selecionar
        </Button>
      )}
      <Button onClick={() => setCountdown(COUNTDOWN_SECONDS)} disabled={countdown !== null} title="Com o jogo aberto pelo Lazulium, use a tecla de captura das Configurações">
        <Timer className="w-3.5 h-3.5" /> {countdown !== null ? `Capturando em ${countdown} s` : `Capturar em ${COUNTDOWN_SECONDS} s`}
      </Button>
      <Button variant="primary" onClick={handleImport} loading={busy} icon={<ImagePlus className="w-3.5 h-3.5" />}>
        Anexar imagens
      </Button>
    </>
  );

  return (
    <Modal
      title={
        <>
          Capturas · {game.title}
          {!loading && <span className="ml-1.5 text-slate-400 font-normal tabular-nums">({shots.length})</span>}
        </>
      }
      icon={<Camera className="w-4 h-4 text-indigo-400" />}
      size="3xl"
      tall
      onClose={onClose}
      bodyClassName="p-5"
      headerActions={headerActions}
      toolbar={
        error && !current ? (
          <div className={`mx-5 my-3 ${warnBoxClass}`}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" aria-busy="true">
          <span role="status" className="sr-only">
            Procurando capturas
          </span>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      ) : shots.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Nenhuma captura ainda"
          description="Com o jogo aberto pelo Lazulium, aperte a tecla de captura (padrão Ctrl+F12). As do F12 da Steam e do Win+Alt+PrtScn aparecem aqui sozinhas."
          actions={
            <Button variant="primary" size="md" onClick={handleImport} loading={busy} icon={<ImagePlus className="w-3.5 h-3.5" />}>
              Anexar imagens
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {shots.map((shot, index) => (
            <button
              key={shot.id}
              onClick={() => (selecting ? toggleSelected(shot.id) : setViewing(index))}
              aria-pressed={selecting ? selected.has(shot.id) : undefined}
              aria-label={`${SOURCE_LABEL[shot.source]}, ${formatDate(shot.takenAt)}`}
              className={`group relative aspect-video rounded-lg overflow-hidden bg-slate-900 transition-shadow ${
                selected.has(shot.id) ? 'ring-2 ring-indigo-400' : 'ring-1 ring-slate-800 hover:ring-indigo-400'
              } ${focusRing}`}
              title={`${SOURCE_LABEL[shot.source]} · ${formatDate(shot.takenAt)}`}
            >
              <img src={shot.thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
              <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-slate-200 tabular-nums">{formatDate(shot.takenAt)}</span>
              {selected.has(shot.id) && <Check className="absolute top-1.5 right-1.5 w-5 h-5 p-0.5 rounded-md bg-indigo-500 text-white" />}
            </button>
          ))}
        </div>
      )}

      {current &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex flex-col bg-black/95 animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label={`Captura ${viewing! + 1} de ${shots.length}`}
            onClick={(e) => {
              e.stopPropagation();
              setViewing(null);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs text-slate-300" onClick={(e) => e.stopPropagation()}>
              <span className="tabular-nums">
                {SOURCE_LABEL[current.source]} · {formatDate(current.takenAt)} · {viewing! + 1}/{shots.length}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => handleCopy(current)} className={viewerButton}>
                  {copiedId === current.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copiedId === current.id ? 'Copiada' : 'Copiar imagem'}
                </button>
                <button onClick={() => handleShowInFolder(current)} className={viewerButton}>
                  <FolderOpen className="w-3.5 h-3.5" /> Mostrar na pasta
                </button>
                <button onClick={() => setMoving([current.id])} className={viewerButton}>
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Mover para outro jogo
                </button>
                {confirmDeleteId === current.id ? (
                  <>
                    <span className="text-amber-300">Enviar para a Lixeira?</span>
                    <button onClick={() => handleDelete(current)} className={buttonClass('danger')}>
                      Apagar
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className={viewerButton}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDeleteId(current.id)} className={`${viewerButton} hover:!bg-red-500/20 hover:text-red-300`}>
                    <Trash2 className="w-3.5 h-3.5" /> Apagar
                  </button>
                )}
                <button onClick={() => setViewing(null)} aria-label="Fechar visualizador" title="Fechar (Esc)" className={`p-1.5 rounded-lg hover:bg-slate-800 ${focusRing}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {error && (
              <p className={`mx-5 mb-2 ${warnBoxClass}`} onClick={(e) => e.stopPropagation()}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
              </p>
            )}
            <div className="relative flex-1 min-h-0 flex items-center justify-center px-16 pb-6">
              <img key={current.id} src={current.url} alt="" className="max-w-full max-h-full object-contain rounded-md animate-fade-in" onClick={(e) => e.stopPropagation()} />
              {shots.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewing((viewing! - 1 + shots.length) % shots.length);
                    }}
                    className={`absolute left-4 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-100 ${focusRing}`}
                    title="Anterior (←)"
                    aria-label="Captura anterior"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewing((viewing! + 1) % shots.length);
                    }}
                    className={`absolute right-4 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-100 ${focusRing}`}
                    title="Próxima (→)"
                    aria-label="Próxima captura"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body
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
    </Modal>
  );
};
