import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Crown, Download, Gamepad2, Globe, ListOrdered, Loader2, Pencil, Plus, RefreshCw, UserRound } from 'lucide-react';
import { YearReviewModal } from './YearReviewModal';
import { Game, GamePlatform, GameLogStatus, isJournalEntry } from '@shared/types/game';
import { PlayerProfile, ProfileGame, ProfileSectionId, ProfileWebStatus } from '@shared/types/profile';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useListsStore } from '../stores/useListsStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { ALL_SECTIONS, ProfileEditModal, SECTION_LABEL } from './ProfileEditModal';
import { ProfilePublishModal } from './ProfilePublishModal';
import { ProfileSteamNotice } from './ProfileSteamNotice';
import { LOG_STATUS, Stars } from './GameLogFields';
import { ListCard } from './ListsPage';
import { Select, SelectOption } from './Select';

interface ProfilePageProps {
  onOpenSettings: () => void;
  onSelectGame: (gameId: string) => void;
  onOpenList: (listId?: string) => void;
}

type ProfileTab = 'overview' | 'games' | 'reviews' | 'lists';
type GamesFilter = 'all' | GameLogStatus;

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'games', label: 'Jogos' },
  { id: 'reviews', label: 'Resenhas' },
  { id: 'lists', label: 'Listas' }
];

const PODIUM_SIZE = 5;
const OVERVIEW_REVIEWS = 3;
const OVERVIEW_LISTS = 3;
const ACTIVITY_WEEKS = 13;
const RATING_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const panel = 'bg-slate-950/75 border border-slate-700/40 rounded-lg';
const sectionPanel = `${panel} p-4`;
const buttonBase = `flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-100 disabled:opacity-50 transition-colors ${focusRing}`;
const button = `${buttonBase} bg-slate-800 hover:bg-slate-700`;

const PLATFORM_LABEL: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG',
  riot: 'Riot Games',
  xbox: 'Xbox',
  emulator: 'Emuladores',
  standalone: 'Outros PC'
};

const LEVEL_COLORS = ['#9b9b9b', '#c02942', '#d95b43', '#fecc23', '#467a3c', '#4e8ddb', '#7652c9', '#c252c9', '#542437', '#997c52'];

type Feedback = { tone: 'ok' | 'warn'; text: string } | null;

