import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, Gamepad2, LayoutGrid, List, Loader2, Pencil, Plus, Search, AlertTriangle } from 'lucide-react';
import { Game, GameLog, GameLogStatus, isJournalEntry } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { JournalEntryModal } from './JournalEntryModal';
import { LOG_STATUS, StarRating, Stars, StatusPill } from './GameLogFields';
import { Select, SelectOption } from './Select';

interface JournalPageProps {
  onOpenGame: (game: Game) => void;
  onEditPlaytime: (game: Game) => void;
}

type StatusFilter = 'all' | 'none' | GameLogStatus;
type InstallFilter = 'all' | 'installed' | 'removed';
type SortKey = 'hours' | 'recent' | 'title' | 'rating';
type ViewMode = 'grid' | 'list';

const VIEW_STORAGE_KEY = 'lazulium.journalView';
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const INSTALL_OPTIONS: SelectOption<InstallFilter>[] = [
  { value: 'all', label: 'Instalados e não instalados' },
  { value: 'installed', label: 'Só instalados' },
  { value: 'removed', label: 'Só não instalados' }
];

const SORT_OPTIONS: SelectOption<SortKey>[] = [
  { value: 'recent', label: 'Por data' },
  { value: 'hours', label: 'Mais jogados' },
  { value: 'rating', label: 'Melhor nota' },
  { value: 'title', label: 'Nome' }
];

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

// A data que conta no diário: quando terminou, quando começou ou quando jogou por último
const entryDate = (game: Game) => game.log?.finishedOn ?? game.log?.startedOn ?? game.lastPlayedAt?.slice(0, 10) ?? '';

