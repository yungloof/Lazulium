import React, { useEffect, useRef, useState } from 'react';
import { Check, Keyboard, Loader2, NotebookPen, Share2 } from 'lucide-react';
import { Game, GameLog } from '@shared/types/game';
import { hasReviewContent } from '@shared/utils/review-blocks';
import { ReviewEditor } from './ReviewEditor';
import { useGamepadStore } from '../stores/useGamepadStore';
import { useKeyboardStore } from '../stores/useKeyboardStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useUiStore } from '../stores/useUiStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { DateField, StarRating, StatusPicker } from './GameLogFields';
import { Button, Notice, cardClass, inputClass, labelClass } from './ui';
import { MyReactionBar } from './friends/Reactions';
import { titleKey } from '@shared/utils/title-key';

const SAVE_DELAY_MS = 700;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// "Meu registro": fica guardado mesmo se o jogo for desinstalado. Os textos salvam sozinhos enquanto você escreve.
export const GameLogCard: React.FC<{ game: Game }> = ({ game }) => {
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const hasGamepad = useGamepadStore((s) => !!s.gamepad?.connected);
  const notesRef = useRef<HTMLTextAreaElement>(null);
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
        <div className="flex items-center gap-3">
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
          {(hasReviewContent(game.log) || game.log?.rating || game.log?.status) && (
            <Button
              variant="ghost"
              icon={<Share2 className="w-3.5 h-3.5" />}
              onClick={() => useUiStore.getState().openModal({ kind: 'shareCard', gameId: game.id })}
              title="Gerar cartão para compartilhar"
            >
              Cartão
            </Button>
          )}
        </div>
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
          <div>
            {/* Uma caixa por trecho e as imagens no meio; troca de jogo = editor novo (key) */}
            <ReviewEditor
              key={game.id}
              gameId={game.id}
              review={game.log?.review}
              images={game.log?.reviewImages}
              hasGamepad={hasGamepad}
              onChange={(changes) => typeText(changes)}
              onBlur={flush}
              onError={setError}
            />
            {/* Curtidas e comentários dos amigos na sua resenha (só aparece quando alguém reagiu) */}
            {(hasReviewContent(game.log) || game.log?.rating) && titleKey(game.title) && (
              <MyReactionBar kind="review" target={`t:${titleKey(game.title)}`} title={game.title} className="mt-2" />
            )}
          </div>
          <label className="block">
            <span className={`${labelClass} flex items-center justify-between gap-2`}>
              <span>Anotações de progresso</span>
              {hasGamepad && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => notesRef.current && useKeyboardStore.getState().openFor(notesRef.current, 'Anotações de progresso')}
                  className="inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0 text-[11px] font-normal normal-case tracking-normal text-indigo-300 hover:text-indigo-200"
                >
                  <Keyboard className="w-3 h-3" /> Teclado
                </button>
              )}
            </span>
            <textarea
              ref={notesRef}
              aria-label="Anotações de progresso"
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
