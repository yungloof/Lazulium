import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, Gamepad2, Loader2, Pencil, Plus, Search, AlertTriangle } from 'lucide-react';
import { Game, GameLog, GameLogStatus } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { JournalEntryModal } from './JournalEntryModal';
import { LOG_STATUS, StarRating, StatusSelect } from './GameLogFields';

interface JournalPageProps {
  onOpenGame: (game: Game) => void;
  onEditPlaytime: (game: Game) => void;
}

type StatusFilter = 'all' | 'none' | GameLogStatus;
type InstallFilter = 'all' | 'installed' | 'removed';
type SortKey = 'hours' | 'recent' | 'title' | 'rating';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const selectClass = `px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-sm text-slate-200 ${focusRing}`;

const PLATFORM_LABEL: Record<Game['platform'], string> = {
  steam: 'Steam',
  epic: 'Epic',
  gog: 'GOG',
  riot: 'Riot',
  xbox: 'Xbox',
  emulator: 'Emulador',
  standalone: 'PC'
};

const formatHours = (seconds = 0) => {
  if (seconds < 60) return '—';
  const h = seconds / 3600;
  return h < 1 ? `${Math.round(seconds / 60)} min` : `${h.toFixed(1).replace('.', ',')} h`;
};

const JournalRow: React.FC<{
  game: Game;
  onOpen: () => void;
  onEditPlaytime: () => void;
  onSaveLog: (changes: Partial<GameLog>) => void;
}> = ({ game, onOpen, onEditPlaytime, onSaveLog }) => {
  const [coverFailed, setCoverFailed] = useState<string | null>(null);
  const cover = game.media?.coverUrl;
  const removed = game.isInstalled === false;
  return (
    <li
      onClick={onOpen}
      className="grid grid-cols-[44px_minmax(0,1fr)_84px_84px_128px_112px] items-center gap-3 px-3 py-1.5 border-b border-black/20 hover:bg-slate-800/50 cursor-pointer"
    >
      <span className="w-[44px] h-[62px] rounded-sm overflow-hidden bg-slate-800 flex items-center justify-center">
        {cover && coverFailed !== cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            onError={() => {
              setCoverFailed(cover);
              window.electronAPI?.reportBrokenArtwork(game.id, 'cover');
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <Gamepad2 className="w-4 h-4 text-slate-600" />
        )}
      </span>
      <span className="min-w-0">
        <button onClick={onOpen} className={`block max-w-full text-left text-sm text-slate-100 truncate rounded-sm ${focusRing}`} title={game.title}>
          {game.title}
        </button>
        <span className="block text-[11px] text-slate-500 truncate">
          {game.manualPlatform ?? PLATFORM_LABEL[game.platform]}
          {game.id.startsWith('steam-shortcut-') && ' · atalho da Steam'}
          {removed && !game.manualEntry && <span className="text-slate-500"> · não instalado</span>}
        </span>
      </span>
      <span className="text-right text-xs text-slate-200">
        {game.platform === 'steam' ? (
          formatHours(game.totalPlaytimeSeconds)
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditPlaytime();
            }}
            title="Ajustar tempo jogado"
            className={`inline-flex items-center gap-1 rounded-sm hover:text-white ${focusRing}`}
          >
            {formatHours(game.totalPlaytimeSeconds)}
            <Pencil className="w-3 h-3 text-slate-500" />
          </button>
        )}
      </span>
      <span className="text-right text-xs text-slate-400">
        {game.lastPlayedAt ? new Date(game.lastPlayedAt).toLocaleDateString('pt-BR') : '—'}
      </span>
      <StatusSelect value={game.log?.status} onChange={(status) => onSaveLog({ status })} className="w-full" />
      <StarRating value={game.log?.rating} onChange={(rating) => onSaveLog({ rating })} size="w-3.5 h-3.5" />
    </li>
  );
};

