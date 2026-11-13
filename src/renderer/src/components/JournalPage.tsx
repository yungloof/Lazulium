import React, { useMemo, useState } from 'react';
import { Download, FileUp, LayoutGrid, List, NotebookPen, Pencil, Plus, Search, SearchX } from 'lucide-react';
import { Game, GameLog, isJournalEntry } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { PLATFORM_FULL } from '../utils/platform';
import { JournalEntryModal } from './JournalEntryModal';
import { JournalImportModal } from './JournalImportModal';
import { StarRating, Stars, StatusDot, StatusPill } from './GameLogFields';
import { Select, SelectOption } from './Select';
import { Button, EmptyState, Notice, focusRing, inputClass, segmentClass, segmentedClass } from './ui';
import { CoverCard, GameCover } from './journal/CoverCard';
import { PageHeader, StatStrip, emptyBox, pageClass } from './journal/PageLayout';
import { StatusChips, StatusFilter, countByStatus, matchesStatus } from './journal/StatusChips';
import { formatDay, formatHours, formatNumber } from './journal/format';

interface JournalPageProps {
  onOpenGame: (game: Game) => void;
  onEditPlaytime: (game: Game) => void;
}

type InstallFilter = 'all' | 'installed' | 'removed';
type SortKey = 'hours' | 'recent' | 'title' | 'rating';
type ViewMode = 'grid' | 'list';
type ReviewFilter = 'all' | 'review' | 'rating'; // Tudo, só com resenha escrita, só nota (sem resenha)

const hasReview = (game: Game): boolean => !!game.log?.review?.trim();

const VIEW_STORAGE_KEY = 'lazulium.journalView';

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

