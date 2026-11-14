import React, { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Plus, RotateCcw, Star, Trash2, X } from 'lucide-react';
import { Game } from '@shared/types/game';
import { GameList, GameTier } from '@shared/types/lists';
import { MAX_TIERS, MAX_TIER_LABEL, TIER_COLORS, moveInTierList, unrankedIds } from '@shared/utils/tier-list';
import { useListsStore } from '../stores/useListsStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { GamePickerModal } from './GamePickerModal';
import { GameCover } from './journal/CoverCard';
import { pageClass } from './journal/PageLayout';
import { plural } from './journal/format';
import { Button, Notice, focusRing, iconButtonClass } from './ui';
import { MyReactionBar } from './friends/Reactions';

interface TierListDetailProps {
  list: GameList;
  games: Map<string, Game>;
  startPicking: boolean;
  onBack: () => void;
  onOpenGame: (game: Game) => void;
}

// Capa pequena: arrasta com o mouse; com clique, Enter ou o botão A do controle fica escolhida para mover pela barra
const TierCover: React.FC<{
  game: Game;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: () => void;
}> = ({ game, selected, dragging, onSelect, onDragStart, onDragEnd, onDropBefore }) => (
  <button
    type="button"
    draggable
    onDragStart={(e) => {
      e.dataTransfer.effectAllowed = 'move';
      onDragStart();
    }}
    onDragEnd={onDragEnd}
    onDragOver={(e) => {
      e.preventDefault();
      e.stopPropagation();
    }}
    onDrop={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onDropBefore();
    }}
    onClick={onSelect}
    title={game.title}
    aria-label={game.title}
    aria-pressed={selected}
    className={`relative w-[72px] aspect-[2/3] flex-shrink-0 overflow-hidden rounded-md bg-slate-800 transition ${
      selected ? 'ring-2 ring-white scale-105 z-10' : 'hover:brightness-110'
    } ${dragging ? 'opacity-30' : ''} ${focusRing}`}
  >
    <GameCover src={game.media?.coverUrl} title={game.title} gameId={game.id} compact />
  </button>
);