// O registro permanente: todo jogo que já passou por aqui, instalado ou não
export const JournalPage: React.FC<JournalPageProps> = ({ onOpenGame, onEditPlaytime }) => {
  const games = useLibraryStore((s) => s.games);
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [installFilter, setInstallFilter] = useState<InstallFilter>('all');
  const [sort, setSort] = useState<SortKey>('hours');
  const [showAdd, setShowAdd] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  // Só entra quem tem história: horas, sessão, registro ou favorito (e nunca itens ocultos)
  const entries = useMemo(
    () => games.filter((g) => !g.isHidden && ((g.totalPlaytimeSeconds ?? 0) > 0 || g.lastPlayedAt || g.log?.status || g.log?.rating || g.log?.notes || g.manualEntry || g.isFavorite)),
    [games]
  );

  const stats = useMemo(
    () => ({
      games: entries.length,
      seconds: entries.reduce((sum, g) => sum + (g.totalPlaytimeSeconds ?? 0), 0),
      finished: entries.filter((g) => g.log?.status === 'finished' || g.log?.status === 'completed').length,
      removed: entries.filter((g) => g.isInstalled === false && !g.manualEntry).length
    }),
    [entries]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((g) => {
        if (q && !g.title.toLowerCase().includes(q)) return false;
        if (statusFilter === 'none' ? g.log?.status : statusFilter !== 'all' && g.log?.status !== statusFilter) return false;
        if (installFilter === 'installed' && g.isInstalled === false) return false;
        if (installFilter === 'removed' && g.isInstalled !== false) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === 'recent') return (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '');
        if (sort === 'title') return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
        if (sort === 'rating') return (b.log?.rating ?? 0) - (a.log?.rating ?? 0);
        return (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0);
      });
  }, [entries, query, statusFilter, installFilter, sort]);

  const saveLog = async (game: Game, changes: Partial<GameLog>) => {
    try {
      const updated = await window.electronAPI?.setGameLog(game.id, { ...game.log, ...changes });
      if (updated) upsertGameLocal(updated);
    } catch (err) {
      setFeedback({ tone: 'warn', text: `Não foi possível salvar: ${ipcErrorMessage(err)}` });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      const path = await window.electronAPI?.exportJournal();
      if (path) setFeedback({ tone: 'ok', text: `Diário exportado para ${path}` });
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-white">Diário de jogos</h1>
          <p className="mt-1 text-sm text-slate-400">
            {formatHours(stats.seconds)} em {stats.games} jogos · {stats.finished} zerados · {stats.removed} não instalados, com o histórico guardado
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}>
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Exportar
          </button>
          <button onClick={() => setShowAdd(true)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-sm bg-indigo-600 hover:bg-indigo-500 text-white ${focusRing}`}>
            <Plus className="w-3.5 h-3.5" /> Registrar jogo
          </button>
        </div>
      </header>

      {feedback && (
        <p className={`flex items-start gap-2 px-3 py-2 rounded-sm border text-xs break-all ${feedback.tone === 'ok' ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/60 border-amber-500/30 text-amber-300'}`}>
          {feedback.tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
          {feedback.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no diário"
            className={`w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-sm text-slate-200 placeholder-slate-500 ${focusRing}`}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} aria-label="Filtrar por status" className={selectClass}>
          <option value="all">Todos os status</option>
          <option value="none">Sem status</option>
          {LOG_STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={installFilter} onChange={(e) => setInstallFilter(e.target.value as InstallFilter)} aria-label="Filtrar por instalação" className={selectClass}>
          <option value="all">Instalados e não instalados</option>
          <option value="installed">Só instalados</option>
          <option value="removed">Só não instalados</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar" className={selectClass}>
          <option value="hours">Mais jogados</option>
          <option value="recent">Jogados por último</option>
          <option value="rating">Melhor nota</option>
          <option value="title">Nome</option>
        </select>
      </div>

      <div className="bg-steam-panel/80 border border-black/30 rounded-sm">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_84px_84px_128px_112px] gap-3 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-black/30">
          <span />
          <span>Jogo</span>
          <span className="text-right">Tempo</span>
          <span className="text-right">Última vez</span>
          <span>Status</span>
          <span>Nota</span>
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-slate-500">Nenhum jogo com esses filtros.</p>
        ) : (
          <ul>
            {visible.map((game) => (
              <JournalRow
                key={game.id}
                game={game}
                onOpen={() => onOpenGame(game)}
                onEditPlaytime={() => onEditPlaytime(game)}
                onSaveLog={(changes) => saveLog(game, changes)}
              />
            ))}
          </ul>
        )}
      </div>

      {showAdd && (
        <JournalEntryModal
          onClose={() => setShowAdd(false)}
          onAdded={(game) => {
            upsertGameLocal(game);
            setFeedback({ tone: 'ok', text: `${game.title} registrado no diário.` });
          }}
        />
      )}
    </div>
  );
};
