import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ListOrdered, NotebookPen, RefreshCw } from 'lucide-react';
import { isJournalEntry } from '@shared/types/game';
import { PlayerProfile, ProfileWebStatus } from '@shared/types/profile';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useListsStore } from '../stores/useListsStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, EmptyState, LoadingLabel, Notice, Skeleton, focusRing } from './ui';
import { YearReviewModal } from './YearReviewModal';
import { ALL_SECTIONS, ProfileEditModal } from './ProfileEditModal';
import { ProfilePublishModal } from './ProfilePublishModal';
import { ProfileSteamNotice } from './ProfileSteamNotice';
import { Stars } from './GameLogFields';
import { ListCard } from './ListsPage';
import { CoverCard } from './journal/CoverCard';
import { emptyBox } from './journal/PageLayout';
import { StatusChips, StatusFilter, countByStatus, matchesStatus } from './journal/StatusChips';
import { formatHours, formatNumber } from './journal/format';
import { ProfileBackdrop } from './profile/ProfileBackdrop';
import { ProfileAction, ProfileHero } from './profile/ProfileHero';
import { ProfileOverview } from './profile/ProfileOverview';
import { ProfileSidebar } from './profile/ProfileSidebar';
import { Panel, ReviewCard, panel } from './profile/parts';

interface ProfilePageProps {
  onOpenSettings: () => void;
  onSelectGame: (gameId: string) => void;
  onOpenList: (listId?: string) => void;
}

type ProfileTab = 'overview' | 'games' | 'reviews' | 'lists';
type Feedback = { tone: 'success' | 'error'; text: string } | null;

// Carregando: o desenho da página, sem números
const ProfileSkeleton: React.FC = () => (
  <div className="max-w-[1180px] mx-auto px-6 pt-28 space-y-6" aria-busy="true">
    <LoadingLabel>Montando seu perfil...</LoadingLabel>
    <div className={`${panel} p-6 flex items-end gap-6`}>
      <Skeleton className="w-36 h-36 rounded-2xl" />
      <div className="flex-1 space-y-3 pb-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  </div>
);