function monthLabel(date: string): string {
  if (!date) return 'Sem data';
  const label = new Date(`${date.slice(0, 7)}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function loadView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

const Cover: React.FC<{ game: Game; iconSize?: string }> = ({ game, iconSize = 'w-5 h-5' }) => {
  const [failed, setFailed] = useState<string | null>(null);
  const cover = game.media?.coverUrl;
  return cover && failed !== cover ? (
    <img
      src={cover}
      alt=""
      loading="lazy"
      onError={() => {
        setFailed(cover);
        window.electronAPI?.reportBrokenArtwork(game.id, 'cover');
      }}
      className="w-full h-full object-contain"
    />
  ) : (
    <span className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center bg-gradient-to-b from-slate-800 to-slate-950">
      <Gamepad2 className={`${iconSize} text-slate-600`} />
    </span>
  );
};

const JournalCard: React.FC<{ game: Game; onOpen: () => void }> = ({ game, onOpen }) => {
  const status = LOG_STATUS.find((s) => s.id === game.log?.status);
  return (
    <button onClick={onOpen} title={game.title} className={`group min-w-0 text-left rounded-sm ${focusRing}`}>
      <span className="block aspect-[2/3] overflow-hidden bg-slate-900 border border-slate-800 group-hover:border-slate-500 transition-colors">
        <Cover game={game} iconSize="w-7 h-7" />
      </span>
      <span className="block mt-2 text-[13px] text-slate-100 truncate">{game.title}</span>
      <span className="mt-1 flex items-center justify-between gap-2 min-h-4">
        {game.log?.rating ? <Stars value={game.log.rating} /> : <span className="text-[11px] text-slate-600">Sem nota</span>}
        <span className="text-[11px] text-slate-500 whitespace-nowrap">{formatHours(game.totalPlaytimeSeconds)}</span>
      </span>
      {status && (
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
        </span>
      )}
    </button>
  );
};

const JournalRow: React.FC<{
  game: Game;
  onOpen: () => void;
  onEditPlaytime: () => void;
  onSaveLog: (changes: Partial<GameLog>) => void;
}> = ({ game, onOpen, onEditPlaytime, onSaveLog }) => {
  const removed = game.isInstalled === false;
  return (
    <li
      onClick={onOpen}
      className="grid grid-cols-[64px_minmax(0,1fr)_auto_auto] items-center gap-4 p-3 pr-4 border-b border-slate-800/80 last:border-b-0 hover:bg-slate-800/40 transition-colors cursor-pointer"
    >
      <span className="w-16 aspect-[2/3] overflow-hidden bg-slate-800">
        <Cover game={game} />
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
          <span className="block mt-1.5 text-[13px] leading-snug text-slate-300 line-clamp-2" title={game.log.review}>
            {game.log.review}
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
        <span className="block mt-0.5 text-xs text-slate-400">{entryDate(game) ? new Date(`${entryDate(game)}T12:00:00`).toLocaleDateString('pt-BR') : 'sem data'}</span>
      </span>
      <span className="w-[132px] flex flex-col items-end gap-1.5">
        <StatusPill value={game.log?.status} onChange={(status) => onSaveLog({ status })} />
        <StarRating value={game.log?.rating} onChange={(rating) => onSaveLog({ rating })} size="w-3.5 h-3.5" />
      </span>
    </li>
  );
};

// O registro permanente: o que você registrou continua aqui, instalado ou não
export const JournalPage: React.FC<JournalPageProps> = ({ onOpenGame, onEditPlaytime }) => {
  const games = useLibraryStore((s) => s.games);
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [installFilter, setInstallFilter] = useState<InstallFilter>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [view, setView] = useState<ViewMode>(loadView);
  const [showAdd, setShowAdd] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Preferência só desta sessão
    }
  };

  const entries = useMemo(() => games.filter((g) => !g.isHidden && isJournalEntry(g)), [games]);
  const year = new Date().getFullYear();

  const stats = useMemo(() => {
    const finished = entries.filter((g) => g.log?.status === 'finished' || g.log?.status === 'completed');
    return [
      { label: 'Jogos registrados', value: entries.length },
      { label: 'Zerados', value: finished.length },
      { label: `Zerados em ${year}`, value: finished.filter((g) => g.log?.finishedOn?.startsWith(String(year))).length },
      { label: 'Quero jogar', value: entries.filter((g) => g.log?.status === 'backlog').length },
      { label: 'Horas jogadas', value: Math.round(entries.reduce((sum, g) => sum + (g.totalPlaytimeSeconds ?? 0), 0) / 3600) }
    ];
  }, [entries, year]);

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
        if (sort === 'recent') return entryDate(b).localeCompare(entryDate(a));
        if (sort === 'title') return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
        if (sort === 'rating') return (b.log?.rating ?? 0) - (a.log?.rating ?? 0);
        return (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0);
      });
  }, [entries, query, statusFilter, installFilter, sort]);

  // Por data vira um diário de verdade: separado por mês
  const groups = useMemo(() => {
    if (sort !== 'recent') return [{ label: '', games: visible }];
    const byMonth = new Map<string, Game[]>();
    for (const game of visible) {
      const label = monthLabel(entryDate(game));
      byMonth.set(label, [...(byMonth.get(label) ?? []), game]);
    }
    return [...byMonth].map(([label, list]) => ({ label, games: list }));
  }, [visible, sort]);

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
    <div className="max-w-6xl mx-auto px-8 py-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-white">Diário de jogos</h1>
          <p className="mt-1 text-sm text-slate-400">Os jogos que você registrou. Continuam aqui mesmo depois de desinstalar.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}>
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Exportar
          </button>
          <button onClick={() => setShowAdd(true)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white ${focusRing}`}>
            <Plus className="w-3.5 h-3.5" /> Registrar jogo
          </button>
        </div>
      </header>

      <dl className="grid grid-cols-2 md:grid-cols-5 gap-y-4 py-4 border-y border-slate-800">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <dd className="text-4xl font-light text-white tabular-nums">{s.value.toLocaleString('pt-BR')}</dd>
            <dt className="mt-1 text-xs text-slate-400">{s.label}</dt>
          </div>
        ))}
      </dl>

      {feedback && (
        <p className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs break-all ${feedback.tone === 'ok' ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/60 border-amber-500/30 text-amber-300'}`}>
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
        <Select value={installFilter} options={INSTALL_OPTIONS} onChange={setInstallFilter} ariaLabel="Filtrar por instalação" />
        <Select value={sort} options={SORT_OPTIONS} onChange={setSort} ariaLabel="Ordenar" />
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-900 border border-slate-700/80" role="group" aria-label="Forma de ver">
          {[
            { id: 'grid' as ViewMode, label: 'Capas', icon: <LayoutGrid className="w-4 h-4" /> },
            { id: 'list' as ViewMode, label: 'Lista', icon: <List className="w-4 h-4" /> }
          ].map((v) => (
            <button key={v.id} onClick={() => changeView(v.id)} aria-pressed={view === v.id} aria-label={v.label} title={v.label} className={`p-1.5 rounded-md transition-colors ${view === v.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'} ${focusRing}`}>
              {v.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
        {[{ id: 'all' as StatusFilter, label: 'Todos', dot: '' }, ...LOG_STATUS.map((s) => ({ id: s.id as StatusFilter, label: s.label, dot: s.dot })), ...(statusCounts.none ? [{ id: 'none' as StatusFilter, label: 'Sem status', dot: '' }] : [])].map((f) => (
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
        <div className="py-14 flex flex-col items-center gap-3 text-center rounded-lg bg-slate-900/50">
          <p className="max-w-md text-sm text-slate-400">{entries.length === 0 ? 'Nada registrado ainda. Dê uma nota ou um status a um jogo e ele aparece aqui.' : 'Nenhum jogo com esses filtros.'}</p>
          {entries.length === 0 && (
            <button onClick={() => setShowAdd(true)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white ${focusRing}`}>
              <Plus className="w-3.5 h-3.5" /> Registrar jogo
            </button>
          )}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label || 'todos'}>
            {group.label && <h2 className="mb-3 text-sm font-semibold text-slate-300">{group.label}</h2>}
            {view === 'grid' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-5">
                {group.games.map((game) => (
                  <JournalCard key={game.id} game={game} onOpen={() => onOpenGame(game)} />
                ))}
              </div>
            ) : (
              <ul className="rounded-lg bg-slate-900/50 border border-slate-800 overflow-hidden">
                {group.games.map((game) => (
                  <JournalRow key={game.id} game={game} onOpen={() => onOpenGame(game)} onEditPlaytime={() => onEditPlaytime(game)} onSaveLog={(changes) => saveLog(game, changes)} />
                ))}
              </ul>
            )}
          </section>
        ))
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
