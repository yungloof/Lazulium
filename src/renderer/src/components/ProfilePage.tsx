import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, Pencil, RefreshCw, UserRound } from 'lucide-react';
import { GamePlatform } from '@shared/types/game';
import { PlayerProfile, ProfileGame, ProfileSectionId } from '@shared/types/profile';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { ALL_SECTIONS, ProfileEditModal, SECTION_LABEL } from './ProfileEditModal';

interface ProfilePageProps {
  onOpenSettings: () => void;
  onSelectGame: (gameId: string) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const buttonBase = `flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium text-slate-100 disabled:opacity-50 transition-colors ${focusRing}`;
const button = `${buttonBase} bg-slate-800/90 hover:bg-slate-700`;

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

const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : '');

const SectionTitle: React.FC<{ children: React.ReactNode; extra?: React.ReactNode }> = ({ children, extra }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3">
    <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-200">{children}</h2>
    {extra && <span className="text-xs text-slate-400">{extra}</span>}
  </div>
);

const Cover: React.FC<{ game: ProfileGame; onOpen: () => void }> = ({ game, onOpen }) => (
  <button onClick={onOpen} title={game.title} className={`group text-left rounded-sm ${focusRing}`}>
    <span className="block aspect-[2/3] rounded-sm overflow-hidden bg-slate-800 ring-1 ring-black/30">
      {game.coverUrl ? (
        <img src={game.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
      ) : (
        <span className="h-full flex items-center justify-center p-2 text-center text-[11px] text-slate-400">{game.title}</span>
      )}
    </span>
    <span className="block mt-1.5 text-xs text-slate-200 truncate">{game.title}</span>
    <span className="block text-[11px] text-slate-500">{hours(game.playtimeSeconds)}</span>
  </button>
);

const Progress: React.FC<{ game: ProfileGame }> = ({ game }) => {
  if (!game.achievementsTotal) return null;
  const percent = Math.round(((game.achievementsUnlocked ?? 0) / game.achievementsTotal) * 100);
  return (
    <span className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
      <span className="flex-1 max-w-[220px] h-1 bg-black/40 rounded-sm overflow-hidden">
        <span className="block h-full bg-indigo-400" style={{ width: `${percent}%` }} />
      </span>
      {game.achievementsUnlocked}/{game.achievementsTotal} conquistas
    </span>
  );
};

const GameRow: React.FC<{ game: ProfileGame; primary: string; onOpen: () => void }> = ({ game, primary, onOpen }) => (
  <button onClick={onOpen} className={`w-full flex items-center gap-3 p-2 text-left rounded-sm hover:bg-black/25 transition-colors ${focusRing}`}>
    <span className="w-[120px] aspect-[184/69] flex-shrink-0 rounded-sm overflow-hidden bg-slate-800">
      {(game.heroUrl || game.coverUrl) && <img src={game.heroUrl || game.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm text-slate-100 truncate">{game.title}</span>
      <Progress game={game} />
    </span>
    <span className="flex-shrink-0 text-right">
      <span className="block text-sm text-slate-100">{primary}</span>
      {game.lastPlayedAt && <span className="block text-[11px] text-slate-500">{shortDate(game.lastPlayedAt)}</span>}
    </span>
  </button>
);

export const ProfilePage: React.FC<ProfilePageProps> = ({ onOpenSettings, onSelectGame }) => {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'sync' | 'export' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [editing, setEditing] = useState(false);
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
        text: `Conquistas atualizadas em ${result?.synced ?? 0} jogo(s)${result?.failed ? `; ${result.failed} falharam (sem conexão?)` : ''}.`
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
  const banner = profile.bannerUrl || profile.recentGames[0]?.heroUrl || profile.mostPlayed[0]?.heroUrl;
  const levelColor = profile.steamLevel !== undefined ? LEVEL_COLORS[Math.floor(profile.steamLevel / 10) % 10] : undefined;
  const maxPlatform = Math.max(1, ...profile.byPlatform.map((p) => p.playtimeSeconds));
  const sections = profile.custom.sections ?? ALL_SECTIONS;
  const completion = t.achievementsTotal ? Math.round((t.achievementsUnlocked / t.achievementsTotal) * 100) : undefined;
  const showcase = profile.featuredAchievements.length > 0 ? profile.featuredAchievements : profile.rarestAchievements.map((a) => ({ ...a, key: `${a.gameId}-${a.name}` }));

  const stats = [
    { label: 'Horas jogadas', value: hours(t.playtimeSeconds) },
    { label: 'Jogos', value: t.playedGames.toLocaleString('pt-BR') },
    { label: 'Conquistas', value: t.achievementsUnlocked.toLocaleString('pt-BR') },
    { label: 'Conclusão', value: completion !== undefined ? `${completion}%` : '—' },
    { label: 'Jogos 100%', value: String(t.perfectGames) }
  ];

  const renderSection = (id: ProfileSectionId) => {
    if (id === 'featured') {
      if (profile.featuredGames.length === 0) {
        return (
          <section key={id}>
            <SectionTitle>{SECTION_LABEL[id]}</SectionTitle>
            <button onClick={() => setEditing(true)} className={`w-full py-8 text-xs text-slate-400 border border-dashed border-slate-700 rounded-sm hover:text-white hover:border-slate-500 ${focusRing}`}>
              Escolha os jogos que representam você
            </button>
          </section>
        );
      }
      return (
        <section key={id}>
          <SectionTitle>{SECTION_LABEL[id]}</SectionTitle>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {showcase.map((a) => (
              <button
                key={a.key}
                onClick={() => onSelectGame(a.gameId)}
                className={`flex items-center gap-3 p-2 text-left bg-steam-panel/80 rounded-sm hover:bg-black/30 transition-colors ${focusRing}`}
              >
                {a.iconUrl && <img src={a.iconUrl} alt="" loading="lazy" className="w-11 h-11 rounded-sm flex-shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-100 truncate">{a.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{a.gameTitle}</span>
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
          <SectionTitle extra={profile.recentPlaytimeSeconds ? `${hours(profile.recentPlaytimeSeconds)} em 2 semanas` : undefined}>{SECTION_LABEL[id]}</SectionTitle>
          <div className="bg-steam-panel/80 rounded-sm p-1">
            {rows.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">Nenhum jogo nas últimas 2 semanas.</p>
            ) : (
              rows.map((g) => <GameRow key={g.id} game={g} primary={hours(g.recentSeconds ?? 0)} onOpen={() => onSelectGame(g.id)} />)
            )}
          </div>
        </section>
      );
    }
    if (id === 'screenshots') {
      if (profile.screenshots.length === 0) return null;
      return (
        <section key={id}>
          <SectionTitle>{SECTION_LABEL[id]}</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {profile.screenshots.map((shot) => (
              <button key={shot.url} onClick={() => onSelectGame(shot.gameId)} title={shot.gameTitle} className={`aspect-video rounded-sm overflow-hidden bg-slate-800 hover:brightness-110 ${focusRing}`}>
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
        <div className="bg-steam-panel/80 rounded-sm p-1">
          {profile.mostPlayed.map((g) => (
            <GameRow key={g.id} game={g} primary={hours(g.playtimeSeconds)} onOpen={() => onSelectGame(g.id)} />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-full bg-steam-bg pb-10">
      {/* Banner + identidade */}
      <div className="relative h-52 overflow-hidden bg-slate-900">
        {banner && <img src={banner} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-steam-bg via-steam-bg/40 to-transparent" />
      </div>

      <div className="max-w-5xl mx-auto px-8">
        <header className="relative -mt-16 flex flex-wrap items-end gap-5">
          <div className="w-32 h-32 flex-shrink-0 rounded-sm overflow-hidden bg-slate-800 ring-4 ring-steam-bg">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="h-full flex items-center justify-center">
                <UserRound className="w-12 h-12 text-slate-500" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-[220px] pb-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl text-white truncate">{profile.displayName}</h1>
              {profile.steamLevel !== undefined && (
                <span className="flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs text-slate-100" style={{ borderColor: levelColor }} title="Nível da conta Steam">
                  {profile.steamLevel}
                </span>
              )}
            </div>
            <p className={`mt-0.5 text-sm ${playingTitle ? 'text-[#a3cf06]' : 'text-[#57cbde]'}`}>{playingTitle ? `Jogando ${playingTitle}` : 'Online'}</p>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <button onClick={() => setEditing(true)} className={`${buttonBase} bg-indigo-600 hover:bg-indigo-500`}>
              <Pencil className="w-3.5 h-3.5" /> Editar perfil
            </button>
            <button onClick={handleSync} disabled={busy !== null} className={button} title="Buscar as conquistas de todos os jogos">
              {busy === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Atualizar
            </button>
            <button onClick={handleExport} disabled={busy !== null} className={button}>
              {busy === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Exportar
            </button>
          </div>
        </header>

        {profile.custom.bio && <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{profile.custom.bio}</p>}

        {feedback && (
          <p className={`mt-4 flex items-start gap-2 px-3 py-2 rounded-sm border text-xs break-all ${feedback.tone === 'ok' ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/60 border-amber-500/30 text-amber-300'}`}>
            {feedback.tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
            {feedback.text}
          </p>
        )}

        {/* Números principais */}
        <dl className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-px bg-black/30 rounded-sm overflow-hidden">
          {stats.map((s) => (
            <div key={s.label} className="bg-steam-panel px-4 py-3">
              <dd className="text-xl text-white">{s.value}</dd>
              <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-400">{s.label}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-8 items-start">
          <div className="space-y-7 min-w-0">{sections.map(renderSection)}</div>
          <aside className="space-y-7">
            <section>
              <SectionTitle>Plataformas</SectionTitle>
              <div className="space-y-2.5">
                {profile.byPlatform.map((p) => (
                  <div key={p.platform} className="text-xs">
                    <div className="flex justify-between gap-2 text-slate-300">
                      <span>{PLATFORM_LABEL[p.platform]}</span>
                      <span className="text-slate-500">{hours(p.playtimeSeconds)}</span>
                    </div>
                    <div className="mt-1 h-1 bg-black/40 rounded-sm overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${(p.playtimeSeconds / maxPlatform) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {profile.recentAchievements.length > 0 && (
              <section>
                <SectionTitle>Últimas conquistas</SectionTitle>
                <div className="grid grid-cols-5 gap-1.5">
                  {profile.recentAchievements.map((a) => (
                    <button key={`${a.gameId}-${a.name}`} onClick={() => onSelectGame(a.gameId)} title={`${a.name} — ${a.gameTitle}`} className={`aspect-square rounded-sm overflow-hidden bg-slate-800 ${focusRing}`}>
                      {a.iconUrl && <img src={a.iconUrl} alt={a.name} loading="lazy" className="w-full h-full object-cover" />}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {profile.favorites.length > 0 && (
              <section>
                <SectionTitle>Favoritos</SectionTitle>
                <div className="grid grid-cols-4 gap-1.5">
                  {profile.favorites.slice(0, 12).map((g) => (
                    <button key={g.id} onClick={() => onSelectGame(g.id)} title={g.title} className={`aspect-[2/3] rounded-sm overflow-hidden bg-slate-800 ${focusRing}`}>
                      {g.coverUrl && <img src={g.coverUrl} alt={g.title} loading="lazy" className="w-full h-full object-cover" />}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <button onClick={onOpenSettings} className={`text-xs text-slate-400 hover:text-white rounded-sm ${focusRing}`}>
              Contas e configurações
            </button>
          </aside>
        </div>
      </div>

      {editing && <ProfileEditModal profile={profile} onClose={() => setEditing(false)} onSaved={load} />}
    </div>
  );
};
