import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, NotebookPen } from 'lucide-react';
import { Game, GameLog } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { DateField, StarRating, StatusPicker } from './GameLogFields';
import { Notice, cardClass, inputClass, labelClass } from './ui';

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

  const textArea = `${inputClass} resize-y leading-relaxed select-text`;

  return (
    <section className={cardClass}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h3 className="flex items-center gap-2 text-base text-white">
            <NotebookPen className="w-4 h-4 text-indigo-400" /> Meu registro
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">Fica guardado no Diário, mesmo se você desinstalar o jogo.</p>
        </div>
        <span className="flex items-center gap-1 h-5 text-xs text-slate-400" aria-live="polite">
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

      <div className="p-5 space-y-5">
        <div>
          <p className={labelClass}>Como está esse jogo para você?</p>
          <StatusPicker value={game.log?.status} onChange={(status) => save(game.id, { status })} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-5 items-end">
          <div>
            <p className={labelClass}>Sua nota</p>
            <StarRating value={game.log?.rating} onChange={(rating) => save(game.id, { rating })} size="w-6 h-6" showLabel />
          </div>
          <div className="grid grid-cols-2 gap-3 md:max-w-lg md:justify-self-end w-full">
            <DateField label="Comecei em" value={game.log?.startedOn} onChange={(startedOn) => save(game.id, { startedOn })} />
            <DateField label="Terminei em" value={game.log?.finishedOn} onChange={(finishedOn) => save(game.id, { finishedOn })} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
          <label className="block">
            <span className={labelClass}>Minha resenha</span>
            <textarea
              value={review}
              onChange={(e) => {
                setReview(e.target.value);
                typeText({ review: e.target.value });
              }}
              onBlur={flush}
              rows={8}
              placeholder="O que achou do jogo? História, gameplay, o que ficou na memória..."
              className={textArea}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Anotações de progresso</span>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                typeText({ notes: e.target.value });
              }}
              onBlur={flush}
              rows={8}
              placeholder="Onde parou, o que falta fazer, com quem jogou..."
              className={textArea}
            />
          </label>
        </div>
        <Notice>{error}</Notice>
      </div>
    </section>
  );
};
