import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Globe, Loader2, Pencil, RefreshCw, UserRound } from 'lucide-react';
import { GamePlatform } from '@shared/types/game';
import { PlayerProfile, ProfileGame, ProfileSectionId, ProfileWebStatus } from '@shared/types/profile';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { ALL_SECTIONS, ProfileEditModal, SECTION_LABEL } from './ProfileEditModal';
import { ProfilePublishModal } from './ProfilePublishModal';

interface ProfilePageProps {
  onOpenSettings: () => void;
  onSelectGame: (gameId: string) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const panel = 'bg-black/65';
const buttonBase = `flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium text-slate-100 disabled:opacity-50 transition-colors ${focusRing}`;
const button = `${buttonBase} bg-white/10 hover:bg-white/20`;

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

// Contadores da página pública da Steam. Capturas ficam de fora: ali só contam as públicas.
const STEAM_COUNTS: [string, string][] = [
  ['badges', 'Insígnias'],
  ['games', 'Jogos na Steam'],
  ['reviews', 'Análises'],
  ['artwork', 'Artes'],
  ['friends', 'Amigos']
];

type Feedback = { tone: 'ok' | 'warn'; text: string } | null;

const hours = (seconds = 0) => {
  const h = seconds / 3600;
  if (seconds > 0 && h < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  return h >= 100 ? `${Math.round(h).toLocaleString('pt-BR')} h` : `${h.toFixed(1).replace('.', ',')} h`;
};

const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '') : '');

