import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Plus, X } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useListsStore } from '../stores/useListsStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export const AddToListModal: React.FC<{ game: Game; onClose: () => void }> = ({ game, onClose }) => {
  const lists = useListsStore((s) => s.lists);
  const load = useListsStore((s) => s.load);
  const save = useListsStore((s) => s.save);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onClose]);

  const run = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const createList = () =>
    run(async () => {
      await save({ title: newTitle, gameIds: [game.id] });
      setNewTitle('');
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-md max-h-[70vh] flex flex-col rounded-lg bg-steam-panel border border-slate-800 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <div className="min-w-0">
            <h2 className="text-base text-white">Adicionar à lista</h2>
            <p className="mt-0.5 text-xs text-slate-400 truncate">{game.title}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
          {lists.map((list) => {
            const inList = list.gameIds.includes(game.id);
            return (
              <li key={list.id}>
                <button
                  onClick={() => run(() => save({ id: list.id, title: list.title, gameIds: inList ? list.gameIds.filter((id) => id !== game.id) : [...list.gameIds, game.id] }))}
                  aria-pressed={inList}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-800 ${inList ? 'bg-indigo-500/15' : ''} ${focusRing}`}
                >
                  <span className="flex-1 min-w-0 text-sm text-slate-100 truncate">{list.title}</span>
                  <span className="text-xs text-slate-500">{list.gameIds.length}</span>
                  {inList && <Check className="w-4 h-4 text-indigo-300" />}
                </button>
              </li>
            );
          })}
          {lists.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">Você ainda não tem listas. Crie a primeira aqui embaixo.</li>}
        </ul>

        <form
          className="flex items-center gap-2 p-3 border-t border-slate-800"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) void createList();
          }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={80}
            placeholder="Nome da nova lista"
            aria-label="Nome da nova lista"
            className={`flex-1 min-w-0 px-3 py-2 text-[13px] bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-200 placeholder-slate-500 ${focusRing}`}
          />
          <button type="submit" disabled={!newTitle.trim()} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
            <Plus className="w-3.5 h-3.5" /> Criar
          </button>
        </form>
        {error && (
          <p className="flex items-center gap-1.5 px-4 pb-3 text-xs text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </p>
        )}
      </div>
    </div>
  );
};
