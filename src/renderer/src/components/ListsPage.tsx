import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ListOrdered, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import { Game } from '@shared/types/game';
import { GameList } from '@shared/types/lists';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useListsStore } from '../stores/useListsStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { GamePickerModal } from './GamePickerModal';
import { Button, EmptyState, Notice, focusRing, iconButtonClass } from './ui';
import { CoverCard, GameCover } from './journal/CoverCard';
import { CreateListModal, LIST_IDEAS } from './journal/CreateListModal';
import { PageHeader, emptyBox, pageClass } from './journal/PageLayout';
import { plural } from './journal/format';

interface ListsPageProps {
  openListId?: string;
  onOpenList: (id: string | undefined) => void;
  onOpenGame: (game: Game) => void;
}

const COLLAGE_SIZE = 5;

// Capas sobrepostas: a cara da lista, em qualquer tela
export const ListCard: React.FC<{ list: GameList; games: Map<string, Game>; onOpen: () => void }> = ({ list, games, onOpen }) => {
  const covers = list.gameIds.filter((id) => games.has(id)).slice(0, COLLAGE_SIZE);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-list-id={list.id}
      className={`group text-left p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-600 hover:bg-slate-900/80 transition-colors ${focusRing}`}
    >
      <span className="relative flex h-40 mb-3.5 pr-16">
        {covers.map((id, index) => (
          <span
            key={id}
            className="relative h-full aspect-[2/3] flex-shrink-0 overflow-hidden rounded-md bg-slate-800 shadow-[4px_0_12px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:-translate-y-1"
            style={{ marginLeft: index === 0 ? 0 : -48, zIndex: COLLAGE_SIZE - index, transitionDelay: `${index * 25}ms` }}
          >
            <GameCover src={games.get(id)?.media?.coverUrl} title={games.get(id)?.title ?? ''} />
          </span>
        ))}
        {covers.length === 0 && (
          <span className="h-full aspect-[2/3] rounded-md bg-slate-800/50 border border-dashed border-slate-700 flex items-center justify-center">
            <Plus className="w-5 h-5 text-slate-600" />
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5 text-[15px] text-white">
        <span className="truncate">{list.title}</span>
        {list.featured && <Star className="w-3.5 h-3.5 flex-shrink-0 text-amber-400 fill-amber-400" aria-label="Destacada no perfil" />}
      </span>
      <span className="block mt-0.5 text-xs text-slate-400">
        {plural(list.gameIds.length, 'jogo', 'jogos')}
        {list.ranked ? ' · ranqueada' : ''}
      </span>
      {list.description && <span className="block mt-1.5 text-xs leading-relaxed text-slate-300 line-clamp-2">{list.description}</span>}
    </button>
  );
};

const ListDetail: React.FC<{ list: GameList; games: Map<string, Game>; startPicking: boolean; onBack: () => void; onOpenGame: (game: Game) => void }> = ({ list, games, startPicking, onBack, onOpenGame }) => {
  const save = useListsStore((s) => s.save);
  const remove = useListsStore((s) => s.remove);
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description ?? '');
  const [picking, setPicking] = useState(startPicking);
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

  const toggleClass = (on: boolean) => (on ? 'ring-1 ring-indigo-400 bg-indigo-500/15 text-white hover:bg-indigo-500/25' : '');

  return (
    <div className={pageClass}>
      <button type="button" onClick={onBack} className={`inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white rounded-sm ${focusRing}`}>
        <ArrowLeft className="w-3.5 h-3.5" /> Todas as listas
      </button>

      <header className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          maxLength={80}
          aria-label="Nome da lista"
          className={`w-full px-2 py-1 -ml-2 font-display text-3xl text-white bg-transparent border border-transparent rounded-lg hover:border-slate-700 focus:border-indigo-400 ${focusRing}`}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (list.description ?? '') && update({ description })}
          rows={2}
          maxLength={500}
          placeholder="Escreva do que se trata a lista (opcional)"
          aria-label="Descrição da lista"
          className={`w-full px-2 py-1 -ml-2 text-sm leading-relaxed text-slate-300 placeholder-slate-600 bg-transparent border border-transparent rounded-lg resize-none hover:border-slate-700 focus:border-indigo-400 ${focusRing}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="md" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setPicking(true)}>
            Adicionar jogos
          </Button>
          <Button icon={<ListOrdered className="w-3.5 h-3.5" />} onClick={() => update({ ranked: !list.ranked })} aria-pressed={list.ranked} className={toggleClass(list.ranked)}>
            Ranqueada
          </Button>
          <Button
            icon={<Star className={`w-3.5 h-3.5 ${list.featured ? 'text-amber-400 fill-amber-400' : ''}`} />}
            onClick={() => update({ featured: !list.featured })}
            aria-pressed={list.featured}
            className={toggleClass(list.featured)}
          >
            Destacar no Perfil
          </Button>
          <span className="flex-1" />
          <span className="text-xs text-slate-500">{plural(entries.length, 'jogo', 'jogos')}</span>
          {confirmDelete ? (
            <span className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-lg bg-red-500/10 border border-red-500/30">
              <span className="text-xs text-red-200">Apagar a lista? Os jogos continuam na biblioteca.</span>
              <Button
                variant="danger"
                onClick={() =>
                  run(async () => {
                    await remove(list.id);
                    onBack();
                  })
                }
              >
                Apagar
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <Button variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmDelete(true)} className="hover:text-red-300">
              Apagar lista
            </Button>
          )}
        </div>
      </header>

      <Notice>{error}</Notice>

      {entries.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Lista vazia"
          description="Escolha quantos jogos quiser: da biblioteca, desinstalados ou registrados à mão."
          className={emptyBox}
          actions={
            <Button variant="primary" size="md" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setPicking(true)}>
              Adicionar jogos
            </Button>
          }
        />
      ) : (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">
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
              onDragEnd={() => setDragIndex(null)}
              className={`min-w-0 transition-opacity ${dragIndex === index ? 'opacity-40' : ''}`}
            >
              <CoverCard
                title={game.title}
                coverUrl={game.media?.coverUrl}
                gameId={game.id}
                onOpen={() => onOpenGame(game)}
                badge={
                  list.ranked ? (
                    <span className="absolute top-1.5 left-1.5 min-w-7 h-7 px-1.5 flex items-center justify-center rounded-lg bg-black/80 font-display text-sm text-white shadow">{index + 1}</span>
                  ) : undefined
                }
              />
              <div className="mt-1.5 flex items-center gap-1">
                <button type="button" onClick={() => reorder(index, index - 1)} disabled={index === 0} aria-label={`Mover ${game.title} para trás`} className={`${iconButtonClass} p-1 disabled:opacity-30`}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => reorder(index, index + 1)}
                  disabled={index === entries.length - 1}
                  aria-label={`Mover ${game.title} para frente`}
                  className={`${iconButtonClass} p-1 disabled:opacity-30`}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => update({ gameIds: list.gameIds.filter((id) => id !== game.id) })}
                  aria-label={`Tirar ${game.title} da lista`}
                  title="Tirar da lista"
                  className={`${iconButtonClass} p-1 hover:text-red-300`}
                >
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
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const games = useMemo(() => new Map(allGames.filter((g) => !g.isHidden).map((g) => [g.id, g])), [allGames]);
  const opened = lists.find((l) => l.id === openListId);

  useEffect(() => {
    load()
      .catch((err) => setError(ipcErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [load]);

  if (opened) {
    return (
      <ListDetail
        key={opened.id}
        list={opened}
        games={games}
        startPicking={justCreated === opened.id}
        onBack={() => {
          setJustCreated(null);
          onOpenList(undefined);
        }}
        onOpenGame={onOpenGame}
      />
    );
  }

  const newListButton = (
    <Button variant="primary" size="md" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setCreating('')}>
      Nova lista
    </Button>
  );

  return (
    <div className={pageClass}>
      <PageHeader title="Listas" subtitle="Melhores do ano, fila das férias, o que indicar. As preferidas podem ir para o perfil." actions={lists.length > 0 ? newListButton : undefined} />

      <Notice>{error}</Notice>

      {!loaded ? null : lists.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="Crie sua primeira lista"
          description="Use uma ideia pronta ou dê o nome que quiser."
          className={emptyBox}
          actions={
            <div className="flex flex-col items-center gap-4">
              {newListButton}
              <span className="flex flex-wrap justify-center gap-2">
            {LIST_IDEAS.slice(0, 4).map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setCreating(idea)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-slate-700 text-[13px] text-slate-300 hover:text-white hover:border-indigo-400 hover:bg-indigo-500/10 transition-colors ${focusRing}`}
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-300" /> {idea}
              </button>
            ))}
              </span>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} games={games} onOpen={() => onOpenList(list.id)} />
          ))}
          <button
            type="button"
            onClick={() => setCreating('')}
            className={`min-h-[230px] flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 text-sm text-slate-400 hover:text-white hover:border-indigo-400 hover:bg-indigo-500/5 transition-colors ${focusRing}`}
          >
            <Plus className="w-6 h-6" /> Nova lista
          </button>
        </div>
      )}

      {creating !== null && (
        <CreateListModal
          initialTitle={creating}
          onClose={() => setCreating(null)}
          onCreated={(list) => {
            setJustCreated(list.id);
            onOpenList(list.id);
          }}
        />
      )}
    </div>
  );
};