// Fundo do perfil. O vídeo pausa sem foco e com jogo aberto: nunca disputa CPU e GPU com o jogo.
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
      <div className="absolute inset-x-0 top-0 h-screen overflow-hidden bg-black">
        {imageUrl && <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        {showVideo && (
          <video
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            poster={imageUrl}
            muted
            loop
            playsInline
            preload="auto"
            onError={() => setFailedVideo(videoUrl)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
      </div>
    </div>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode; extra?: React.ReactNode }> = ({ children, extra }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3">
    <h2 className="text-lg text-slate-100">{children}</h2>
    {extra && <span className="text-sm text-slate-300">{extra}</span>}
  </div>
);

const Cover: React.FC<{ game: ProfileGame; onOpen: () => void }> = ({ game, onOpen }) => (
  <button onClick={onOpen} title={game.title} className={`group text-left rounded-sm ${focusRing}`}>
    <span className="block aspect-[2/3] rounded-sm overflow-hidden bg-slate-800">
      {game.coverUrl ? (
        <img src={game.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
      ) : (
        <span className="h-full flex items-center justify-center p-2 text-center text-[11px] text-slate-400">{game.title}</span>
      )}
    </span>
    <span className="block mt-1.5 text-xs text-slate-200 truncate">{game.title}</span>
    <span className="block text-[11px] text-slate-400">{hours(game.playtimeSeconds)}</span>
  </button>
);

// Linha no formato da atividade recente da Steam
const GameRow: React.FC<{ game: ProfileGame; onOpen: () => void }> = ({ game, onOpen }) => {
  const total = game.achievementsTotal ?? 0;
  const unlocked = game.achievementsUnlocked ?? 0;
  return (
    <div className={`${panel} p-3`}>
      <button onClick={onOpen} className={`w-full flex items-start gap-3 text-left rounded-sm hover:brightness-125 transition ${focusRing}`}>
        <span className="w-[184px] aspect-[184/69] flex-shrink-0 overflow-hidden bg-slate-900">
          {(game.heroUrl || game.coverUrl) && <img src={game.heroUrl || game.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
        </span>
        <span className="flex-1 min-w-0 text-sm text-white truncate">{game.title}</span>
        <span className="flex-shrink-0 text-right text-xs text-slate-300 leading-relaxed">
          <span className="block">{hours(game.playtimeSeconds)} registradas</span>
          {game.lastPlayedAt && <span className="block">jogado por último em {shortDate(game.lastPlayedAt)}</span>}
          {!!game.recentSeconds && <span className="block text-slate-400">{hours(game.recentSeconds)} nas últimas 2 semanas</span>}
        </span>
      </button>
      {total > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center gap-4">
          <div className="flex-1 min-w-0 text-xs text-slate-300">
            {unlocked} / {total} conquistas
            <div className="mt-1 h-1.5 bg-black/60 overflow-hidden">
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

const CountRow: React.FC<{ label: string; value: string | number; title?: string }> = ({ label, value, title }) => (
  <div className="flex items-baseline gap-2 text-sm" title={title}>
    <span className="text-slate-200">{label}</span>
    <span className="text-xl font-light text-slate-400">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</span>
  </div>
);

export const ProfilePage: React.FC<ProfilePageProps> = ({ onOpenSettings, onSelectGame }) => {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'sync' | 'export' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [webStatus, setWebStatus] = useState<ProfileWebStatus>({});
  const games = useLibraryStore((s) => s.games);
  const launchStatuses = useLibraryStore((s) => s.launchStatuses);
  const playingId = Object.values(launchStatuses).find((s) => s.state === 'running')?.gameId;
  const playingTitle = playingId ? games.find((g) => g.id === playingId)?.title : undefined;

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
    window.electronAPI?.getProfileWebStatus().then(setWebStatus).catch(() => undefined);
  }, [load]);

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
      const result = await window.electronAPI?.syncAllAchievements();
      await load();
      return {
        tone: result?.failed ? 'warn' : 'ok',
        text: `Conquistas atualizadas em ${result?.synced ?? 0} jogo(s)${result?.failed ? `; ${result.failed} falharam. Confira a internet e clique em Atualizar de novo.` : '.'}`
      };
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
  const completion = t.achievementsTotal ? Math.round((t.achievementsUnlocked / t.achievementsTotal) * 100) : undefined;
  const showcase = profile.featuredAchievements.length > 0 ? profile.featuredAchievements : profile.rarestAchievements.map((a) => ({ ...a, key: `${a.gameId}-${a.name}` }));
  const realName = custom.realName || steam?.realName;
  const location = custom.location || steam?.location;
  const bio = custom.bio || steam?.summary;
  const frameUrl = custom.hideAvatarFrame ? undefined : steam?.avatarFrameUrl;
  const artworkUrl = custom.artworkUrl || steam?.showcaseArt?.imageUrl;
  const artworkCaption = custom.artworkCaption || (custom.artworkUrl ? undefined : steam?.showcaseArt?.title);
  const steamCounts = STEAM_COUNTS.flatMap(([key, label]) => (steam?.counts?.[key] !== undefined ? [{ label, value: steam.counts[key] }] : []));

  const status = playingTitle
    ? { text: `Jogando ${playingTitle}`, className: 'text-[#a3cf06]' }
    : steam?.state === 'in-game'
      ? { text: 'Em jogo', className: 'text-[#a3cf06]' }
      : steam?.state === 'online'
        ? { text: 'On-line', className: 'text-[#57cbde]' }
        : steam?.state === 'offline'
          ? { text: 'Off-line', className: 'text-slate-400' }
          : undefined;

  const renderSection = (id: ProfileSectionId) => {
    if (id === 'artwork') {
      if (!artworkUrl) return null;
      return (
        <section key={id}>
          <figure className="inline-block max-w-full">
            <img src={artworkUrl} alt={artworkCaption ?? ''} className="max-w-full max-h-[420px] object-contain" />
            {artworkCaption && <figcaption className="mt-2 text-sm text-slate-300">{artworkCaption}</figcaption>}
          </figure>
        </section>
      );
    }
    if (id === 'featured') {
      if (profile.featuredGames.length === 0) return null;
      return (
        <section key={id}>
          <SectionTitle>{SECTION_LABEL[id]}</SectionTitle>
          <div className={`${panel} p-3 grid grid-cols-4 md:grid-cols-6 gap-3`}>
            {profile.featuredGames.map((g) => (
              <Cover key={g.id} game={g} onOpen={() => onSelectGame(g.id)} />
            ))}
          </div>
        </section>
      );
    }
    if (id === 'achievements') {
      if (showcase.length === 0) return null;
      return (
        <section key={id}>
          <SectionTitle extra={profile.featuredAchievements.length === 0 ? 'as mais raras' : undefined}>{SECTION_LABEL[id]}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {showcase.map((a) => (
              <button key={a.key} onClick={() => onSelectGame(a.gameId)} className={`${panel} flex items-center gap-3 p-2 text-left hover:bg-black/80 transition-colors ${focusRing}`}>
                {a.iconUrl && <img src={a.iconUrl} alt="" loading="lazy" className="w-11 h-11 flex-shrink-0" />}
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
        <section key={id}>
          <SectionTitle extra={profile.recentPlaytimeSeconds ? `${hours(profile.recentPlaytimeSeconds)} nas últimas 2 semanas` : undefined}>{SECTION_LABEL[id]}</SectionTitle>
          {rows.length === 0 ? (
            <p className={`${panel} p-3 text-xs text-slate-400`}>Nenhum jogo nas últimas 2 semanas.</p>
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
        <section key={id}>
          <SectionTitle>{SECTION_LABEL[id]}</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            {profile.screenshots.map((shot) => (
              <button key={shot.url} onClick={() => onSelectGame(shot.gameId)} title={shot.gameTitle} className={`aspect-video overflow-hidden bg-slate-900 hover:brightness-110 ${focusRing}`}>
                <img src={shot.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      );
    }
    return (
      <section key={id}>
        <SectionTitle>{SECTION_LABEL[id]}</SectionTitle>
        <div className="space-y-1.5">
          {profile.mostPlayed.map((g) => (
            <GameRow key={g.id} game={g} onOpen={() => onSelectGame(g.id)} />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="relative min-h-full pb-12">
      <ProfileBackdrop imageUrl={profile.background?.imageUrl} videoUrl={profile.background?.videoUrl} gameRunning={!!playingId} />

      <div className="relative z-10 max-w-[1040px] mx-auto px-6 pt-8 grid grid-cols-[minmax(0,1fr)_280px] gap-x-6 gap-y-7 items-start">
        {/* Identidade */}
        <header className={`${panel} p-5 flex items-start gap-5 min-w-0`}>
          <div className="relative w-[148px] h-[148px] flex-shrink-0">
            <div className="w-full h-full overflow-hidden bg-slate-800">
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
          <div className="min-w-0 pt-1">
            <h1 className="text-[28px] leading-tight text-white truncate">{profile.displayName}</h1>
            {(realName || location) && (
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-300">
                {realName && <span>{realName}</span>}
                {!custom.location && steam?.flagUrl && <img src={steam.flagUrl} alt="" className="w-4 h-[11px]" />}
                {location && <span>{location}</span>}
              </p>
            )}
            {bio && <p className="mt-3 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{bio}</p>}
          </div>
        </header>

        {/* Coluna lateral: atravessa as linhas, como na Steam */}
        <aside className={`${panel} p-5 row-span-2 space-y-6`}>
          <div>
            {profile.steamLevel !== undefined && (
              <div className="flex items-center gap-2.5 text-xl text-slate-100">
                Nível
                <span className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm" style={{ borderColor: levelColor }}>
                  {profile.steamLevel}
                </span>
              </div>
            )}
            {steam?.favoriteBadge && (
              <div className="mt-3 flex items-center gap-2.5">
                <img src={steam.favoriteBadge.iconUrl} alt="" className="w-14 h-14" />
                <div className="min-w-0 text-xs text-slate-200">
                  <p className="truncate font-medium">{steam.favoriteBadge.name}</p>
                  <p className="text-slate-400">{steam.favoriteBadge.detail}</p>
                </div>
              </div>
            )}
            <div className="mt-4 space-y-1.5">
              <button onClick={() => setEditing(true)} className={`${buttonBase} w-full bg-indigo-600 hover:bg-indigo-500`}>
                <Pencil className="w-3.5 h-3.5" /> Editar perfil
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={handleSync} disabled={busy !== null} className={button} title="Buscar as conquistas de todos os jogos">
                  {busy === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Atualizar
                </button>
                <button onClick={handleExport} disabled={busy !== null} className={button}>
                  {busy === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Exportar
                </button>
              </div>
              <button onClick={() => setPublishing(true)} disabled={busy !== null} className={`${button} w-full`}>
                <Globe className="w-3.5 h-3.5" /> {webStatus.repoUrl ? 'Atualizar página na web' : 'Publicar na web'}
              </button>
            </div>
            {feedback && (
              <p className={`mt-2 flex items-start gap-1.5 text-[11px] break-words ${feedback.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>
                {feedback.tone === 'ok' ? <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                <span className="min-w-0">{feedback.text}</span>
              </p>
            )}
          </div>

          {status && <p className={`text-xl font-light ${status.className}`}>{status.text}</p>}

          {!!steam?.badges?.length && (
            <div className="flex flex-wrap gap-2">
              {steam.badges.map((b) => (
                <img key={b.iconUrl} src={b.iconUrl} alt={b.name} title={b.name} className="w-12 h-12 object-contain" />
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            {steamCounts.map((c) => (
              <CountRow key={c.label} label={c.label} value={c.value} />
            ))}
            <CountRow label="Jogos jogados" value={t.playedGames} title="Tudo que você já abriu, em todas as fontes: inclui atalhos, jogos gratuitos, demos e ferramentas" />
            <CountRow label="Horas jogadas" value={hours(t.playtimeSeconds)} />
            <CountRow label="Conquistas" value={t.achievementsUnlocked} title={completion !== undefined ? `${completion}% das conquistas dos jogos com dados` : undefined} />
            {t.perfectGames > 0 && <CountRow label="Jogos 100%" value={t.perfectGames} />}
          </div>

          <div>
            <h2 className="mb-2 text-sm text-slate-200">Plataformas</h2>
            <div className="space-y-2">
              {profile.byPlatform
                .filter((p) => p.playtimeSeconds > 0)
                .map((p) => (
                  <div key={p.platform} className="text-xs">
                    <div className="flex justify-between gap-2 text-slate-300">
                      <span>{PLATFORM_LABEL[p.platform]}</span>
                      <span className="text-slate-400">{hours(p.playtimeSeconds)}</span>
                    </div>
                    <div className="mt-1 h-1 bg-black/60 overflow-hidden">
                      <div className="h-full bg-indigo-400" style={{ width: `${(p.playtimeSeconds / maxPlatform) * 100}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {profile.recentAchievements.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm text-slate-200">Últimas conquistas</h2>
              <div className="grid grid-cols-5 gap-1.5">
                {profile.recentAchievements.map((a) => (
                  <button key={`${a.gameId}-${a.name}`} onClick={() => onSelectGame(a.gameId)} title={`${a.name} — ${a.gameTitle}`} className={`aspect-square overflow-hidden bg-slate-800 ${focusRing}`}>
                    {a.iconUrl && <img src={a.iconUrl} alt={a.name} loading="lazy" className="w-full h-full object-cover" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {profile.favorites.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm text-slate-200">Favoritos</h2>
              <div className="grid grid-cols-4 gap-1.5">
                {profile.favorites.slice(0, 12).map((g) => (
                  <button key={g.id} onClick={() => onSelectGame(g.id)} title={g.title} className={`aspect-[2/3] overflow-hidden bg-slate-800 ${focusRing}`}>
                    {g.coverUrl && <img src={g.coverUrl} alt={g.title} loading="lazy" className="w-full h-full object-cover" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={onOpenSettings} className={`text-xs text-slate-400 hover:text-white rounded-sm ${focusRing}`}>
            Contas e configurações
          </button>
        </aside>

        <div className="space-y-7 min-w-0">{sections.map(renderSection)}</div>
      </div>

      {editing && <ProfileEditModal profile={profile} onClose={() => setEditing(false)} onSaved={load} />}
      {publishing && <ProfilePublishModal status={webStatus} onClose={() => setPublishing(false)} onChanged={setWebStatus} />}
    </div>
  );
};
