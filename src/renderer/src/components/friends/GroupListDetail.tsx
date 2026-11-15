import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ListOrdered, LogOut, Plus, RefreshCw, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Game } from '@shared/types/game';
import { GroupList, SocialFriend } from '@shared/types/social';
import { findOwnedGame, indexGamesByKey, libraryKeysOf } from '@shared/utils/game-match';
import { useGroupListsStore } from '../../stores/useGroupListsStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useReactionsStore } from '../../stores/useReactionsStore';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { GamePickerModal } from '../GamePickerModal';
import { CoverCard } from '../journal/CoverCard';
import { emptyBox, pageClass } from '../journal/PageLayout';
import { plural } from '../journal/format';
import { Button, EmptyState, Notice, focusRing, iconButtonClass } from '../ui';
import { Avatar } from './parts';
import { ReactionBar } from './Reactions';

interface GroupListDetailProps {
  list: GroupList;
  startPicking: boolean;
  onBack: () => void;
  onOpenGame: (game: Game) => void;
}

export const GroupListDetail: React.FC<GroupListDetailProps> = ({ list, startPicking, onBack, onOpenGame }) => {
  const me = useReactionsStore((s) => s.me);
  const rawGames = useLibraryStore((s) => s.rawGames);
  const foldedGames = useLibraryStore((s) => s.games);
  const editionPrefs = useLibraryStore((s) => s.editionPrefs);
  const { reloadOne, update, remove, addMember, removeMember, addGame, removeGame, reorder } = useGroupListsStore();

  const isOwner = list.owner.id === me;
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description);
  const [picking, setPicking] = useState(startPicking);
  const [inviting, setInviting] = useState(false);
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(list.title);
    setDescription(list.description);
  }, [list.title, list.description]);

  useEffect(() => {
    if (!isOwner || !inviting) return;
    let active = true;
    window.electronAPI
      ?.socialGetFriends()
      .then((items) => active && setFriends(items))
      .catch((err) => active && setError(ipcErrorMessage(err)));
    return () => {
      active = false;
    };
  }, [isOwner, inviting]);

  const ownedByKey = useMemo(() => indexGamesByKey(rawGames, editionPrefs), [rawGames, editionPrefs]);

  // Jogos já adicionados à lista em grupo ficam desativados no seletor, casando por título normalizado ou Steam AppID
  const excludeIds = useMemo(() => {
    const presentKeys = new Set<string>();
    for (const item of list.items) {
      presentKeys.add(item.titleKey);
      if (item.steamKey) presentKeys.add(item.steamKey);
    }
    const rawById = new Map(rawGames.map((g) => [g.id, g]));
    const ids: string[] = [];
    for (const g of foldedGames) {
      const members = g.editions ? g.editions.map((e) => rawById.get(e.id)).filter((m): m is Game => !!m) : [g];
      if (libraryKeysOf(members).some((k) => presentKeys.has(k))) ids.push(g.id);
    }
    return ids;
  }, [list.items, rawGames, foldedGames]);

  const run = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await run(() => reloadOne(list.id));
    setRefreshing(false);
  };

  const saveTitle = () => {
    if (!isOwner) return;
    if (!title.trim()) {
      setTitle(list.title);
      setError('A lista precisa de um nome: voltei para o anterior.');
    } else if (title.trim() !== list.title) {
      void run(() => update(list.id, { title: title.trim() }));
    }
  };

  const saveDescription = () => {
    if (!isOwner || description === list.description) return;
    void run(() => update(list.id, { description }));
  };

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= list.items.length || from === to) return;
    const keys = list.items.map((i) => i.titleKey);
    const [moved] = keys.splice(from, 1);
    keys.splice(to, 0, moved);
    void run(() => reorder(list.id, keys));
  };

  const memberIds = new Set(list.members.map((m) => m.id));
  const invitableFriends = friends.filter((f) => !memberIds.has(f.id));
  const toggleClass = (on: boolean) => (on ? 'ring-1 ring-indigo-400 bg-indigo-500/15 text-white hover:bg-indigo-500/25' : '');

  return (
    <div className={pageClass}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className={`inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white rounded-sm ${focusRing}`}>
          <ArrowLeft className="w-3.5 h-3.5" /> Todas as listas
        </button>
        <Button icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />} onClick={() => void refresh()} disabled={refreshing}>
          Atualizar
        </Button>
      </div>

      <header className="space-y-3">
        {isOwner ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            maxLength={80}
            aria-label="Nome da lista"
            className={`w-full px-2 py-1 -ml-2 font-display text-3xl text-white bg-transparent border border-transparent rounded-lg hover:border-slate-700 focus:border-indigo-400 ${focusRing}`}
          />
        ) : (
          <h1 className="font-display text-3xl text-white">{list.title}</h1>
        )}

        {isOwner ? (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            rows={2}
            maxLength={500}
            placeholder="Escreva do que se trata a lista (opcional)"
            aria-label="Descrição da lista"
            className={`w-full px-2 py-1 -ml-2 text-sm leading-relaxed text-slate-300 placeholder-slate-600 bg-transparent border border-transparent rounded-lg resize-none hover:border-slate-700 focus:border-indigo-400 ${focusRing}`}
          />
        ) : (
          list.description && <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">{list.description}</p>
        )}

        {/* Participantes */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 mr-1">
            <Users className="w-3.5 h-3.5 text-indigo-300" />
            Participantes:
          </span>
          <span className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-xs text-indigo-100">
            <Avatar user={list.owner} size="xs" />
            <span>{list.owner.id === me ? 'Você' : list.owner.name}</span>
            <span className="text-indigo-300/80">· criou</span>
          </span>
          {list.members.map((member) => (
            <span
              key={member.id}
              className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs text-slate-200"
            >
              <Avatar user={member} size="xs" />
              <span>{member.id === me ? 'Você' : member.name}</span>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => void run(() => removeMember(list.id, member.id))}
                  aria-label={`Remover ${member.name} da lista`}
                  title={`Remover ${member.name}`}
                  className={`p-0.5 rounded-full text-slate-400 hover:text-red-300 ${focusRing}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          {isOwner && (
            <Button size="sm" icon={<UserPlus className="w-3.5 h-3.5" />} onClick={() => setInviting((v) => !v)} aria-expanded={inviting}>
              Convidar amigo
            </Button>
          )}
        </div>

        {isOwner && inviting && (
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">Convidar amigos para editar juntos</span>
              <button type="button" onClick={() => setInviting(false)} aria-label="Fechar convite" className={`${iconButtonClass} p-1`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {invitableFriends.length === 0 ? (
              <p className="text-xs text-slate-400">
                {friends.length === 0 ? 'Você ainda não tem amigos na conta Lazulium.' : 'Todos os seus amigos já participam desta lista.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {invitableFriends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await addMember(list.id, friend.id);
                      })
                    }
                    className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 hover:border-indigo-400 hover:bg-indigo-500/15 text-xs text-slate-200 transition-colors ${focusRing}`}
                  >
                    <Avatar user={friend} size="xs" />
                    <span>{friend.name}</span>
                    <Plus className="w-3 h-3 text-indigo-300" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <ReactionBar target={{ owner: list.owner.id, kind: 'list', target: list.id, title: list.title }} alwaysShow />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="md" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setPicking(true)}>
            Adicionar jogos
          </Button>
          {isOwner && (
            <Button icon={<ListOrdered className="w-3.5 h-3.5" />} onClick={() => void run(() => update(list.id, { ranked: !list.ranked }))} aria-pressed={list.ranked} className={toggleClass(list.ranked)}>
              Ranqueada
            </Button>
          )}
          <span className="flex-1" />
          <span className="text-xs text-slate-500">{plural(list.items.length, 'jogo', 'jogos')}</span>

          {isOwner ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-lg bg-red-500/10 border border-red-500/30">
                <span className="text-xs text-red-200">Apagar para todo mundo?</span>
                <Button
                  variant="danger"
                  onClick={() =>
                    void run(async () => {
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
            )
          ) : me && (
            confirmLeave ? (
              <span className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-lg bg-red-500/10 border border-red-500/30">
                <span className="text-xs text-red-200">Sair da lista em grupo?</span>
                <Button
                  variant="danger"
                  onClick={() =>
                    void run(async () => {
                      await removeMember(list.id, me);
                      onBack();
                    })
                  }
                >
                  Sair
                </Button>
                <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
                  Cancelar
                </Button>
              </span>
            ) : (
              <Button variant="ghost" icon={<LogOut className="w-3.5 h-3.5" />} onClick={() => setConfirmLeave(true)} className="hover:text-red-300">
                Sair da lista
              </Button>
            )
          )}
        </div>
      </header>

      <Notice>{error}</Notice>

      {list.items.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Lista vazia"
          description="Qualquer participante pode adicionar, remover e organizar os jogos desta lista."
          className={emptyBox}
          actions={
            <Button variant="primary" size="md" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setPicking(true)}>
              Adicionar jogos
            </Button>
          }
        />
      ) : (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">
          {list.items.map((item, index) => {
            const ownedMatch = findOwnedGame(ownedByKey, item);
            const coverUrl = ownedMatch?.game.media?.coverUrl ?? item.coverUrl ?? undefined;
            const addedLabel = item.addedBy ? `por ${item.addedBy.id === me ? 'você' : item.addedBy.name}` : 'Autoria removida';
            return (
              <li
                key={item.titleKey}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null) moveItem(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={`min-w-0 transition-opacity ${dragIndex === index ? 'opacity-40' : ''}`}
              >
                <CoverCard
                  title={item.title}
                  coverUrl={coverUrl}
                  gameId={ownedMatch?.game.id}
                  onOpen={() => ownedMatch && onOpenGame(ownedMatch.game)}
                  highlight={!!ownedMatch}
                  badge={
                    <>
                      {list.ranked && (
                        <span className="absolute top-1.5 left-1.5 min-w-7 h-7 px-1.5 flex items-center justify-center rounded-lg bg-black/80 font-display text-sm text-white shadow">
                          {index + 1}
                        </span>
                      )}
                      {ownedMatch && (
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/40 text-[10px] font-medium text-emerald-200 shadow">
                          Você tem
                        </span>
                      )}
                    </>
                  }
                  meta={<span className="truncate">{addedLabel}</span>}
                />
                <div className="mt-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveItem(index, index - 1)}
                    disabled={index === 0}
                    aria-label={`Mover ${item.title} para trás`}
                    className={`${iconButtonClass} p-1 disabled:opacity-30`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, index + 1)}
                    disabled={index === list.items.length - 1}
                    aria-label={`Mover ${item.title} para frente`}
                    className={`${iconButtonClass} p-1 disabled:opacity-30`}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => void run(() => removeGame(list.id, item.titleKey))}
                    aria-label={`Tirar ${item.title} da lista`}
                    title="Tirar da lista"
                    className={`${iconButtonClass} p-1 hover:text-red-300`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {picking && (
        <GamePickerModal
          title="Adicionar jogos"
          hint={`À lista em grupo ${list.title}. Escolha quantos quiser.`}
          excludeIds={excludeIds}
          closeOnPick={false}
          onPick={(game) => void run(() => addGame(list.id, game.id))}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};