const hours = (seconds = 0) => {
  const h = seconds / 3600;
  if (seconds > 0 && h < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  return h >= 100 ? `${Math.round(h).toLocaleString('pt-BR')} h` : `${h.toFixed(1).replace('.', ',')} h`;
};

const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '') : '');
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Fundo do perfil inteiro, parado enquanto a página rola. O vídeo pausa sem foco e com jogo aberto: nunca disputa CPU e GPU com o jogo.
const ProfileBackdrop: React.FC<{ imageUrl?: string; videoUrl?: string; gameRunning: boolean }> = ({ imageUrl, videoUrl, gameRunning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [focused, setFocused] = useState(() => document.hasFocus() && !document.hidden);
  const [failedVideo, setFailedVideo] = useState<string>();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const showVideo = !!videoUrl && failedVideo !== videoUrl && !reducedMotion;

  useEffect(() => {
    const update = () => setFocused(document.hasFocus() && !document.hidden);
    const onFocus = () => setFocused(!document.hidden);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (focused && !gameRunning) void video.play().catch(() => undefined);
    else video.pause();
  }, [focused, gameRunning, showVideo, videoUrl]);

  return (
    <div className="sticky top-0 h-0 z-0" aria-hidden="true">
      <div className="absolute inset-x-0 top-0 h-screen overflow-hidden bg-slate-950">
        {imageUrl && <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        {showVideo && (
          <video ref={videoRef} key={videoUrl} src={videoUrl} poster={imageUrl} muted loop playsInline preload="auto" onError={() => setFailedVideo(videoUrl)} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/60" />
      </div>
    </div>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode; extra?: React.ReactNode }> = ({ children, extra }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-slate-800">
    <h2 className="text-base text-slate-100">{children}</h2>
    {extra && <span className="text-xs text-slate-400">{extra}</span>}
  </div>
);

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className={`text-indigo-300 hover:text-white rounded-sm ${focusRing}`}>
    {children}
  </button>
);

const CoverImage: React.FC<{ url?: string; title: string }> = ({ url, title }) =>
  url ? (
    <img src={url} alt="" loading="lazy" className="w-full h-full object-contain" />
  ) : (
    <span className="h-full flex items-center justify-center p-2 text-center text-[11px] text-slate-400">{title}</span>
  );

// Destaques em linha, com o do meio em evidência
const Podium: React.FC<{ games: ProfileGame[]; onOpen: (id: string) => void }> = ({ games, onOpen }) => {
  const center = games.length % 2 === 1 ? (games.length - 1) / 2 : -1;
  return (
    <div className="grid gap-3 items-end" style={{ gridTemplateColumns: `repeat(${PODIUM_SIZE}, minmax(0, 1fr))` }}>
      {games.map((game, index) => (
        <button key={game.id} onClick={() => onOpen(game.id)} title={game.title} className={`relative min-w-0 text-left rounded-sm ${focusRing}`}>
          {index === center && <Crown className="absolute -top-5 left-1/2 -translate-x-1/2 w-4 h-4 text-amber-400 fill-amber-400" />}
          <span className={`block aspect-[2/3] overflow-hidden bg-slate-900 border-2 ${index === center ? 'border-amber-400/80' : 'border-slate-800 hover:border-slate-500'} transition-colors`}>
            <CoverImage url={game.coverUrl} title={game.title} />
          </span>
          <span className="block mt-1.5 text-xs text-slate-200 truncate">{game.title}</span>
          <span className="block text-[11px] text-slate-500">{hours(game.playtimeSeconds)}</span>
        </button>
      ))}
    </div>
  );
};

const ReviewCard: React.FC<{ game: Game; onOpen: () => void }> = ({ game, onOpen }) => {
  const status = LOG_STATUS.find((s) => s.id === game.log?.status);
  const date = game.log?.finishedOn ?? game.lastPlayedAt?.slice(0, 10);
  return (
    <article className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 py-4 border-b border-slate-800 last:border-b-0">
      <button onClick={onOpen} title={game.title} className={`aspect-[2/3] overflow-hidden bg-slate-900 border border-slate-800 hover:border-slate-500 transition-colors ${focusRing}`}>
        <CoverImage url={game.media?.coverUrl} title={game.title} />
      </button>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <button onClick={onOpen} className={`text-left text-base text-white hover:text-indigo-200 truncate rounded-sm ${focusRing}`}>
            {game.title}
          </button>
          {date && <span className="flex-shrink-0 text-xs text-slate-500">{new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
          {!!game.log?.rating && <Stars value={game.log.rating} size="w-4 h-4" />}
          {status && (
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
            </span>
          )}
          <span>{hours(game.totalPlaytimeSeconds)}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-300 line-clamp-4 whitespace-pre-wrap select-text">{game.log?.review}</p>
      </div>
    </article>
  );
};

// Linha no formato da atividade recente
const GameRow: React.FC<{ game: ProfileGame; onOpen: () => void }> = ({ game, onOpen }) => {
  const total = game.achievementsTotal ?? 0;
  const unlocked = game.achievementsUnlocked ?? 0;
  return (
    <div className={`${panel} p-3`}>
      <button onClick={onOpen} className={`w-full flex items-start gap-3 text-left rounded-sm hover:brightness-125 transition ${focusRing}`}>
        <span className="w-[160px] aspect-[184/69] flex-shrink-0 rounded-md overflow-hidden bg-slate-950">
          {(game.heroUrl || game.coverUrl) && <img src={game.heroUrl || game.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
        </span>
        <span className="flex-1 min-w-0 text-sm text-white truncate">{game.title}</span>
        <span className="flex-shrink-0 text-right text-xs text-slate-300 leading-relaxed">
          <span className="block">{hours(game.playtimeSeconds)}</span>
          {game.lastPlayedAt && <span className="block text-slate-400">em {shortDate(game.lastPlayedAt)}</span>}
        </span>
      </button>
      {total > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex items-center gap-4">
          <div className="flex-1 min-w-0 text-xs text-slate-300">
            {unlocked} / {total} conquistas
            <div className="mt-1 h-1.5 rounded-full bg-slate-950 overflow-hidden">
              <div className="h-full bg-indigo-400" style={{ width: `${Math.round((unlocked / total) * 100)}%` }} />
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {game.recentAchievementIcons?.map((a) => <img key={a.name} src={a.iconUrl} alt={a.name} title={a.name} loading="lazy" className="w-8 h-8" />)}
          </div>
        </div>
      )}
    </div>
  );
};

const RatingsChart: React.FC<{ games: Game[] }> = ({ games }) => {
  const counts = RATING_STEPS.map((step) => games.filter((g) => g.log?.rating === step).length);
  const max = Math.max(1, ...counts);
  const rated = counts.reduce((sum, n) => sum + n, 0);
  return (
    <div>
      <div className="flex items-end gap-1 h-16">
        {RATING_STEPS.map((step, index) => (
          <span key={step} title={`${String(step).replace('.', ',')} estrelas: ${counts[index]}`} className="flex-1 rounded-sm bg-indigo-400" style={{ height: `${Math.max(counts[index] ? 10 : 3, (counts[index] / max) * 100)}%`, opacity: counts[index] ? 1 : 0.2 }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>½</span>
        <span>{rated} {rated === 1 ? 'nota' : 'notas'}</span>
        <span>5</span>
      </div>
    </div>
  );
};

const ActivityMap: React.FC<{ days: Record<string, number> }> = ({ days }) => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - (ACTIVITY_WEEKS - 1) * 7);
  const cells: { key: string; count: number; future: boolean }[] = [];
  for (let i = 0; i < ACTIVITY_WEEKS * 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = localDay(day);
    cells.push({ key, count: days[key] ?? 0, future: day > today });
  }
  const opacity = (count: number) => (count === 0 ? 0 : count === 1 ? 0.35 : count < 4 ? 0.6 : count < 10 ? 0.8 : 1);
  return (
    <div className="grid grid-rows-7 grid-flow-col gap-[3px]">
      {cells.map((cell) => (
        <span
          key={cell.key}
          title={cell.future ? undefined : `${new Date(`${cell.key}T12:00:00`).toLocaleDateString('pt-BR')}: ${cell.count} ${cell.count === 1 ? 'atividade' : 'atividades'}`}
          className={`aspect-square rounded-[2px] ${cell.future ? 'bg-transparent' : 'bg-slate-800'} relative overflow-hidden`}
        >
          {cell.count > 0 && <span className="absolute inset-0 bg-indigo-400" style={{ opacity: opacity(cell.count) }} />}
        </span>
      ))}
    </div>
  );
};

const SideBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className={`${panel} p-4`}>
    <h2 className="mb-3 text-sm text-slate-200">{title}</h2>
    {children}
  </section>
);

export const ProfilePage: React.FC<ProfilePageProps> = ({ onOpenSettings, onSelectGame, onOpenList }) => {
  const isSyncingAchievements = useLibraryStore((s) => s.isSyncingAchievements);
  const setIsSyncingAchievements = useLibraryStore((s) => s.setIsSyncingAchievements);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'sync' | 'export' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showYearReview, setShowYearReview] = useState(false);
  const [webStatus, setWebStatus] = useState<ProfileWebStatus>({});
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [gamesFilter, setGamesFilter] = useState<GamesFilter>('all');
  const allGames = useLibraryStore((s) => s.games);
  const launchStatuses = useLibraryStore((s) => s.launchStatuses);
  const lists = useListsStore((s) => s.lists);
  const loadLists = useListsStore((s) => s.load);
  const playingId = Object.values(launchStatuses).find((s) => s.state === 'running')?.gameId;
  const playingTitle = playingId ? allGames.find((g) => g.id === playingId)?.title : undefined;

  const games = useMemo(() => allGames.filter((g) => !g.isHidden), [allGames]);
  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const reviews = useMemo(
    () => games.filter((g) => g.log?.review?.trim()).sort((a, b) => (b.log?.finishedOn ?? b.updatedAt).localeCompare(a.log?.finishedOn ?? a.updatedAt)),
    [games]
  );
  const year = new Date().getFullYear();
  const yearStats = useMemo(
    () => ({
      played: games.filter((g) => g.lastPlayedAt?.startsWith(String(year))).length,
      finished: games.filter((g) => g.log?.finishedOn?.startsWith(String(year))).length
    }),
    [games, year]
  );
  const finishedTotal = useMemo(() => games.filter((g) => g.log?.status === 'finished' || g.log?.status === 'completed').length, [games]);
  const backlogTotal = useMemo(() => games.filter((g) => g.log?.status === 'backlog').length, [games]);

  const shelf = useMemo(
    () =>
      games
        .filter((g) => (g.totalPlaytimeSeconds ?? 0) > 0 || isJournalEntry(g))
        .filter((g) => gamesFilter === 'all' || g.log?.status === gamesFilter)
        .sort((a, b) => (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0)),
    [games, gamesFilter]
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      setProfile((await window.electronAPI?.getPlayerProfile()) ?? null);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
    loadLists().catch(() => undefined);
    window.electronAPI?.getProfileWebStatus().then(setWebStatus).catch(() => undefined);
  }, [load, loadLists]);

  const prevSyncingRef = useRef(isSyncingAchievements);
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncingAchievements) {
      void load();
    }
    prevSyncingRef.current = isSyncingAchievements;
  }, [isSyncingAchievements, load]);

  const run = async (kind: 'sync' | 'export', task: () => Promise<Feedback>) => {
    setBusy(kind);
    setFeedback(null);
    try {
      setFeedback(await task());
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleSync = () =>
    run('sync', async () => {
      setIsSyncingAchievements(true);
      try {
        const result = await window.electronAPI?.syncAllAchievements();
        return {
          tone: result?.failed ? 'warn' : 'ok',
          text: `Conquistas atualizadas em ${result?.synced ?? 0} jogo(s)${result?.failed ? `; ${result.failed} falharam. Confira a internet e clique em Atualizar de novo.` : '.'}`
        };
      } finally {
        setIsSyncingAchievements(false);
      }
    });

  const handleExport = () =>
    run('export', async () => {
      const path = await window.electronAPI?.exportPlayerProfile();
      return path ? { tone: 'ok', text: `Perfil exportado para ${path}` } : null;
    });

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
        <AlertTriangle className="w-8 h-8 text-amber-400/80" />
        <p className="text-sm text-slate-300">{error}</p>
        <button onClick={load} className={button}>
          <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Montando seu perfil...
      </div>
    );
  }

  const t = profile.totals;
  const { custom, steam } = profile;
  const levelColor = profile.steamLevel !== undefined ? LEVEL_COLORS[Math.floor(profile.steamLevel / 10) % 10] : undefined;
  const maxPlatform = Math.max(1, ...profile.byPlatform.map((p) => p.playtimeSeconds));
  const sections = custom.sections ?? ALL_SECTIONS;
  const showcase = profile.featuredAchievements.length > 0 ? profile.featuredAchievements : profile.rarestAchievements.map((a) => ({ ...a, key: `${a.gameId}-${a.name}` }));
  const realName = custom.realName || steam?.realName;
  const location = custom.location || steam?.location;
  const bio = custom.bio || steam?.summary;
  const frameUrl = custom.hideAvatarFrame ? undefined : steam?.avatarFrameUrl;
  const artworkUrl = custom.artworkUrl || steam?.showcaseArt?.imageUrl;
  const artworkCaption = custom.artworkCaption || (custom.artworkUrl ? undefined : steam?.showcaseArt?.title);
  const highlights = profile.featuredGames.length > 0 ? profile.featuredGames : profile.favorites.length > 0 ? profile.favorites : profile.mostPlayed;
  const featuredLists = lists.filter((l) => l.featured);
  const shownLists = (featuredLists.length > 0 ? featuredLists : lists).slice(0, OVERVIEW_LISTS);
  const hasRatings = games.some((g) => g.log?.rating);

  const stats = [
    { label: 'Jogos jogados', value: t.playedGames.toLocaleString('pt-BR'), title: 'Tudo que você já abriu, em todas as fontes: inclui atalhos, jogos gratuitos, demos e ferramentas' },
    { label: 'Zerados', value: finishedTotal.toLocaleString('pt-BR') },
    { label: 'Quero jogar', value: backlogTotal.toLocaleString('pt-BR') },
    { label: 'Horas', value: Math.round(t.playtimeSeconds / 3600).toLocaleString('pt-BR') },
    { label: 'Conquistas', value: t.achievementsUnlocked.toLocaleString('pt-BR') },
    { label: 'Jogos 100%', value: t.perfectGames.toLocaleString('pt-BR') }
  ];

  const status = playingTitle
    ? { text: `Jogando ${playingTitle}`, className: 'text-emerald-300' }
    : steam?.state === 'in-game'
      ? { text: 'Em jogo', className: 'text-emerald-300' }
      : steam?.state === 'online'
        ? { text: 'On-line', className: 'text-sky-300' }
        : undefined;

  const filterOptions: SelectOption<GamesFilter>[] = [{ value: 'all', label: 'Todos os status' }, ...LOG_STATUS.map((s) => ({ value: s.id as GamesFilter, label: s.label, dot: s.dot }))];

  const renderSection = (id: ProfileSectionId) => {
    if (id === 'artwork') {
      if (!artworkUrl) return null;
      return (
        <section key={id}>
          <figure className="inline-block max-w-full">
            <img src={artworkUrl} alt={artworkCaption ?? ''} className="max-w-full max-h-[420px] object-contain rounded-lg" />
            {artworkCaption && <figcaption className="mt-2 text-sm text-slate-100 drop-shadow">{artworkCaption}</figcaption>}
          </figure>
        </section>
      );
    }
    if (id === 'featured') {
      if (highlights.length === 0) return null;
      return (
        <section key={id} className={sectionPanel}>
          <SectionTitle extra={profile.featuredGames.length === 0 ? <LinkButton onClick={() => setEditing(true)}>Escolher os meus</LinkButton> : undefined}>
            {profile.featuredGames.length > 0 ? SECTION_LABEL[id] : profile.favorites.length > 0 ? 'Favoritos' : 'Mais jogados'}
          </SectionTitle>
          <div className="pt-4">
            <Podium games={highlights.slice(0, PODIUM_SIZE)} onOpen={onSelectGame} />
          </div>
        </section>
      );
    }
    if (id === 'reviews') {
      return (
        <section key={id} className={sectionPanel}>
          <SectionTitle extra={reviews.length > OVERVIEW_REVIEWS ? <LinkButton onClick={() => setTab('reviews')}>Ver todas ({reviews.length})</LinkButton> : undefined}>{SECTION_LABEL[id]}</SectionTitle>
          {reviews.length === 0 ? (
            <p className="py-6 text-sm text-slate-400">Nenhuma resenha ainda. Abra um jogo e escreva em “Meu registro”: ela aparece aqui.</p>
          ) : (
            reviews.slice(0, OVERVIEW_REVIEWS).map((game) => <ReviewCard key={game.id} game={game} onOpen={() => onSelectGame(game.id)} />)
          )}
        </section>
      );
    }
    if (id === 'lists') {
      return (
        <section key={id} className={sectionPanel}>
          <SectionTitle extra={<LinkButton onClick={() => onOpenList()}>Ver todas</LinkButton>}>{SECTION_LABEL[id]}</SectionTitle>
          {shownLists.length === 0 ? (
            <div className="flex items-center justify-between gap-3 py-4">
              <p className="text-sm text-slate-400">Crie listas como “Melhores de {year}” e destaque aqui as suas preferidas.</p>
              <button onClick={() => onOpenList()} className={`${button} flex-shrink-0`}>
                <Plus className="w-3.5 h-3.5" /> Criar lista
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {shownLists.map((list) => (
                <ListCard key={list.id} list={list} games={gamesById} onOpen={() => onOpenList(list.id)} />
              ))}
            </div>
          )}
        </section>
      );
    }
    if (id === 'achievements') {
      if (showcase.length === 0) return null;
      return (
        <section key={id} className={sectionPanel}>
          <SectionTitle extra={profile.featuredAchievements.length === 0 ? 'as mais raras' : undefined}>{SECTION_LABEL[id]}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {showcase.map((a) => (
              <button key={a.key} onClick={() => onSelectGame(a.gameId)} className={`${panel} flex items-center gap-3 p-2 text-left hover:border-slate-600 transition-colors ${focusRing}`}>
                {a.iconUrl && <img src={a.iconUrl} alt="" loading="lazy" className="w-11 h-11 flex-shrink-0 rounded-sm" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-100 truncate">{a.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{a.gameTitle}</span>
                </span>
                {typeof a.globalPercent === 'number' && <span className="text-xs text-amber-300/90 flex-shrink-0">{a.globalPercent.toFixed(1).replace('.', ',')}%</span>}
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (id === 'activity') {
      const rows = profile.recentGames.slice(0, 5);
      return (
        <section key={id} className={sectionPanel}>
          <SectionTitle extra={profile.recentPlaytimeSeconds ? `${hours(profile.recentPlaytimeSeconds)} nas últimas 2 semanas` : undefined}>{SECTION_LABEL[id]}</SectionTitle>
          {rows.length === 0 ? (
            <p className="py-4 text-sm text-slate-400">Nenhum jogo nas últimas 2 semanas.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((g) => (
                <GameRow key={g.id} game={g} onOpen={() => onSelectGame(g.id)} />
              ))}
            </div>
          )}
        </section>
      );
    }
    if (id === 'screenshots') {
      if (profile.screenshots.length === 0) return null;
      return (
        <section key={id} className={sectionPanel}>
          <SectionTitle>{SECTION_LABEL[id]}</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            {profile.screenshots.map((shot) => (
              <button key={shot.url} onClick={() => onSelectGame(shot.gameId)} title={shot.gameTitle} className={`aspect-video rounded-md overflow-hidden bg-slate-900 hover:brightness-110 ${focusRing}`}>
                <img src={shot.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (id === 'mostPlayed') {
      if (profile.mostPlayed.length === 0) return null;
      return (
        <section key={id} className={sectionPanel}>
          <SectionTitle>{SECTION_LABEL[id]}</SectionTitle>
          <div className="space-y-1.5">
            {profile.mostPlayed.map((g) => (
              <GameRow key={g.id} game={g} onOpen={() => onSelectGame(g.id)} />
            ))}
          </div>
        </section>
      );
    }
    return null;
  };

  return (
    <div className="relative min-h-full pb-12">
      <ProfileBackdrop imageUrl={profile.background?.imageUrl} videoUrl={profile.background?.videoUrl} gameRunning={!!playingId} />

      <div className="relative z-10 max-w-[1120px] mx-auto px-6 pt-24 space-y-5">
        <ProfileSteamNotice isPrivate={!!steam?.isPrivate} hasAchievements={t.gamesWithAchievementData > 0} onChanged={load} onOpenSettings={onOpenSettings} />

        {/* Identidade */}
        <header className={`${sectionPanel} flex flex-wrap items-end gap-5`}>
          <div className="relative w-32 h-32 flex-shrink-0">
            <div className="w-full h-full rounded-lg overflow-hidden bg-slate-800 border-2 border-slate-950">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="h-full flex items-center justify-center">
                  <UserRound className="w-12 h-12 text-slate-500" />
                </span>
              )}
            </div>
            {frameUrl && <img src={frameUrl} alt="" className="absolute -inset-[7%] w-[114%] h-[114%] max-w-none pointer-events-none" />}
          </div>
          <div className="flex-1 min-w-[220px] pb-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl leading-tight text-white truncate">{profile.displayName}</h1>
              {profile.steamLevel !== undefined && (
                <span title="Nível na Steam" className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs text-slate-100" style={{ borderColor: levelColor }}>
                  {profile.steamLevel}
                </span>
              )}
              {status && <span className={`text-sm ${status.className}`}>{status.text}</span>}
            </div>
            {(realName || location) && (
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-300">
                {realName && <span>{realName}</span>}
                {!custom.location && steam?.flagUrl && <img src={steam.flagUrl} alt="" className="w-4 h-[11px]" />}
                {location && <span>{location}</span>}
              </p>
            )}
            {bio && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300 line-clamp-3 whitespace-pre-wrap">{bio}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <button onClick={() => setEditing(true)} className={`${buttonBase} bg-indigo-600 hover:bg-indigo-500`}>
              <Pencil className="w-3.5 h-3.5" /> Editar perfil
            </button>
            <button onClick={handleSync} disabled={busy !== null || isSyncingAchievements} className={button} title="Buscar as conquistas de todos os jogos">
              {busy === 'sync' || isSyncingAchievements ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Atualizar
            </button>
            <button onClick={() => setShowYearReview(true)} className={button}>
              <CalendarDays className="w-3.5 h-3.5" /> Retrospectiva
            </button>
            <button onClick={handleExport} disabled={busy !== null} className={button}>
              {busy === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Exportar
            </button>
            <button onClick={() => setPublishing(true)} disabled={busy !== null} className={button}>
              <Globe className="w-3.5 h-3.5" /> {webStatus.repoUrl ? 'Atualizar na web' : 'Publicar na web'}
            </button>
          </div>
        </header>

        {feedback && (
          <p className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs break-all ${feedback.tone === 'ok' ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/60 border-amber-500/30 text-amber-300'}`}>
            {feedback.tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
            {feedback.text}
          </p>
        )}

        <dl className={`${panel} grid grid-cols-3 md:grid-cols-6 gap-y-3 py-4`}>
          {stats.map((s) => (
            <div key={s.label} title={s.title} className="text-center">
              <dd className="text-3xl font-light text-white tabular-nums">{s.value}</dd>
              <dt className="mt-0.5 text-xs text-slate-400">{s.label}</dt>
            </div>
          ))}
        </dl>

        <nav className={`${panel} flex items-center gap-1 px-1`} aria-label="Partes do perfil">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'true' : undefined}
              className={`relative px-4 py-2.5 text-sm transition-colors ${focusRing} ${tab === item.id ? 'text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {item.label}
              {tab === item.id && <span className="absolute left-3 right-3 bottom-0 h-0.5 bg-indigo-400" />}
            </button>
          ))}
        </nav>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_288px] gap-6 items-start">
            <div className="space-y-8 min-w-0">{sections.map(renderSection)}</div>

            <aside className="space-y-3">
              <SideBlock title={String(year)}>
                <dl className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <dd className="text-2xl font-light text-white">{yearStats.played}</dd>
                    <dt className="text-[11px] text-slate-400">Jogados</dt>
                  </div>
                  <div>
                    <dd className="text-2xl font-light text-white">{yearStats.finished}</dd>
                    <dt className="text-[11px] text-slate-400">Zerados</dt>
                  </div>
                </dl>
              </SideBlock>

              <SideBlock title="Mapa de atividade">
                <ActivityMap days={profile.activityByDay} />
                <p className="mt-2 text-[11px] text-slate-500">Últimas {ACTIVITY_WEEKS} semanas: sessões, conquistas e capturas.</p>
              </SideBlock>

              {hasRatings && (
                <SideBlock title="Suas notas">
                  <RatingsChart games={games} />
                </SideBlock>
              )}

              {profile.byPlatform.some((p) => p.playtimeSeconds > 0) && (
                <SideBlock title="Plataformas">
                  <div className="space-y-2">
                    {profile.byPlatform
                      .filter((p) => p.playtimeSeconds > 0)
                      .map((p) => (
                        <div key={p.platform} className="text-xs">
                          <div className="flex justify-between gap-2 text-slate-300">
                            <span>{PLATFORM_LABEL[p.platform]}</span>
                            <span className="text-slate-400">{hours(p.playtimeSeconds)}</span>
                          </div>
                          <div className="mt-1 h-1 rounded-full bg-slate-950 overflow-hidden">
                            <div className="h-full bg-indigo-400" style={{ width: `${(p.playtimeSeconds / maxPlatform) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                  </div>
                </SideBlock>
              )}

              {profile.recentAchievements.length > 0 && (
                <SideBlock title="Últimas conquistas">
                  <div className="grid grid-cols-5 gap-1.5">
                    {profile.recentAchievements.map((a) => (
                      <button key={`${a.gameId}-${a.name}`} onClick={() => onSelectGame(a.gameId)} title={`${a.name} — ${a.gameTitle}`} className={`aspect-square rounded-sm overflow-hidden bg-slate-800 ${focusRing}`}>
                        {a.iconUrl && <img src={a.iconUrl} alt={a.name} loading="lazy" className="w-full h-full object-cover" />}
                      </button>
                    ))}
                  </div>
                </SideBlock>
              )}

              {!!steam?.badges?.length && (
                <SideBlock title="Insígnias">
                  <div className="flex flex-wrap gap-2">
                    {steam.badges.map((b) => (
                      <img key={b.iconUrl} src={b.iconUrl} alt={b.name} title={b.name} className="w-11 h-11 object-contain" />
                    ))}
                  </div>
                </SideBlock>
              )}

              <button onClick={onOpenSettings} className={`${panel} w-full px-3 py-2 text-xs text-slate-300 hover:text-white ${focusRing}`}>
                Contas e configurações
              </button>
            </aside>
          </div>
        )}

        {tab === 'games' && (
          <section className={`${sectionPanel} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-400">{shelf.length} {shelf.length === 1 ? 'jogo' : 'jogos'}</p>
              <Select value={gamesFilter} options={filterOptions} onChange={setGamesFilter} ariaLabel="Filtrar por status" />
            </div>
            {shelf.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">Nenhum jogo com esse status.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x-3 gap-y-4">
                {shelf.map((game) => (
                  <button key={game.id} onClick={() => onSelectGame(game.id)} title={game.title} className={`min-w-0 text-left rounded-sm ${focusRing}`}>
                    <span className="block aspect-[2/3] overflow-hidden bg-slate-900 border border-slate-800 hover:border-slate-500 transition-colors">
                      {game.media?.coverUrl ? <img src={game.media.coverUrl} alt="" loading="lazy" className="w-full h-full object-contain" /> : <span className="h-full flex items-center justify-center"><Gamepad2 className="w-6 h-6 text-slate-600" /></span>}
                    </span>
                    <span className="block mt-1.5 text-xs text-slate-200 truncate">{game.title}</span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 min-h-3.5">
                      {game.log?.rating ? <Stars value={game.log.rating} /> : <span />}
                      <span className="text-[11px] text-slate-500 whitespace-nowrap">{hours(game.totalPlaytimeSeconds)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'reviews' && (
          <section className={`${sectionPanel} max-w-3xl`}>
            {reviews.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">Nenhuma resenha ainda. Abra um jogo e escreva em “Meu registro”.</p>
            ) : (
              reviews.map((game) => <ReviewCard key={game.id} game={game} onOpen={() => onSelectGame(game.id)} />)
            )}
          </section>
        )}

        {tab === 'lists' && (
          <section className={`${sectionPanel} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-400">{lists.length} {lists.length === 1 ? 'lista' : 'listas'}</p>
              <button onClick={() => onOpenList()} className={button}>
                <ListOrdered className="w-3.5 h-3.5" /> Gerenciar listas
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lists.map((list) => (
                <ListCard key={list.id} list={list} games={gamesById} onOpen={() => onOpenList(list.id)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {editing && <ProfileEditModal profile={profile} onClose={() => setEditing(false)} onSaved={load} />}
      {showYearReview && <YearReviewModal onClose={() => setShowYearReview(false)} onSelectGame={(id) => { setShowYearReview(false); onSelectGame(id); }} />}
      {publishing && <ProfilePublishModal status={webStatus} onClose={() => setPublishing(false)} onChanged={setWebStatus} />}
    </div>
  );
};
