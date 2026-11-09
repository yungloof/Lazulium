import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Game } from '@shared/types/game';
import { Achievement, GameAchievements, achievementSourceLabel } from '@shared/types/achievements';
import { Trophy, X, RefreshCw, Search, CheckCircle2, Lock, AlertTriangle, Settings, Info, Plus, Check, Trash2, Undo2 } from 'lucide-react';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface AchievementsPanelProps {
  game: Game;
  onClose: () => void;
  onOpenSettings?: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const smallButton = `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 disabled:opacity-50 transition-colors ${focusRing}`;

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
        item.unlocked ? 'bg-slate-900/60 border-slate-800 hover:border-slate-600' : 'bg-slate-950/40 border-slate-800/50 hover:border-slate-700'
      }`}
    >
      <div className="relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
        {icon && !iconFailed && <img src={icon} alt="" loading="lazy" onError={() => setIconFailed(true)} className={`w-full h-full object-contain ${item.unlocked ? '' : 'grayscale opacity-50'}`} />}
        {!item.unlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Lock className="w-4 h-4 text-slate-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className={`text-[13px] font-semibold truncate ${item.unlocked ? 'text-slate-100' : 'text-slate-400'}`}>{item.name}</h4>
          {item.unlocked ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 flex-shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              {formatDate(item.unlockedAt)}
            </span>
          ) : (
            <span className="text-[11px] text-slate-600 flex-shrink-0">Bloqueada</span>
          )}
        </div>

        <p className="text-xs text-slate-400 line-clamp-2 mt-0.5 leading-snug">{item.description || (item.custom ? 'Sem descrição.' : 'Conquista secreta.')}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="w-full max-w-4xl h-[85vh] flex flex-col rounded-lg bg-steam-bg border border-slate-800 shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-100 truncate">Conquistas · {game.title}</h2>
              <p className="text-xs text-slate-400 truncate">
                {data ? achievementSourceLabel(data) : 'Carregando'}
                {data?.syncedAt && data.source !== 'lazulium' && (
                  <span className="text-slate-500"> · atualizado às {new Date(data.syncedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => load(true)} disabled={syncing || loading} className={smallButton} title="Buscar de novo na fonte">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-amber-400' : ''}`} />
              Atualizar
            </button>
            <button onClick={onClose} aria-label="Fechar" title="Fechar (Esc)" className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/40 flex-shrink-0">
          <div className="flex items-baseline justify-between text-xs mb-2">
            <span className="text-slate-300">
              <span className="text-lg font-semibold text-white">{unlocked}</span> de {total} conquistas
            </span>
            <span className="font-semibold text-amber-400 text-sm">{percentage}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-amber-400 transition-all duration-500 rounded-full" style={{ width: `${percentage}%` }} />
          </div>
        </div>

        {(data?.warning || error) && (
          <div className="mx-6 mt-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex-shrink-0">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <span className="break-words">{error ?? data?.warning}</span>
            </div>
          </div>
        )}

        {data?.note && (
          <div className="mx-6 mt-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-300 flex-shrink-0">
            <div className="flex items-start gap-2 min-w-0">
              <Info className="w-4 h-4 flex-shrink-0 text-indigo-300" />
              <span className="break-words">{data.note}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {needsAccount && onOpenSettings && (
                <button onClick={onOpenSettings} className={smallButton}>
                  <Settings className="w-3 h-3" /> Abrir Contas
                </button>
              )}
              {fromCatalog && (
                <button onClick={() => change(async () => window.electronAPI?.setAchievementList(game.id, true))} disabled={busy} className={smallButton}>
                  Não é este jogo
                </button>
              )}
              {choseMilestones && (
                <button onClick={() => change(async () => window.electronAPI?.setAchievementList(game.id, false))} disabled={busy} className={smallButton}>
                  Procurar lista de novo
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-slate-800/80 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${focusRing} ${filter === f.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}
              >
                {f.label} <span className="ml-1 opacity-70">({counts[f.id]})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar conquista"
                className={`w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 ${focusRing}`}
              />
            </div>
            {editable && (
              <button onClick={() => setCreating((c) => !c)} className={smallButton}>
                {creating ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} Criar conquista
              </button>
            )}
          </div>
        </div>

        {creating && (
          <form onSubmit={createCustom} className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-800/80 bg-slate-900/40 flex-shrink-0">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={80}
              placeholder="Nome (ex: Derrotei o chefe final)"
              aria-label="Nome da conquista"
              className={`flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-slate-950/60 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-600 ${focusRing}`}
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              maxLength={240}
              placeholder="Como se conquista (opcional)"
              aria-label="Descrição da conquista"
              className={`flex-[2] min-w-[240px] px-3 py-1.5 text-xs bg-slate-950/60 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-600 ${focusRing}`}
            />
            <button type="submit" disabled={busy || !newName.trim()} className={`px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
              Criar
            </button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              <span>Carregando conquistas...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-12">
              <Trophy className="w-10 h-10 text-slate-700" />
              <p className="text-xs text-slate-400 max-w-sm">{items.length === 0 ? 'Nenhuma conquista encontrada para este jogo.' : 'Nenhuma conquista corresponde ao filtro atual.'}</p>
              {items.length === 0 && needsAccount && onOpenSettings && (
                <button onClick={onOpenSettings} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white ${focusRing}`}>
                  <Settings className="w-3.5 h-3.5" /> Abrir Contas
                </button>
              )}
            </div>
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
        </div>
      </div>
    </div>
  );
};
