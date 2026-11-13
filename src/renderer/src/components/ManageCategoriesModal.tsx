import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FolderPlus, Plus, Tags, Trash2 } from 'lucide-react';
import { GameCategory, MAX_CATEGORY_NAME } from '@shared/types/categories';
import { useCategoriesStore } from '../stores/useCategoriesStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { GamePickerModal } from './GamePickerModal';
import { Button, Modal, Notice, iconButtonClass, inputClass } from './ui';

interface RowProps {
  category: GameCategory;
  count: number;
  isFirst: boolean;
  isLast: boolean;
  run: (task: () => Promise<unknown>) => Promise<void>;
  onMove: (step: -1 | 1) => void;
  onAddGames: () => void;
}

const CategoryRow: React.FC<RowProps> = ({ category, count, isFirst, isLast, run, onMove, onAddGames }) => {
  const [name, setName] = useState(category.name);
  const [confirming, setConfirming] = useState(false);

  // Renomeada por outro caminho (ou o nome foi recusado): o campo volta ao que está salvo
  useEffect(() => setName(category.name), [category.name]);

  const saveName = () => {
    const clean = name.trim();
    if (!clean) setName(category.name);
    else if (clean !== category.name) void run(() => useCategoriesStore.getState().rename(category.id, clean)).then(() => setName(useCategoriesStore.getState().categories.find((c) => c.id === category.id)?.name ?? clean));
  };

  return (
    <li className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-800/50">
      <button type="button" onClick={() => onMove(-1)} disabled={isFirst} title="Subir" aria-label={`Subir ${category.name}`} className={`${iconButtonClass} disabled:opacity-30 disabled:pointer-events-none`}>
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => onMove(1)} disabled={isLast} title="Descer" aria-label={`Descer ${category.name}`} className={`${iconButtonClass} disabled:opacity-30 disabled:pointer-events-none`}>
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        maxLength={MAX_CATEGORY_NAME}
        aria-label={`Nome da categoria ${category.name}`}
        className={`${inputClass} !py-1.5 text-[13px] flex-1 min-w-0`}
      />
      <span className="w-16 flex-shrink-0 text-right text-xs text-slate-400 tabular-nums">{count === 1 ? '1 jogo' : `${count} jogos`}</span>
      <Button onClick={onAddGames} className="flex-shrink-0" title={`Escolher jogos para ${category.name}`}>
        <FolderPlus className="w-3.5 h-3.5" /> Jogos
      </Button>
      {confirming ? (
        <Button
          variant="danger"
          autoFocus
          onBlur={() => setConfirming(false)}
          onClick={() => void run(() => useCategoriesStore.getState().remove(category.id))}
          className="flex-shrink-0"
        >
          Apagar?
        </Button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} title="Apagar categoria (os jogos continuam na biblioteca)" aria-label={`Apagar ${category.name}`} className={`${iconButtonClass} hover:!text-red-300`}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
};

// Criar, renomear, ordenar e apagar categorias, e escolher os jogos de cada uma
export const ManageCategoriesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const categories = useCategoriesStore((s) => s.categories);
  const games = useLibraryStore((s) => s.games);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const visibleIds = useMemo(() => new Set(games.filter((g) => !g.isHidden).map((g) => g.id)), [games]);
  const picking = categories.find((c) => c.id === pickingFor);

  const run = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const move = (index: number, step: -1 | 1) => {
    const ids = categories.map((c) => c.id);
    const target = index + step;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => useCategoriesStore.getState().reorder(ids));
  };

  const createCategory = () =>
    run(async () => {
      await useCategoriesStore.getState().create(newName);
      setNewName('');
    });

  return (
    <>
      <Modal
        title="Categorias"
        subtitle="Aparecem na lista lateral da biblioteca, nesta ordem. Um jogo pode ficar em várias."
        icon={<Tags className="w-4 h-4 text-indigo-400" />}
        size="lg"
        onClose={onClose}
        bodyClassName="p-2"
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
                autoFocus
                data-nav-start
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={MAX_CATEGORY_NAME}
                placeholder="Nome da nova categoria (ex: Multiplayer, Zelda, Para zerar)"
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
        {categories.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-400">
            Nenhuma categoria ainda. Crie a primeira aqui embaixo e depois arraste os jogos para ela na lista lateral, ou use o botão direito em um jogo.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {categories.map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                count={category.gameIds.filter((id) => visibleIds.has(id)).length}
                isFirst={index === 0}
                isLast={index === categories.length - 1}
                run={run}
                onMove={(step) => move(index, step)}
                onAddGames={() => setPickingFor(category.id)}
              />
            ))}
          </ul>
        )}
      </Modal>

      {picking && (
        <GamePickerModal
          title={`Jogos de ${picking.name}`}
          hint="Clique para adicionar. Os marcados já estão na categoria."
          excludeIds={picking.gameIds}
          closeOnPick={false}
          allowRegister={false}
          onPick={(game) => void run(() => useCategoriesStore.getState().setGames(picking.id, [game.id], true))}
          onClose={() => setPickingFor(null)}
        />
      )}
    </>
  );
};