const JournalRow: React.FC<{
  game: Game;
  onOpen: () => void;
  onEditPlaytime: () => void;
  onSaveLog: (changes: Partial<GameLog>) => void;
}> = ({ game, onOpen, onEditPlaytime, onSaveLog }) => {
  const removed = game.isInstalled === false;
  const date = entryDate(game);
  return (
    <li className="group grid grid-cols-[56px_minmax(0,1fr)_auto_auto] items-center gap-4 px-3 py-3 pr-4 border-b border-slate-800/70 last:border-b-0 hover:bg-slate-800/30 transition-colors">
      <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden="true" className="w-14 aspect-[2/3] overflow-hidden rounded-sm bg-slate-800">
        <GameCover src={game.media?.coverUrl} title={game.title} gameId={game.id} compact />
      </button>
      <span className="min-w-0">
        <button type="button" onClick={onOpen} className={`block max-w-full text-left text-[15px] text-white truncate rounded-sm hover:text-indigo-200 ${focusRing}`} title={game.title}>
          {game.title}
        </button>
        <span className="block mt-0.5 text-xs text-slate-400 truncate">
          {game.manualPlatform ?? PLATFORM_FULL[game.platform]}
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
        <span className="block text-[15px] text-slate-100 tabular-nums">
          {game.platform === 'steam' ? (
            formatHours(game.totalPlaytimeSeconds, '—')
          ) : (
            <button type="button" onClick={onEditPlaytime} title="Ajustar tempo jogado" className={`inline-flex items-center gap-1 rounded-sm hover:text-white ${focusRing}`}>
              {formatHours(game.totalPlaytimeSeconds, '—')}
              <Pencil className="w-3 h-3 text-slate-500" />
            </button>
          )}
        </span>
        <span className="block mt-0.5 text-xs text-slate-400">{date ? formatDay(date) : 'sem data'}</span>
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
  const upsertGamesLocal = useLibraryStore((s) => s.upsertGamesLocal);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [installFilter, setInstallFilter] = useState<InstallFilter>('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [view, setView] = useState<ViewMode>(loadView);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Preferência só desta sessão
    }
  };

  const entries = useMemo(() => games.filter((g) => !g.isHidden && isJournalEntry(g)), [games]);
  const statusCounts = useMemo(() => countByStatus(entries), [entries]);
  const reviewCounts = useMemo(
    () => ({
      all: entries.length,
      review: entries.filter(hasReview).length,
      rating: entries.filter((g) => !!g.log?.rating && !hasReview(g)).length
    }),
    [entries]
  );
  const year = new Date().getFullYear();

  const stats = useMemo(() => {
    const finished = entries.filter((g) => g.log?.status === 'finished' || g.log?.status === 'completed');
    return [
      { label: 'Registrados', value: formatNumber(entries.length) },
      { label: 'Zerados', value: formatNumber(finished.length) },
      { label: `Zerados em ${year}`, value: formatNumber(finished.filter((g) => g.log?.finishedOn?.startsWith(String(year))).length), accent: true },
      { label: 'Quero jogar', value: formatNumber(statusCounts.backlog ?? 0) },
      { label: 'Horas jogadas', value: formatNumber(Math.round(entries.reduce((sum, g) => sum + (g.totalPlaytimeSeconds ?? 0), 0) / 3600)) }
    ];
  }, [entries, statusCounts, year]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((g) => {
        if (q && !g.title.toLowerCase().includes(q)) return false;
        if (!matchesStatus(g.log?.status, statusFilter)) return false;
        if (reviewFilter === 'review' && !hasReview(g)) return false;
        if (reviewFilter === 'rating' && (!g.log?.rating || hasReview(g))) return false;
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
  }, [entries, query, statusFilter, installFilter, reviewFilter, sort]);

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
      setFeedback({ tone: 'error', text: `Não foi possível salvar: ${ipcErrorMessage(err)}` });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      const path = await window.electronAPI?.exportJournal();
      if (path) setFeedback({ tone: 'success', text: `Diário exportado para ${path}` });
    } catch (err) {
      setFeedback({ tone: 'error', text: ipcErrorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setInstallFilter('all');
    setReviewFilter('all');
  };

  const addButton = (
    <Button variant="primary" size="md" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowAdd(true)}>
      Registrar jogo
    </Button>
  );

  return (
    <div className={pageClass}>
      <PageHeader
        title="Diário de jogos"
        subtitle="Tudo que você registrou. Fica aqui mesmo depois de desinstalar."
        actions={
          <>
            <Button icon={<FileUp className="w-3.5 h-3.5" />} onClick={() => setShowImport(true)}>
              Importar
            </Button>
            <Button icon={<Download className="w-3.5 h-3.5" />} loading={exporting} onClick={handleExport} disabled={entries.length === 0}>
              Exportar
            </Button>
            {addButton}
          </>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Seu diário começa aqui"
          description="Dê um status ou uma nota a qualquer jogo (na página dele, em “Meu registro”) e ele aparece aqui. Jogou no console ou há muito tempo? Registre à mão."
          actions={addButton}
          className={emptyBox}
        />
      ) : (
        <>
          <StatStrip stats={stats} className="py-5 rounded-xl bg-slate-900/40 border border-slate-800/80" />

          <Notice tone={feedback?.tone} className="break-all">
            {feedback?.text}
          </Notice>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no diário" aria-label="Buscar no diário" className={`${inputClass} pl-8 hover:border-slate-600`} />
              </div>
              <Select value={installFilter} options={INSTALL_OPTIONS} onChange={setInstallFilter} ariaLabel="Filtrar por instalação" />
              <Select value={sort} options={SORT_OPTIONS} onChange={setSort} ariaLabel="Ordenar" />
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-900 border border-slate-700/80" role="group" aria-label="Forma de ver">
                {[
                  { id: 'grid' as ViewMode, label: 'Capas', icon: <LayoutGrid className="w-4 h-4" /> },
                  { id: 'list' as ViewMode, label: 'Lista', icon: <List className="w-4 h-4" /> }
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => changeView(v.id)}
                    aria-pressed={view === v.id}
                    aria-label={v.label}
                    title={v.label}
                    className={`p-1.5 rounded-md transition-colors ${view === v.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'} ${focusRing}`}
                  >
                    {v.icon}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <StatusChips value={statusFilter} counts={statusCounts} onChange={setStatusFilter} />
              <div className={`${segmentedClass} ml-auto`} role="group" aria-label="Resenhas e notas">
                {(
                  [
                    { id: 'all', label: 'Tudo' },
                    { id: 'review', label: 'Com resenha' },
                    { id: 'rating', label: 'Só nota' }
                  ] as const
                ).map((option) => (
                  <button key={option.id} type="button" onClick={() => setReviewFilter(option.id)} aria-pressed={reviewFilter === option.id} className={segmentClass(reviewFilter === option.id)}>
                    {option.label} <span className="tabular-nums text-slate-500">{reviewCounts[option.id]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nada com esses filtros"
              description={query.trim() ? `Nenhum jogo do diário tem “${query.trim()}” no nome.` : 'Tente outro status, outra aba de resenhas ou mostre os não instalados.'}
              className={emptyBox}
              actions={
                <Button onClick={clearFilters} variant="secondary">
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            groups.map((group, groupIndex) => (
              <section key={group.label || 'todos'}>
                {group.label && (
                  <h2 className="flex items-center gap-3 mb-4 text-sm font-semibold text-slate-200">
                    {group.label}
                    <span className="text-xs font-normal text-slate-500">{group.games.length}</span>
                    <span className="flex-1 h-px bg-slate-800" />
                  </h2>
                )}
                {view === 'grid' ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-6">
                    {group.games.map((game, index) => (
                      <CoverCard
                        key={game.id}
                        navStart={groupIndex === 0 && index === 0}
                        title={game.title}
                        coverUrl={game.media?.coverUrl}
                        gameId={game.id}
                        onOpen={() => onOpenGame(game)}
                        meta={
                          <>
                            {game.log?.rating ? <Stars value={game.log.rating} /> : <StatusDot status={game.log?.status} />}
                            <span className="whitespace-nowrap tabular-nums">{formatHours(game.totalPlaytimeSeconds, '—')}</span>
                          </>
                        }
                        badge={
                          <>
                            {game.log?.rating && game.log.status ? (
                              <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/75">
                                <StatusDot status={game.log.status} />
                              </span>
                            ) : undefined}
                            {hasReview(game) && <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-semibold text-indigo-200">Resenha</span>}
                          </>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <ul className="rounded-xl bg-slate-900/40 border border-slate-800/80 overflow-hidden">
                    {group.games.map((game) => (
                      <JournalRow key={game.id} game={game} onOpen={() => onOpenGame(game)} onEditPlaytime={() => onEditPlaytime(game)} onSaveLog={(changes) => saveLog(game, changes)} />
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </>
      )}

      {showImport && (
        <JournalImportModal
          onClose={() => setShowImport(false)}
          onImported={(result) => {
            upsertGamesLocal(result.games);
            const parts = [result.updated > 0 && `${result.updated} atualizados`, result.created > 0 && `${result.created} novos`].filter(Boolean);
            setFeedback({ tone: 'success', text: `Importação concluída: ${parts.join(' e ')}.` });
          }}
        />
      )}

      {showAdd && (
        <JournalEntryModal
          onClose={() => setShowAdd(false)}
          onAdded={(game) => {
            upsertGameLocal(game);
            setFeedback({ tone: 'success', text: `${game.title} registrado no diário.` });
          }}
        />
      )}
    </div>
  );
};
