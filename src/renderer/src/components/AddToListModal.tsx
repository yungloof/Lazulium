import React, { useEffect, useState } from 'react';
import { Check, ListPlus, Plus } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useListsStore } from '../stores/useListsStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Modal, Notice, focusRing, inputClass } from './ui';

export const AddToListModal: React.FC<{ game: Game; onClose: () => void }> = ({ game, onClose }) => {
  const lists = useListsStore((s) => s.lists);
  const load = useListsStore((s) => s.load);
  const save = useListsStore((s) => s.save);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

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
    <Modal
      title="Adicionar à lista"
      subtitle={game.title}
      icon={<ListPlus className="w-4 h-4 text-indigo-400" />}
      size="sm"
      onClose={onClose}
      bodyClassName="p-2"
      footer={
        <form
          className="w-full space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) void createList();
          }}
        >
          <div className="flex items-center gap-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={80} placeholder="Nome da nova lista" aria-label="Nome da nova lista" className={`${inputClass} !py-1.5 text-[13px]`} />
            <Button type="submit" variant="primary" disabled={!newTitle.trim()} className="flex-shrink-0">
              <Plus className="w-3.5 h-3.5" /> Criar
            </Button>
          </div>
          <Notice>{error}</Notice>
        </form>
      }
    >
      <ul className="space-y-0.5">
        {lists.map((list) => {
          const inList = list.gameIds.includes(game.id);
          return (
            <li key={list.id}>
              <button
                onClick={() => run(() => save({ id: list.id, title: list.title, gameIds: inList ? list.gameIds.filter((id) => id !== game.id) : [...list.gameIds, game.id] }))}
                aria-pressed={inList}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${inList ? 'bg-indigo-500/15 hover:bg-indigo-500/20' : 'hover:bg-slate-800'} ${focusRing}`}
              >
                <span
                  className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded border transition-colors ${inList ? 'bg-indigo-500 border-indigo-400 text-white' : 'border-slate-600'}`}
                >
                  {inList && <Check className="w-3 h-3" />}
                </span>
                <span className="flex-1 min-w-0 text-sm text-slate-100 truncate">{list.title}</span>
                <span className="text-xs text-slate-400 tabular-nums">{list.gameIds.length}</span>
              </button>
            </li>
          );
        })}
        {lists.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-400">Nenhuma lista ainda. Crie uma aqui embaixo.</li>}
      </ul>
    </Modal>
  );
};
