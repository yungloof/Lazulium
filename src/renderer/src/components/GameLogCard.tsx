import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, NotebookPen } from 'lucide-react';
import { Game, GameLog } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { StarRating, StatusSelect } from './GameLogFields';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const inputClass = `w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-sm text-slate-200 ${focusRing}`;
const SAVE_DELAY_MS = 700;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// "Meu registro": fica guardado mesmo se o jogo for desinstalado. Os textos salvam sozinhos enquanto você escreve.
export const GameLogCard: React.FC<{ game: Game }> = ({ game }) => {
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [review, setReview] = useState(game.log?.review ?? '');
  const [notes, setNotes] = useState(game.log?.notes ?? '');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<GameLog>(game.log ?? {});
  const gameIdRef = useRef(game.id);
  const pendingRef = useRef<Partial<GameLog> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const save = async (gameId: string, changes: Partial<GameLog>) => {
    setSaveState('saving');
    setError(null);
    const log = { ...logRef.current, ...changes };
    logRef.current = log;
    try {
      const updated = await window.electronAPI?.setGameLog(gameId, log);
      if (updated) upsertGameLocal(updated);
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setError(`Não foi possível salvar: ${ipcErrorMessage(err)}. Tente de novo.`);
    }
  };

  const flush = () => {
    clearTimeout(timerRef.current);
    if (pendingRef.current) {
      const changes = pendingRef.current;
      pendingRef.current = null;
      void save(gameIdRef.current, changes);
    }
  };

  // Trocar de jogo ou sair da página nunca perde o que foi digitado
  useEffect(() => {
    gameIdRef.current = game.id;
    logRef.current = game.log ?? {};
    setReview(game.log?.review ?? '');
    setNotes(game.log?.notes ?? '');
    setSaveState('idle');
    return flush;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  const typeText = (changes: Partial<GameLog>) => {
    pendingRef.current = { ...pendingRef.current, ...changes };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  return (
    <section className="rounded-md bg-slate-900/60 border border-slate-800/80">
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <NotebookPen className="w-3.5 h-3.5 text-indigo-400" /> Meu registro
        </h3>
        <span className="flex items-center gap-1 text-[11px] text-slate-500" aria-live="polite">
          {saveState === 'saving' && (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Check className="w-3 h-3 text-emerald-400" /> Salvo
            </>
          )}
        </span>
      </header>
      <div className="px-4 pb-4 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <StatusSelect value={game.log?.status} onChange={(status) => save(game.id, { status })} />
          <StarRating value={game.log?.rating} onChange={(rating) => save(game.id, { rating })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-slate-500">
            Comecei em
            <input type="date" value={game.log?.startedOn ?? ''} onChange={(e) => save(game.id, { startedOn: e.target.value || undefined })} className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-[11px] text-slate-500">
            Terminei em
            <input type="date" value={game.log?.finishedOn ?? ''} onChange={(e) => save(game.id, { finishedOn: e.target.value || undefined })} className={`${inputClass} mt-1`} />
          </label>
        </div>
        <label className="block text-[11px] text-slate-400">
          Minha resenha
          <textarea
            value={review}
            onChange={(e) => {
              setReview(e.target.value);
              typeText({ review: e.target.value });
            }}
            onBlur={flush}
            rows={8}
            placeholder="O que achou do jogo? História, gameplay, o que ficou na memória..."
            className={`${inputClass} mt-1 resize-y leading-relaxed placeholder-slate-600`}
          />
        </label>
        <label className="block text-[11px] text-slate-400">
          Anotações de progresso
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              typeText({ notes: e.target.value });
            }}
            onBlur={flush}
            rows={3}
            placeholder="Onde parou, o que falta fazer, com quem jogou..."
            className={`${inputClass} mt-1 resize-y leading-relaxed placeholder-slate-600`}
          />
        </label>
        {error && <p className="text-[11px] text-amber-300">{error}</p>}
      </div>
    </section>
  );
};
