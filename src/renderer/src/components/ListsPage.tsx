import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Gamepad2, ListOrdered, Plus, Star, Trash2, X } from 'lucide-react';
import { Game } from '@shared/types/game';
import { GameList } from '@shared/types/lists';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useListsStore } from '../stores/useListsStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { GamePickerModal } from './GamePickerModal';

interface ListsPageProps {
  openListId?: string;
  onOpenList: (id: string | undefined) => void;
  onOpenGame: (game: Game) => void;
}

const COLLAGE_SIZE = 5;
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const secondaryButton = `flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors ${focusRing}`;
const primaryButton = `flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors ${focusRing}`;

const gameCount = (count: number) => `${count} ${count === 1 ? 'jogo' : 'jogos'}`;

const CoverImage: React.FC<{ game?: Game }> = ({ game }) =>
  game?.media?.coverUrl ? (
    <img src={game.media.coverUrl} alt="" loading="lazy" className="w-full h-full object-contain" />
  ) : (
    <span className="w-full h-full flex items-center justify-center p-1.5 text-center text-[10px] leading-tight text-slate-400">{game?.title ?? <Gamepad2 className="w-5 h-5 text-slate-600" />}</span>
  );

// Capas sobrepostas: a cara da lista, em qualquer tela
export const ListCard: React.FC<{ list: GameList; games: Map<string, Game>; onOpen: () => void }> = ({ list, games, onOpen }) => {
  const covers = list.gameIds.slice(0, COLLAGE_SIZE);
  return (
    <button onClick={onOpen} className={`group text-left p-3 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-600 transition-colors ${focusRing}`}>
      <span className="flex h-36 mb-3 pr-14">
        {covers.map((id, index) => (
          <span key={id} className="relative h-full aspect-[2/3] flex-shrink-0 bg-slate-800 border-r-2 border-slate-950" style={{ marginLeft: index === 0 ? 0 : -44, zIndex: COLLAGE_SIZE - index }}>
            <CoverImage game={games.get(id)} />
          </span>
        ))}
        {covers.length === 0 && <span className="h-full aspect-[2/3] bg-slate-800/60 border border-dashed border-slate-700 flex items-center justify-center"><Plus className="w-5 h-5 text-slate-600" /></span>}
      </span>
      <span className="flex items-center gap-1.5 text-sm text-white">
        <span className="truncate">{list.title}</span>
        {list.featured && <Star className="w-3 h-3 flex-shrink-0 text-amber-400 fill-amber-400" />}
      </span>
      <span className="block mt-0.5 text-xs text-slate-400">{gameCount(list.gameIds.length)}{list.ranked ? ' · ranqueada' : ''}</span>
      {list.description && <span className="block mt-1.5 text-xs text-slate-300 line-clamp-2">{list.description}</span>}
    </button>
  );
};

