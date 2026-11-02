import React, { useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { Game, GameLog } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { StarRating, StatusSelect } from './GameLogFields';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const inputClass = `w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded-sm text-slate-200 ${focusRing}`;

// "Meu registro": status, nota, datas e anotações. Fica guardado mesmo se o jogo for desinstalado.
export const GameLogCard: React.FC<{ game: Game }> = ({ game }) => {
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [notes, setNotes] = useState(game.log?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setNotes(game.log?.notes ?? ''), [game.id, game.log?.notes]);

  const save = async (changes: Partial<GameLog>) => {
    setError(null);
    try {
      const updated = await window.electronAPI?.setGameLog(game.id, { ...game.log, ...changes });
      if (updated) upsertGameLocal(updated);
    } catch (err) {
      setError(`Não foi possível salvar: ${ipcErrorMessage(err)}`);
    }
  };

  return (
    <section className="rounded-md bg-slate-900/60 border border-slate-800/80">
      <h3 className="flex items-center gap-2 px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <NotebookPen className="w-3.5 h-3.5 text-indigo-400" /> Meu registro
      </h3>
      <div className="px-4 pb-4 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <StatusSelect value={game.log?.status} onChange={(status) => save({ status })} />
          <StarRating value={game.log?.rating} onChange={(rating) => save({ rating })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-slate-500">
            Comecei em
            <input
              type="date"
              value={game.log?.startedOn ?? ''}
              onChange={(e) => save({ startedOn: e.target.value || undefined })}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-[11px] text-slate-500">
            Terminei em
            <input
              type="date"
              value={game.log?.finishedOn ?? ''}
              onChange={(e) => save({ finishedOn: e.target.value || undefined })}
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
        <label className="block text-[11px] text-slate-500">
          Anotações
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (game.log?.notes ?? '')) void save({ notes });
            }}
            rows={3}
            placeholder="O que achou, onde parou, com quem jogou..."
            className={`${inputClass} mt-1 resize-y placeholder-slate-600`}
          />
        </label>
        {error && <p className="text-[11px] text-amber-300">{error}</p>}
      </div>
    </section>
  );
};
