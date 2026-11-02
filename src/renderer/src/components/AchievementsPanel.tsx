import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Game } from '@shared/types/game';
import { Achievement, GameAchievements } from '@shared/types/achievements';
import {
  Trophy,
  X,
  RefreshCw,
  Search,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Settings,
  Gamepad2
} from 'lucide-react';

interface AchievementsPanelProps {
  game: Game;
  onClose: () => void;
  onOpenSettings?: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

type FilterType = 'all' | 'unlocked' | 'locked';

export const AchievementsPanel: React.FC<AchievementsPanelProps> = ({ game, onClose, onOpenSettings }) => {
  const [data, setData] = useState<GameAchievements | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async (force: boolean = false) => {
    if (force) setSyncing(true);
    else setLoading(true);

    try {
      const res = force
        ? await window.electronAPI?.syncAchievements(game.id)
        : await window.electronAPI?.getAchievements(game.id);
      setData(res ?? null);
    } catch (err) {
      console.error('Failed to load achievements:', err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [game.id]);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = useMemo(() => data?.items ?? [], [data]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'unlocked' && !item.unlocked) return false;
      if (filter === 'locked' && item.unlocked) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        return (
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [items, filter, search]);

  const total = data?.total ?? items.length;
  const unlocked = data?.unlocked ?? items.filter((i) => i.unlocked).length;
  const locked = Math.max(0, total - unlocked);
  const percentage = total > 0 ? Math.round((unlocked / total) * 100) : 0;

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };

  // Avisos que se resolvem entrando na conta (sem conta, chave revogada)
  const isCredentialsWarning = /Contas|Configurações|Configure|inválid|revogad/i.test(data?.warning ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="w-full max-w-4xl h-[85vh] flex flex-col rounded-lg bg-steam-bg border border-slate-800 shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3 truncate pr-4">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="truncate">
              <h2 className="text-sm font-bold text-slate-100 truncate">
                Conquistas · {game.title}
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                {game.platform === 'steam' ? (
                  <span>Steam Web API</span>
                ) : game.platform === 'emulator' ? (
                  <span className="flex items-center gap-1">
                    <Gamepad2 className="w-3 h-3 text-emerald-400" /> RetroAchievements
                  </span>
                ) : (
                  <span>Jogo Standalone / Custom</span>
                )}
                {data?.syncedAt && (
                  <span className="text-slate-500 text-[11px]">
                    · Atualizado em {new Date(data.syncedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => load(true)}
              disabled={syncing || loading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 disabled:opacity-50 transition-colors ${focusRing}`}
              title="Sincronizar com a API agora"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}
              title="Fechar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de Progresso & Estatísticas */}
        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/40 flex-shrink-0">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300">
              Progresso Geral: <span className="text-amber-400">{unlocked}</span> de <span className="text-slate-200">{total}</span> conquistas
            </span>
            <span className="font-bold text-amber-400 text-sm">{percentage}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-emerald-400 to-indigo-500 transition-all duration-500 rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Warning Banner (se houver aviso ou erro leve) */}
        {data?.warning && (
          <div className="mx-6 mt-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex-shrink-0">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <span className="break-words">{data.warning}</span>
            </div>
            {isCredentialsWarning && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold text-[11px] flex-shrink-0 ${focusRing}`}
              >
                <Settings className="w-3 h-3" /> Abrir Contas
              </button>
            )}
          </div>
        )}

        {/* Filtros e Busca */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-slate-800/80 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${focusRing} ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Todas <span className="ml-1 opacity-70">({total})</span>
            </button>
            <button
              onClick={() => setFilter('unlocked')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${focusRing} ${
                filter === 'unlocked'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Desbloqueadas <span className="ml-1 opacity-70">({unlocked})</span>
            </button>
            <button
              onClick={() => setFilter('locked')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${focusRing} ${
                filter === 'locked'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Bloqueadas <span className="ml-1 opacity-70">({locked})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conquista..."
              className={`w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 ${focusRing}`}
            />
          </div>
        </div>

        {/* Lista de Conquistas (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              <span>Carregando conquistas...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-12">
              <Trophy className="w-10 h-10 text-slate-700" />
              <p className="text-xs text-slate-400 max-w-sm">
                {items.length === 0
                  ? 'Nenhuma conquista encontrada para este jogo.'
                  : 'Nenhuma conquista corresponde ao filtro atual.'}
              </p>
              {items.length === 0 && isCredentialsWarning && onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white ${focusRing}`}
                >
                  <Settings className="w-3.5 h-3.5" /> Abrir Contas
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredItems.map((item) => {
                const icon = item.unlocked
                  ? item.iconUrl
                  : item.iconLockedUrl || item.iconUrl;

                return (
                  <div
                    key={item.id}
                    tabIndex={0}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${focusRing} ${
                      item.unlocked
                        ? 'bg-slate-900/60 border-slate-800 hover:border-amber-500/40 hover:bg-slate-900'
                        : 'bg-slate-950/40 border-slate-800/50 hover:border-slate-700 opacity-75'
                    }`}
                  >
                    {/* Badge Icon */}
                    <div className="relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                      <img
                        src={icon}
                        alt=""
                        loading="lazy"
                        className={`w-full h-full object-contain ${
                          item.unlocked ? '' : 'grayscale opacity-50'
                        }`}
                        onError={(e) => {
                          // Fallback para ícone bloqueado ou ocultar imagem quebrada
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      {!item.unlocked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Lock className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4
                          className={`text-xs font-bold truncate ${
                            item.unlocked ? 'text-slate-100' : 'text-slate-400'
                          }`}
                        >
                          {item.name}
                        </h4>
                        {item.unlocked ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 flex-shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            {formatDate(item.unlockedAt)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600 flex-shrink-0">Bloqueada</span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                        {item.description || 'Conquista secreta.'}
                      </p>

                      {item.globalPercent !== undefined && (
                        <div className="mt-1 text-[10px] text-slate-500">
                          {item.globalPercent}% dos jogadores desbloquearam
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