export const TierListDetail: React.FC<TierListDetailProps> = ({ list, games, startPicking, onBack, onOpenGame }) => {
  const save = useListsStore((s) => s.save);
  const remove = useListsStore((s) => s.remove);
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description ?? '');
  const [picking, setPicking] = useState(startPicking);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tiers = list.tiers ?? [];
  const visible = (ids: string[]) => ids.flatMap((id) => (games.has(id) ? [games.get(id)!] : []));
  const pool = visible(unrankedIds(list));
  const selectedGame = selected ? games.get(selected) : undefined;
  const total = visible(list.gameIds).length;

  const run = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };
  const update = (changes: Partial<GameList>) => run(() => save({ id: list.id, title: list.title, ...changes }));
  const saveTiers = (next: GameTier[]) => update({ tiers: next });

  // Mover: para uma fileira (ou "Sem tier" com null), antes de outro jogo ou no fim
  const move = (gameId: string, tierId: string | null, beforeId?: string) => {
    setSelected(null);
    setDragging(null);
    setOverRow(null);
    const next = moveInTierList(list, gameId, tierId, beforeId);
    if (next !== list) void update(next);
  };

  const dropInRow = (tierId: string | null, beforeId?: string) => {
    if (dragging) move(dragging, tierId, beforeId);
  };

  const rowDragProps = (rowId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOverRow(rowId ?? 'pool');
    },
    onDragLeave: () => setOverRow((current) => (current === (rowId ?? 'pool') ? null : current)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dropInRow(rowId);
    }
  });

  const editTier = (id: string, changes: Partial<GameTier>) => saveTiers(tiers.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  const moveTier = (index: number, to: number) => {
    if (to < 0 || to >= tiers.length) return;
    const next = [...tiers];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    void saveTiers(next);
  };
  const addTier = () => {
    if (tiers.length >= MAX_TIERS) return;
    const id = crypto.randomUUID();
    void saveTiers([...tiers, { id, label: 'Novo', color: TIER_COLORS[Math.min(tiers.length, TIER_COLORS.length - 1)], gameIds: [] }]);
    setEditing(id);
  };
  const removeTier = (id: string) => {
    setEditing(null);
    void saveTiers(tiers.filter((t) => t.id !== id));
  };

  const saveTitle = () => {
    if (!title.trim()) {
      setTitle(list.title);
      setError('A tier list precisa de um nome: voltei para o anterior.');
    } else if (title !== list.title) {
      void run(() => save({ id: list.id, title }));
    }
  };

  const covers = (rowGames: Game[], tierId: string | null) =>
    rowGames.map((game) => (
      <TierCover
        key={game.id}
        game={game}
        selected={selected === game.id}
        dragging={dragging === game.id}
        onSelect={() => setSelected((current) => (current === game.id ? null : game.id))}
        onDragStart={() => {
          setSelected(null);
          setDragging(game.id);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOverRow(null);
        }}
        onDropBefore={() => dropInRow(tierId, game.id)}
      />
    ));

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
          aria-label="Nome da tier list"
          className={`w-full px-2 py-1 -ml-2 font-display text-3xl text-white bg-transparent border border-transparent rounded-lg hover:border-slate-700 focus:border-indigo-400 ${focusRing}`}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (list.description ?? '') && update({ description })}
          rows={2}
          maxLength={500}
          placeholder="Escreva o critério da tier list (opcional)"
          aria-label="Descrição da tier list"
          className={`w-full px-2 py-1 -ml-2 text-sm leading-relaxed text-slate-300 placeholder-slate-600 bg-transparent border border-transparent rounded-lg resize-none hover:border-slate-700 focus:border-indigo-400 ${focusRing}`}
        />
        <MyReactionBar kind="list" target={list.id} title={list.title} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="md" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setPicking(true)}>
            Adicionar jogos
          </Button>
          <Button
            icon={<Star className={`w-3.5 h-3.5 ${list.featured ? 'text-amber-400 fill-amber-400' : ''}`} />}
            onClick={() => update({ featured: !list.featured })}
            aria-pressed={list.featured}
            className={list.featured ? 'ring-1 ring-indigo-400 bg-indigo-500/15 text-white hover:bg-indigo-500/25' : ''}
          >
            Destacar no Perfil
          </Button>
          <Button
            variant="ghost"
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={() => saveTiers(tiers.map((t) => ({ ...t, gameIds: [] })))}
            disabled={pool.length === total}
            title="Volta todos os jogos para Sem tier"
          >
            Recomeçar
          </Button>
          <span className="flex-1" />
          <span className="text-xs text-slate-500">
            {plural(total, 'jogo', 'jogos')}
            {pool.length > 0 && total > 0 ? ` · ${pool.length} sem tier` : ''}
          </span>
          {confirmDelete ? (
            <span className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-lg bg-red-500/10 border border-red-500/30">
              <span className="text-xs text-red-200">Apagar a tier list? Os jogos continuam na biblioteca.</span>
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
              Apagar
            </Button>
          )}
        </div>
      </header>

      <Notice>{error}</Notice>

      {/* Barra de mover: o caminho do controle e do teclado (escolha a capa, depois a fileira) */}
      {selectedGame && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-400/40 bg-slate-900/95 backdrop-blur px-3 py-2 shadow-lg">
          <span className="text-sm text-white truncate max-w-[16rem]">{selectedGame.title}</span>
          <span className="text-xs text-slate-400">mover para</span>
          {tiers.map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => move(selectedGame.id, tier.id)}
              style={{ backgroundColor: tier.color }}
              className={`min-w-8 h-8 px-2 rounded-md text-sm font-bold text-slate-900 hover:brightness-110 ${focusRing}`}
            >
              {tier.label}
            </button>
          ))}
          <Button onClick={() => move(selectedGame.id, null)}>Sem tier</Button>
          <span className="flex-1" />
          <button type="button" onClick={() => onOpenGame(selectedGame)} title="Abrir a página do jogo" aria-label="Abrir a página do jogo" className={`${iconButtonClass} p-1.5`}>
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              void update({ gameIds: list.gameIds.filter((id) => id !== selectedGame.id) });
            }}
            title="Tirar da tier list"
            aria-label="Tirar da tier list"
            className={`${iconButtonClass} p-1.5 hover:text-red-300`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setSelected(null)} title="Cancelar" aria-label="Cancelar" className={`${iconButtonClass} p-1.5`}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <section className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950/60" aria-label="Fileiras">
        {tiers.map((tier, index) => {
          const rowGames = visible(tier.gameIds);
          return (
            <div key={tier.id} className="border-b border-slate-800 last:border-b-0">
              <div className={`flex min-h-[112px] transition-colors ${overRow === tier.id ? 'bg-indigo-500/10' : ''}`} {...rowDragProps(tier.id)}>
                <button
                  type="button"
                  onClick={() => (selected ? move(selected, tier.id) : setEditing((current) => (current === tier.id ? null : tier.id)))}
                  title={selected ? `Mover para ${tier.label}` : 'Mudar nome e cor da fileira'}
                  style={{ backgroundColor: tier.color }}
                  className={`w-24 flex-shrink-0 flex items-center justify-center p-2 text-center font-display text-xl font-bold leading-tight text-slate-900 break-words hover:brightness-110 ${focusRing}`}
                >
                  {tier.label}
                </button>
                <div className="flex-1 flex flex-wrap content-start gap-1.5 p-1.5">
                  {covers(rowGames, tier.id)}
                  {selected && !tier.gameIds.includes(selected) && (
                    <button
                      type="button"
                      onClick={() => move(selected, tier.id)}
                      className={`w-[72px] aspect-[2/3] flex items-center justify-center rounded-md border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-indigo-400 ${focusRing}`}
                      aria-label={`Pôr em ${tier.label}`}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {editing === tier.id && (
                <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-slate-900/80 border-t border-slate-800">
                  <input
                    autoFocus
                    defaultValue={tier.label}
                    maxLength={MAX_TIER_LABEL}
                    aria-label="Nome da fileira"
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== tier.label && editTier(tier.id, { label: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className={`w-40 h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:border-indigo-400 ${focusRing}`}
                  />
                  <span className="flex flex-wrap gap-1" role="radiogroup" aria-label="Cor da fileira">
                    {TIER_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={tier.color === color}
                        aria-label={`Cor ${color}`}
                        onClick={() => editTier(tier.id, { color })}
                        style={{ backgroundColor: color }}
                        className={`w-6 h-6 rounded-md ${tier.color === color ? 'ring-2 ring-white' : ''} ${focusRing}`}
                      />
                    ))}
                  </span>
                  <span className="flex-1" />
                  <button type="button" onClick={() => moveTier(index, index - 1)} disabled={index === 0} aria-label="Subir a fileira" title="Subir" className={`${iconButtonClass} p-1.5 disabled:opacity-30`}>
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTier(index, index + 1)}
                    disabled={index === tiers.length - 1}
                    aria-label="Descer a fileira"
                    title="Descer"
                    className={`${iconButtonClass} p-1.5 disabled:opacity-30`}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <Button variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => removeTier(tier.id)} className="hover:text-red-300" title="Os jogos dela voltam para Sem tier">
                    Apagar fileira
                  </Button>
                  <Button onClick={() => setEditing(null)}>Pronto</Button>
                </div>
              )}
            </div>
          );
        })}
        {tiers.length < MAX_TIERS && (
          <button
            type="button"
            onClick={addTier}
            className={`w-full flex items-center justify-center gap-1.5 h-10 text-xs text-slate-400 hover:text-white hover:bg-slate-900/60 ${focusRing}`}
          >
            <Plus className="w-3.5 h-3.5" /> Nova fileira
          </button>
        )}
      </section>

      <section aria-label="Sem tier" className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Sem tier <span className="normal-case tracking-normal font-normal text-slate-500">· arraste para uma fileira, ou escolha a capa e depois a fileira</span>
        </h3>
        <div
          {...rowDragProps(null)}
          className={`min-h-[124px] flex flex-wrap content-start gap-1.5 p-1.5 rounded-xl border border-dashed transition-colors ${overRow === 'pool' ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700'}`}
        >
          {covers(pool, null)}
          {selected && !pool.some((g) => g.id === selected) && (
            <button
              type="button"
              onClick={() => move(selected, null)}
              className={`w-[72px] aspect-[2/3] flex items-center justify-center rounded-md border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-indigo-400 ${focusRing}`}
              aria-label="Tirar da fileira"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setPicking(true)}
            className={`w-[72px] aspect-[2/3] flex flex-col items-center justify-center gap-1 rounded-md bg-slate-900/60 text-[11px] text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}
          >
            <Plus className="w-5 h-5" /> Jogos
          </button>
        </div>
      </section>

      {picking && (
        <GamePickerModal
          title="Adicionar jogos"
          hint={`À tier list ${list.title}. Eles entram em Sem tier.`}
          excludeIds={list.gameIds}
          closeOnPick={false}
          onPick={(game) => void update({ gameIds: [...list.gameIds, game.id] })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};
