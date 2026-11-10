import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Game } from '@shared/types/game';
import { Achievement, GameAchievements, achievementSourceLabel } from '@shared/types/achievements';
import { Trophy, X, RefreshCw, Search, CheckCircle2, Lock, AlertTriangle, Settings, Info, Plus, Check, Trash2, Undo2, FilterX } from 'lucide-react';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, EmptyState, Modal, Skeleton, compactInputClass, focusRing, infoBoxClass, pillTabClass, warnBoxClass } from './ui';

interface AchievementsPanelProps {
  game: Game;
  onClose: () => void;
  onOpenSettings?: () => void;
}

type FilterType = 'all' | 'unlocked' | 'locked';

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'unlocked', label: 'Desbloqueadas' },
  { id: 'locked', label: 'Bloqueadas' }
];

function formatDate(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const AchievementRow: React.FC<{ item: Achievement; busy: boolean; onMark: (unlocked: boolean) => void; onRemove: () => void }> = ({ item, busy, onMark, onRemove }) => {
  const [iconFailed, setIconFailed] = useState(false);
  const icon = item.unlocked ? item.iconUrl : item.iconLockedUrl || item.iconUrl;
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        item.unlocked ? 'bg-slate-900/70 border-slate-800 hover:border-slate-600' : 'bg-slate-950/40 border-slate-800/60 hover:border-slate-700'
      }`}
    >
      <div className={`relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-slate-950 ring-1 ${item.unlocked ? 'ring-amber-400/40' : 'ring-slate-800'}`}>
        {icon && !iconFailed && (
          <img src={icon} alt="" loading="lazy" decoding="async" onError={() => setIconFailed(true)} className={`w-full h-full object-contain ${item.unlocked ? '' : 'grayscale opacity-50'}`} />
        )}
        {!item.unlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Lock className="w-4 h-4 text-slate-300" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className={`text-[13px] font-semibold truncate ${item.unlocked ? 'text-slate-100' : 'text-slate-300'}`}>{item.name}</h4>
          {item.unlocked ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 flex-shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              {formatDate(item.unlockedAt)}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 flex-shrink-0">Bloqueada</span>
          )}
        </div>

        <p className="text-xs text-slate-400 line-clamp-2 mt-0.5 leading-snug">{item.description || (item.custom ? 'Sem descrição.' : 'Conquista secreta.')}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
          {item.globalPercent !== undefined && <span>{String(item.globalPercent).replace('.', ',')}% dos jogadores têm</span>}
          {item.custom && <span>Criada por você</span>}
          {item.manual && !item.custom && <span>Marcada à mão</span>}
          {item.markable && (
            <button onClick={() => onMark(!item.unlocked)} disabled={busy} className={`flex items-center gap-1 rounded-sm text-indigo-300 hover:text-white disabled:opacity-50 ${focusRing}`}>
              {item.unlocked ? <Undo2 className="w-3 h-3" /> : <Check className="w-3 h-3" />} {item.unlocked ? 'Desmarcar' : 'Marcar como feita'}
            </button>
          )}
          {item.custom && (
            <button onClick={onRemove} disabled={busy} className={`flex items-center gap-1 rounded-sm hover:text-red-300 disabled:opacity-50 ${focusRing}`}>
              <Trash2 className="w-3 h-3" /> Apagar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const AchievementsPanel: React.FC<AchievementsPanelProps> = ({ game, onClose, onOpenSettings }) => {
  const [data, setData] = useState<GameAchievements | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const load = useCallback(
    async (force: boolean = false) => {
      if (force) setSyncing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = force ? await window.electronAPI?.syncAchievements(game.id) : await window.electronAPI?.getAchievements(game.id);
        setData(res ?? null);
      } catch (err) {
        setError(ipcErrorMessage(err));
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [game.id]
  );

  useEffect(() => {
    load(false);
    // Lista que o Lazulium achou depois de abrir esta janela
    return window.electronAPI?.onAchievementsUpdated((gameId) => {
      if (gameId === game.id) void load(false);
    });
  }, [load, game.id]);

  // Marcar, criar e trocar de lista devolvem a lista nova pronta
  const change = async (task: () => Promise<GameAchievements | null | undefined>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await task();
      if (next) setData(next);
      return true;
    } catch (err) {
      setError(ipcErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const created = await change(async () => window.electronAPI?.addCustomAchievement(game.id, newName, newDescription));
    if (created) {
      setNewName('');
      setNewDescription('');
      setCreating(false);
    }
  };

  const items = useMemo(() => data?.items ?? [], [data]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'unlocked' && !item.unlocked) return false;
      if (filter === 'locked' && item.unlocked) return false;
      return !query || item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query);
    });
  }, [items, filter, search]);

  const total = data?.total ?? items.length;
  const unlocked = data?.unlocked ?? items.filter((i) => i.unlocked).length;
  const counts: Record<FilterType, number> = { all: total, unlocked, locked: Math.max(0, total - unlocked) };
  const percentage = total > 0 ? Math.round((unlocked / total) * 100) : 0;
  const editable = !!data && data.source !== 'steam';
  // Lista achada pelo nome pode ser de outro jogo: dá para trocar pelos marcos, e voltar
  const fromCatalog = data?.source === 'retroachievements' && data.listLabel?.includes('·');
  const choseMilestones = data?.source === 'lazulium' && data.note?.startsWith('Você escolheu');

  // Avisos que se resolvem entrando na conta (sem conta, chave revogada)
  const needsAccount = /Contas|Configurações|Configure|inválid|revogad/i.test(`${data?.warning ?? ''} ${data?.note ?? ''}`);

  const subtitle = (
    <>
      {data ? achievementSourceLabel(data) : 'Carregando'}
      {data?.syncedAt && data.source !== 'lazulium' && (
        <span className="text-slate-500"> · atualizado às {new Date(data.syncedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      )}
    </>
  );

  return (
    <Modal
      title={`Conquistas · ${game.title}`}
      subtitle={subtitle}
      icon={<Trophy className="w-4 h-4 text-amber-400" />}
      size="2xl"
      tall
      onClose={onClose}
      bodyClassName="p-5"
      headerActions={
        <Button onClick={() => load(true)} disabled={syncing || loading} title="Buscar de novo na fonte">
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-amber-400' : ''}`} />
          Atualizar
        </Button>
      }
      toolbar={
        <>
          <div className="px-5 py-4 bg-slate-900/40">
            <div className="flex items-baseline justify-between text-xs mb-2">
              <span className="text-slate-300">
                <span className="text-xl font-semibold text-white tabular-nums">{unlocked}</span> de {total} conquistas
              </span>
              <span className="font-semibold text-amber-400 text-sm tabular-nums">{percentage}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-400 transition-[width] duration-500 rounded-full" style={{ width: `${percentage}%` }} />
            </div>
          </div>

          {(data?.warning || error) && (
            <div className={`mx-5 mt-3 ${warnBoxClass}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <span className="break-words">{error ?? data?.warning}</span>
            </div>
          )}

          {data?.note && (
            <div className={`mx-5 mt-3 items-center justify-between gap-3 ${infoBoxClass}`}>
              <div className="flex items-start gap-2 min-w-0">
                <Info className="w-4 h-4 flex-shrink-0 text-indigo-300" />
                <span className="break-words">{data.note}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {needsAccount && onOpenSettings && (
                  <Button onClick={onOpenSettings}>
                    <Settings className="w-3 h-3" /> Abrir Contas
                  </Button>
                )}
                {fromCatalog && (
                  <Button onClick={() => change(async () => window.electronAPI?.setAchievementList(game.id, true))} disabled={busy}>
                    Não é este jogo
                  </Button>
                )}
                {choseMilestones && (
                  <Button onClick={() => change(async () => window.electronAPI?.setAchievementList(game.id, false))} disabled={busy}>
                    Procurar lista de novo
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-1.5" role="group" aria-label="Filtrar conquistas">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={pillTabClass(filter === f.id)}>
                  {f.label} <span className="opacity-70 tabular-nums">{counts[f.id]}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conquista" aria-label="Buscar conquista" className={`${compactInputClass} pl-8`} />
              </div>
              {editable && (
                <Button onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
                  {creating ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} Criar conquista
                </Button>
              )}
            </div>
          </div>

          {creating && (
            <form onSubmit={createCustom} className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-slate-800/80 bg-slate-900/40 animate-fade-in">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={80}
                placeholder="Nome (ex: Derrotei o chefe final)"
                aria-label="Nome da conquista"
                className={`${compactInputClass} !w-auto flex-1 min-w-[200px]`}
              />
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={240}
                placeholder="Como se conquista (opcional)"
                aria-label="Descrição da conquista"
                className={`${compactInputClass} !w-auto flex-[2] min-w-[240px]`}
              />
              <Button type="submit" variant="primary" disabled={busy || !newName.trim()}>
                Criar
              </Button>
            </form>
          )}
        </>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" aria-busy="true">
          <span role="status" className="sr-only">
            Carregando conquistas
          </span>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg border border-slate-800/60">
              <Skeleton className="w-12 h-12 rounded-lg" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Nenhuma conquista para este jogo"
            description={editable ? 'Crie as suas com “Criar conquista” ou toque em Atualizar para procurar de novo.' : 'Toque em Atualizar para procurar de novo.'}
            actions={
              needsAccount && onOpenSettings ? (
                <Button variant="primary" size="md" onClick={onOpenSettings}>
                  <Settings className="w-3.5 h-3.5" /> Abrir Contas
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={FilterX}
            title="Nada com este filtro"
            compact
            actions={
              <Button
                onClick={() => {
                  setFilter('all');
                  setSearch('');
                }}
              >
                Mostrar todas
              </Button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredItems.map((item) => (
            <AchievementRow
              key={item.id}
              item={item}
              busy={busy}
              onMark={(value) => change(async () => window.electronAPI?.setManualAchievement(game.id, item.id, value))}
              onRemove={() => change(async () => window.electronAPI?.removeCustomAchievement(game.id, item.id))}
            />
          ))}
        </div>
      )}
    </Modal>
  );
};