export const ProfilePage: React.FC<ProfilePageProps> = ({ onOpenSettings, onSelectGame, onOpenList }) => {
  const isSyncingAchievements = useLibraryStore((s) => s.isSyncingAchievements);
  const setIsSyncingAchievements = useLibraryStore((s) => s.setIsSyncingAchievements);
  const allGames = useLibraryStore((s) => s.games);
  const launchStatuses = useLibraryStore((s) => s.launchStatuses);
  const lists = useListsStore((s) => s.lists);
  const loadLists = useListsStore((s) => s.load);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showYearReview, setShowYearReview] = useState(false);
  const [webStatus, setWebStatus] = useState<ProfileWebStatus>({});
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [gamesFilter, setGamesFilter] = useState<StatusFilter>('all');

  const playingId = Object.values(launchStatuses).find((s) => s.state === 'running')?.gameId;
  const playingTitle = playingId ? allGames.find((g) => g.id === playingId)?.title : undefined;
  const year = new Date().getFullYear();

  const games = useMemo(() => allGames.filter((g) => !g.isHidden), [allGames]);
  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const reviews = useMemo(
    () => games.filter((g) => g.log?.review?.trim()).sort((a, b) => (b.log?.finishedOn ?? b.updatedAt).localeCompare(a.log?.finishedOn ?? a.updatedAt)),
    [games]
  );
  const yearStats = useMemo(
    () => ({
      played: games.filter((g) => g.lastPlayedAt?.startsWith(String(year))).length,
      finished: games.filter((g) => g.log?.finishedOn?.startsWith(String(year))).length
    }),
    [games, year]
  );
  const played = useMemo(() => games.filter((g) => (g.totalPlaytimeSeconds ?? 0) > 0 || isJournalEntry(g)).sort((a, b) => (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0)), [games]);
  const shelfCounts = useMemo(() => countByStatus(played), [played]);
  const shelf = useMemo(() => played.filter((g) => matchesStatus(g.log?.status, gamesFilter)), [played, gamesFilter]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProfile((await window.electronAPI?.getPlayerProfile()) ?? null);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    loadLists().catch(() => undefined);
    window.electronAPI?.getProfileWebStatus().then(setWebStatus).catch(() => undefined);
  }, [load, loadLists]);

  // A busca de conquistas terminou (aqui ou no aviso do topo): números novos
  const prevSyncingRef = useRef(isSyncingAchievements);
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncingAchievements) void load();
    prevSyncingRef.current = isSyncingAchievements;
  }, [isSyncingAchievements, load]);

  const run = async (task: () => Promise<Feedback>) => {
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback(await task());
    } catch (err) {
      setFeedback({ tone: 'error', text: ipcErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleAction = (action: ProfileAction) => {
    if (action === 'settings') return onOpenSettings();
    if (action === 'publish') return setPublishing(true);
    if (busy || isSyncingAchievements) return;
    if (action === 'sync') {
      void run(async () => {
        setIsSyncingAchievements(true);
        try {
          const result = await window.electronAPI?.syncAllAchievements();
          return {
            tone: result?.failed ? 'error' : 'success',
            text: `Conquistas atualizadas em ${result?.synced ?? 0} jogo(s)${result?.failed ? `; ${result.failed} falharam. Confira a internet e tente de novo.` : '.'}`
          };
        } finally {
          setIsSyncingAchievements(false);
        }
      });
    } else if (action === 'export') {
      void run(async () => {
        const path = await window.electronAPI?.exportPlayerProfile();
        return path ? { tone: 'success', text: `Perfil exportado para ${path}` } : null;
      });
    }
  };

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24">
        <EmptyState
          icon={AlertTriangle}
          tone="warn"
          title="Não deu para montar seu perfil"
          description={error}
          className={emptyBox}
          actions={
            <Button variant="primary" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => void load()}>
              Tentar de novo
            </Button>
          }
        />
      </div>
    );
  }

  if (!profile) return <ProfileSkeleton />;

  const t = profile.totals;
  const steam = profile.steam;
  const hasBackdrop = !!(profile.background?.imageUrl || profile.background?.videoUrl);
  const finishedTotal = games.filter((g) => g.log?.status === 'finished' || g.log?.status === 'completed').length;

  const stats = [
    { label: 'Jogados', value: formatNumber(t.playedGames), hint: 'Tudo que você já abriu, em todas as fontes: inclui atalhos, jogos gratuitos, demos e ferramentas' },
    { label: 'Zerados', value: formatNumber(finishedTotal) },
    { label: 'Quero jogar', value: formatNumber(shelfCounts.backlog ?? 0) },
    { label: 'Horas', value: formatNumber(Math.round(t.playtimeSeconds / 3600)) },
    { label: 'Conquistas', value: formatNumber(t.achievementsUnlocked), accent: true },
    { label: 'Jogos 100%', value: formatNumber(t.perfectGames) }
  ];

  const presence = playingTitle
    ? { text: `Jogando ${playingTitle}`, className: 'text-emerald-300' }
    : steam?.state === 'in-game'
      ? { text: 'Em jogo', className: 'text-emerald-300' }
      : steam?.state === 'online'
        ? { text: 'On-line', className: 'text-indigo-300' }
        : undefined;

  const tabs: { id: ProfileTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'games', label: 'Jogos', count: played.length },
    { id: 'reviews', label: 'Resenhas', count: reviews.length },
    { id: 'lists', label: 'Listas', count: lists.length }
  ];

  return (
    <div className="relative min-h-full pb-16">
      <ProfileBackdrop imageUrl={profile.background?.imageUrl} videoUrl={profile.background?.videoUrl} gameRunning={!!playingId} />

      <div className={`relative z-10 max-w-[1180px] mx-auto px-6 space-y-5 ${hasBackdrop ? 'pt-[clamp(6rem,24vh,15rem)]' : 'pt-16'}`}>
        <ProfileSteamNotice isPrivate={!!steam?.isPrivate} hasAchievements={t.gamesWithAchievementData > 0} onChanged={load} onOpenSettings={onOpenSettings} />

        <ProfileHero
          profile={profile}
          stats={stats}
          presence={presence}
          busy={busy || isSyncingAchievements}
          publishLabel={webStatus.repoUrl ? 'Atualizar página na web' : 'Publicar página na web'}
          onEdit={() => setEditing(true)}
          onYearReview={() => setShowYearReview(true)}
          onAction={handleAction}
        />

        {feedback && (
          <div className={`${panel} px-4 py-3`}>
            <Notice tone={feedback.tone} className="break-all">
              {feedback.text}
            </Notice>
          </div>
        )}

        <nav className={`${panel} flex items-center gap-1 px-2`} aria-label="Partes do perfil">
          {tabs.map((item) => {
            const on = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={on ? 'true' : undefined}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm transition-colors ${focusRing} ${on ? 'text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                {item.label}
                {item.count !== undefined && <span className={`px-1.5 rounded-md text-[11px] tabular-nums ${on ? 'bg-indigo-500/25 text-indigo-200' : 'bg-slate-800 text-slate-400'}`}>{item.count}</span>}
                {on && <span className="absolute left-3 right-3 bottom-0 h-0.5 rounded-full bg-indigo-400" />}
              </button>
            );
          })}
        </nav>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
            <ProfileOverview
              profile={profile}
              sections={profile.custom.sections ?? ALL_SECTIONS}
              reviews={reviews}
              lists={lists}
              gamesById={gamesById}
              year={year}
              onSelectGame={onSelectGame}
              onOpenList={onOpenList}
              onShowReviews={() => setTab('reviews')}
              onEdit={() => setEditing(true)}
            />
            <ProfileSidebar profile={profile} games={games} year={year} yearStats={yearStats} onYearReview={() => setShowYearReview(true)} onSelectGame={onSelectGame} />
          </div>
        )}

        {tab === 'games' && (
          <Panel>
            <div className="mb-5">
              <StatusChips value={gamesFilter} counts={shelfCounts} onChange={setGamesFilter} />
            </div>
            {shelf.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Nenhum jogo com esse status.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-4 gap-y-5">
                {shelf.map((game) => (
                  <CoverCard
                    key={game.id}
                    title={game.title}
                    coverUrl={game.media?.coverUrl}
                    gameId={game.id}
                    onOpen={() => onSelectGame(game.id)}
                    meta={
                      <>
                        {game.log?.rating ? <Stars value={game.log.rating} size="w-3 h-3" /> : <span />}
                        <span className="whitespace-nowrap">{formatHours(game.totalPlaytimeSeconds)}</span>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </Panel>
        )}

        {tab === 'reviews' &&
          (reviews.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="Nenhuma resenha ainda"
              description="Abra um jogo e escreva em “Meu registro”. Suas resenhas aparecem aqui, com a nota e a data."
              className={`${emptyBox} bg-steam-bg/85`}
            />
          ) : (
            <Panel className="max-w-3xl">
              {reviews.map((game) => (
                <ReviewCard key={game.id} game={game} onOpen={() => onSelectGame(game.id)} />
              ))}
            </Panel>
          ))}

        {tab === 'lists' && (
          <Panel
            title={`${lists.length} ${lists.length === 1 ? 'lista' : 'listas'}`}
            extra={
              <Button icon={<ListOrdered className="w-3.5 h-3.5" />} onClick={() => onOpenList()}>
                {lists.length ? 'Gerenciar listas' : 'Criar lista'}
              </Button>
            }
          >
            {lists.length === 0 ? (
              <p className="py-6 text-sm text-slate-400">Melhores do ano, zerar nas férias, indicar para os amigos: suas listas aparecem aqui.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lists.map((list) => (
                  <ListCard key={list.id} list={list} games={gamesById} onOpen={() => onOpenList(list.id)} />
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>

      {editing && <ProfileEditModal profile={profile} onClose={() => setEditing(false)} onSaved={load} />}
      {showYearReview && (
        <YearReviewModal
          onClose={() => setShowYearReview(false)}
          onSelectGame={(id) => {
            setShowYearReview(false);
            onSelectGame(id);
          }}
        />
      )}
      {publishing && <ProfilePublishModal status={webStatus} onClose={() => setPublishing(false)} onChanged={setWebStatus} />}
    </div>
  );
};
