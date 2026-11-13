import React, { useState } from 'react';
import { Check, Plus, Settings2, Tags } from 'lucide-react';
import { Game } from '@shared/types/game';
import { MAX_CATEGORY_NAME } from '@shared/types/categories';
import { useCategoriesStore } from '../stores/useCategoriesStore';
import { useUiStore } from '../stores/useUiStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Modal, Notice, focusRing, iconButtonClass, inputClass } from './ui';

// Em quais categorias este jogo está: marca, desmarca ou cria uma nova já com ele dentro
export const GameCategoriesModal: React.FC<{ game: Game; onClose: () => void }> = ({ game, onClose }) => {
  const categories = useCategoriesStore((s) => s.categories);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const createCategory = () =>
    run(async () => {
      await useCategoriesStore.getState().create(newName, [game.id]);
      setNewName('');
    });

  return (
    <Modal
      title="Categorias"
      subtitle={game.title}
      icon={<Tags className="w-4 h-4 text-indigo-400" />}
      size="sm"
      onClose={onClose}
      bodyClassName="p-2"
      headerActions={
        <button
          type="button"
          onClick={() => useUiStore.getState().openModal({ kind: 'categories' })}
          title="Organizar categorias"
          aria-label="Organizar categorias"
          className={iconButtonClass}
        >
          <Settings2 className="w-4 h-4" />
        </button>
      }
      footer={
        <form
          className="w-full space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) void createCategory();
          }}
        >
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={MAX_CATEGORY_NAME}
              placeholder="Nome da nova categoria"
              aria-label="Nome da nova categoria"
              className={`${inputClass} !py-1.5 text-[13px]`}
            />
            <Button type="submit" variant="primary" disabled={!newName.trim()} className="flex-shrink-0">
              <Plus className="w-3.5 h-3.5" /> Criar
            </Button>
          </div>
          <Notice>{error}</Notice>
        </form>
      }
    >
      <ul className="space-y-0.5">
        {categories.map((category) => {
          const inCategory = category.gameIds.includes(game.id);
          return (
            <li key={category.id}>
              <button
                onClick={() => run(() => useCategoriesStore.getState().setGames(category.id, [game.id], !inCategory))}
                aria-pressed={inCategory}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${inCategory ? 'bg-indigo-500/15 hover:bg-indigo-500/20' : 'hover:bg-slate-800'} ${focusRing}`}
              >
                <span
                  className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded border transition-colors ${inCategory ? 'bg-indigo-500 border-indigo-400 text-white' : 'border-slate-600'}`}
                >
                  {inCategory && <Check className="w-3 h-3" />}
                </span>
                <span className="flex-1 min-w-0 text-sm text-slate-100 truncate">{category.name}</span>
              </button>
            </li>
          );
        })}
        {categories.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-400">Nenhuma categoria ainda. Crie a primeira aqui embaixo: ela aparece na lista lateral da biblioteca.</li>
        )}
      </ul>
    </Modal>
  );
};
