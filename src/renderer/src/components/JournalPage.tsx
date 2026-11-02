import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, Gamepad2, Loader2, Pencil, Plus, Search, AlertTriangle } from 'lucide-react';
import { Game, GameLog, GameLogStatus } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { JournalEntryModal } from './JournalEntryModal';
import { LOG_STATUS, StarRating, StatusPill } from './GameLogFields';

interface JournalPageProps {
  onOpenGame: (game: Game) => void;
  onEditPlaytime: (game: Game) => void;
}

type StatusFilter = 'all' | 'none' | GameLogStatus;
type InstallFilter = 'all' | 'installed' | 'removed';
type SortKey = 'hours' | 'recent' | 'title' | 'rating';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const selectClass = `px-3 py-2 text-[13px] bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 hover:border-slate-600 ${focusRing}`;

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
      className="grid grid-cols-[56px_minmax(0,1fr)_auto_auto] items-center gap-4 p-2.5 pr-4 rounded-lg bg-slate-900/50 border border-transparent hover:border-slate-700/80 hover:bg-slate-800/60 transition-colors cursor-pointer"
    >
      <span className="w-14 h-20 rounded-md overflow-hidden bg-slate-800 flex items-center justify-center">
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
          <Gamepad2 className="w-5 h-5 text-slate-600" />
        )}
      </span>
      <span className="min-w-0">
        <button onClick={onOpen} className={`block max-w-full text-left text-[15px] text-white truncate rounded-sm ${focusRing}`} title={game.title}>
          {game.title}
        </button>
        <span className="block mt-0.5 text-xs text-slate-400 truncate">
          {game.manualPlatform ?? PLATFORM_LABEL[game.platform]}
          {game.id.startsWith('steam-shortcut-') && ' · atalho da Steam'}
          {game.familyShared && ' · Família Steam'}
          {removed && !game.manualEntry && ' · não instalado'}
        </span>
        {game.log?.review && (
          <span className="block mt-1 text-[13px] text-slate-300 line-clamp-2" title={game.log.review}>
            “{game.log.review}”
          </span>
        )}
      </span>
      <span className="text-right whitespace-nowrap">
        <span className="block text-[15px] text-slate-100">
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
        <span className="block mt-0.5 text-xs text-slate-400">{game.lastPlayedAt ? new Date(game.lastPlayedAt).toLocaleDateString('pt-BR') : 'sem data'}</span>
      </span>
      <span className="w-[132px] flex flex-col items-end gap-1.5">
        <StatusPill value={game.log?.status} onChange={(status) => onSaveLog({ status })} />
        <StarRating value={game.log?.rating} onChange={(rating) => onSaveLog({ rating })} size="w-3.5 h-3.5" />
      </span>
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
    () => games.filter((g) => !g.isHidden && ((g.totalPlaytimeSeconds ?? 0) > 0 || g.lastPlayedAt || g.log?.status || g.log?.rating || g.log?.review || g.log?.notes || g.manualEntry || g.isFavorite)),
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

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<StatusFilter, number>> = { all: entries.length, none: 0 };
    for (const g of entries) {
      const key: StatusFilter = g.log?.status ?? 'none';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

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
          <p className="mt-1 text-sm text-slate-400">Tudo que você já jogou, mesmo depois de desinstalar.</p>
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

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Horas jogadas', value: Math.round(stats.seconds / 3600).toLocaleString('pt-BR') },
          { label: 'Jogos no Diário', value: stats.games.toLocaleString('pt-BR') },
          { label: 'Zerados', value: stats.finished.toLocaleString('pt-BR') },
          { label: 'Não instalados', value: stats.removed.toLocaleString('pt-BR') }
        ].map((s) => (
          <div key={s.label} className="px-4 py-3 rounded-lg bg-slate-900/50">
            <dd className="text-2xl font-light text-white">{s.value}</dd>
            <dt className="mt-0.5 text-xs text-slate-400">{s.label}</dt>
          </div>
        ))}
      </dl>

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
            className={`w-full pl-8 pr-3 py-2 text-[13px] bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 placeholder-slate-500 hover:border-slate-600 ${focusRing}`}
          />
        </div>
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

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
        {[{ id: 'all' as StatusFilter, label: 'Todos', dot: '' }, ...LOG_STATUS.map((s) => ({ id: s.id as StatusFilter, label: s.label, dot: s.dot })), { id: 'none' as StatusFilter, label: 'Sem status', dot: '' }].map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            aria-pressed={statusFilter === f.id}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[13px] transition-colors ${statusFilter === f.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'} ${focusRing}`}
          >
            {f.dot && <span className={`w-2 h-2 rounded-full ${f.dot}`} />}
            {f.label}
            <span className={statusFilter === f.id ? 'text-indigo-100' : 'text-slate-500'}>{statusCounts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-slate-400 rounded-lg bg-slate-900/50">Nenhum jogo com esses filtros.</p>
      ) : (
        <ul className="space-y-2">
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