const ListDetail: React.FC<{ list: GameList; games: Map<string, Game>; onBack: () => void; onOpenGame: (game: Game) => void }> = ({ list, games, onBack, onOpenGame }) => {
  const save = useListsStore((s) => s.save);
  const remove = useListsStore((s) => s.remove);
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description ?? '');
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Jogo oculto ou que saiu do banco fica fora da tela, mas continua salvo na lista
  const entries = list.gameIds.flatMap((id) => {
    const game = games.get(id);
    return game ? [game] : [];
  });

  const run = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const update = (changes: Partial<GameList>) => run(() => save({ id: list.id, title: list.title, ...changes }));

  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= entries.length || from === to) return;
    const ids = entries.map((g) => g.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void update({ gameIds: ids });
  };

  const saveTitle = () => {
    if (!title.trim()) {
      setTitle(list.title);
      setError('A lista precisa de um nome: voltei para o anterior.');
    } else if (title !== list.title) {
      void run(() => save({ id: list.id, title }));
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-6 space-y-5">
      <button onClick={onBack} className={`flex items-center gap-1.5 text-xs text-slate-400 hover:text-white rounded-sm ${focusRing}`}>
        <ArrowLeft className="w-3.5 h-3.5" /> Todas as listas
      </button>

      <header className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          maxLength={80}
          aria-label="Nome da lista"
          className={`w-full px-2 py-1 -ml-2 text-2xl text-white bg-transparent border border-transparent rounded-lg hover:border-slate-700 focus:border-indigo-400 ${focusRing}`}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (list.description ?? '') && update({ description })}
          rows={2}
          maxLength={500}
          placeholder="Descreva a lista (opcional)"
          aria-label="Descrição da lista"
          className={`w-full px-2 py-1 -ml-2 text-sm text-slate-300 placeholder-slate-600 bg-transparent border border-transparent rounded-lg resize-none hover:border-slate-700 focus:border-indigo-400 ${focusRing}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPicking(true)} className={primaryButton}>
            <Plus className="w-3.5 h-3.5" /> Adicionar jogos
          </button>
          <button onClick={() => update({ ranked: !list.ranked })} aria-pressed={list.ranked} className={`${secondaryButton} ${list.ranked ? 'ring-1 ring-indigo-400 text-white' : ''}`}>
            <ListOrdered className="w-3.5 h-3.5" /> Ranqueada
          </button>
          <button onClick={() => update({ featured: !list.featured })} aria-pressed={list.featured} className={`${secondaryButton} ${list.featured ? 'ring-1 ring-indigo-400 text-white' : ''}`}>
            <Star className={`w-3.5 h-3.5 ${list.featured ? 'text-amber-400 fill-amber-400' : ''}`} /> Destacar no Perfil
          </button>
          <span className="flex-1" />
          {confirmDelete ? (
            <>
              <span className="text-xs text-amber-300">Apagar esta lista? Os jogos continuam na biblioteca.</span>
              <button onClick={() => run(async () => { await remove(list.id); onBack(); })} className={`px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white ${focusRing}`}>
                Apagar
              </button>
              <button onClick={() => setConfirmDelete(false)} className={secondaryButton}>
                Cancelar
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className={`${secondaryButton} hover:text-red-300`}>
              <Trash2 className="w-3.5 h-3.5" /> Apagar lista
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-amber-950/60 border-amber-500/30 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </p>
      )}

      {entries.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-center rounded-lg bg-slate-900/40">
          <p className="text-sm text-slate-400">Esta lista está vazia.</p>
          <button onClick={() => setPicking(true)} className={primaryButton}>
            <Plus className="w-3.5 h-3.5" /> Adicionar jogos
          </button>
        </div>
      ) : (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {entries.map((game, index) => (
            <li
              key={game.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) reorder(dragIndex, index);
                setDragIndex(null);
              }}
              className={`group min-w-0 ${dragIndex === index ? 'opacity-40' : ''}`}
            >
              <button onClick={() => onOpenGame(game)} title={game.title} className={`relative block w-full aspect-[2/3] bg-slate-900 border border-slate-800 hover:border-slate-500 transition-colors ${focusRing}`}>
                <CoverImage game={game} />
                {list.ranked && <span className="absolute top-1.5 left-1.5 min-w-6 px-1.5 py-0.5 rounded-md bg-black/80 text-center text-xs font-bold text-white">{index + 1}</span>}
              </button>
              <p className="mt-1.5 text-xs text-slate-200 truncate">{game.title}</p>
              <div className="mt-1 flex items-center gap-1">
                <button onClick={() => reorder(index, index - 1)} disabled={index === 0} aria-label={`Mover ${game.title} para trás`} className={`p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 ${focusRing}`}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => reorder(index, index + 1)} disabled={index === entries.length - 1} aria-label={`Mover ${game.title} para frente`} className={`p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 ${focusRing}`}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="flex-1" />
                <button onClick={() => update({ gameIds: list.gameIds.filter((id) => id !== game.id) })} aria-label={`Tirar ${game.title} da lista`} title="Tirar da lista" className={`p-1 rounded-md bg-slate-800/80 hover:bg-red-500/20 hover:text-red-300 text-slate-400 ${focusRing}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {picking && (
        <GamePickerModal
          title="Adicionar jogos"
          hint={`À lista ${list.title}. Escolha quantos quiser.`}
          excludeIds={list.gameIds}
          closeOnPick={false}
          onPick={(game) => void update({ gameIds: [...list.gameIds, game.id] })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};

export const ListsPage: React.FC<ListsPageProps> = ({ openListId, onOpenList, onOpenGame }) => {
  const allGames = useLibraryStore((s) => s.games);
  const lists = useListsStore((s) => s.lists);
  const load = useListsStore((s) => s.load);
  const save = useListsStore((s) => s.save);
  const [error, setError] = useState<string | null>(null);
  const games = useMemo(() => new Map(allGames.filter((g) => !g.isHidden).map((g) => [g.id, g])), [allGames]);
  const opened = lists.find((l) => l.id === openListId);

  useEffect(() => {
    load().catch((err) => setError(ipcErrorMessage(err)));
  }, [load]);

  const createList = async () => {
    setError(null);
    try {
      const created = await save({ title: 'Nova lista' });
      if (created) onOpenList(created.id);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  if (opened) return <ListDetail key={opened.id} list={opened} games={games} onBack={() => onOpenList(undefined)} onOpenGame={onOpenGame} />;

  return (
    <div className="max-w-6xl mx-auto px-8 py-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-white">Listas</h1>
          <p className="mt-1 text-sm text-slate-400">Melhores do ano, fila das férias, o que indicar para os amigos: organize do seu jeito.</p>
        </div>
        <button onClick={createList} className={primaryButton}>
          <Plus className="w-3.5 h-3.5" /> Nova lista
        </button>
      </header>

      {error && (
        <p className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-amber-950/60 border-amber-500/30 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </p>
      )}

      {lists.length === 0 ? (
        <div className="py-20 flex flex-col items-center gap-3 text-center rounded-lg bg-slate-900/40">
          <ListOrdered className="w-8 h-8 text-slate-600" />
          <p className="text-sm text-slate-400">Nenhuma lista ainda.</p>
          <button onClick={createList} className={primaryButton}>
            <Plus className="w-3.5 h-3.5" /> Criar a primeira
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} games={games} onOpen={() => onOpenList(list.id)} />
          ))}
        </div>
      )}
    </div>
  );
};
