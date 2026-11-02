import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Settings, UserRound } from 'lucide-react';
import { GamePlatform } from '@shared/types/game';
import { PlayerProfile, ProfileGame } from '@shared/types/profile';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface ProfilePageProps {
  onOpenSettings: () => void;
  onSelectGame: (gameId: string) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const subtleButton = `flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors ${focusRing}`;

const PLATFORM_LABEL: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG',
  riot: 'Riot Games',
  xbox: 'Xbox',
  emulator: 'Emuladores',
  standalone: 'Outros PC'
};

// Cores do anel de nível da Steam por dezena
const LEVEL_COLORS = ['#9b9b9b', '#c02942', '#d95b43', '#fecc23', '#467a3c', '#4e8ddb', '#7652c9', '#c252c9', '#542437', '#997c52'];

type Feedback = { tone: 'ok' | 'warn'; text: string } | null;

const hours = (seconds = 0) => {
  const h = seconds / 3600;
  return h < 1 && seconds > 0 ? `${Math.max(1, Math.round(seconds / 60))} min` : `${h.toFixed(1).replace('.', ',')} h`;
};

const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : '';

const Box: React.FC<{ title: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, extra, children }) => (
  <section className="bg-steam-panel/80 border border-black/30 rounded-sm">
    <header className="flex items-baseline justify-between gap-3 px-4 py-2.5 border-b border-black/30 bg-black/10">
      <h2 className="text-sm text-slate-100">{title}</h2>
      {extra && <span className="text-xs text-slate-400">{extra}</span>}
    </header>
    <div className="p-4">{children}</div>
  </section>
);

const AchievementBar: React.FC<{ game: ProfileGame }> = ({ game }) => {
  if (!game.achievementsTotal) return null;
  const percent = Math.round(((game.achievementsUnlocked ?? 0) / game.achievementsTotal) * 100);
  return (
    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
      <span className="flex-shrink-0">
        Conquistas {game.achievementsUnlocked} de {game.achievementsTotal}
      </span>
      <span className="flex-1 h-1.5 bg-black/40 rounded-sm overflow-hidden">
        <span className="block h-full bg-indigo-500" style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
};

const GameActivityRow: React.FC<{ game: ProfileGame; onOpen: () => void; showRecent: boolean }> = ({ game, onOpen, showRecent }) => (
  <button onClick={onOpen} className={`w-full flex gap-4 p-2.5 text-left bg-black/15 hover:bg-black/30 rounded-sm transition-colors ${focusRing}`}>
    <span className="w-[184px] aspect-[184/69] flex-shrink-0 rounded-sm overflow-hidden bg-slate-800">
      {game.heroUrl || game.coverUrl ? (
        <img src={game.heroUrl || game.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : null}
    </span>
    <span className="flex-1 min-w-0 py-0.5">
      <span className="flex items-start justify-between gap-3">
        <span className="text-[15px] text-slate-100 truncate">{game.title}</span>
        <span className="text-right text-xs text-slate-400 flex-shrink-0">
          {showRecent && game.recentSeconds ? (
            <>
              {hours(game.recentSeconds)} nas últimas 2 semanas
              <br />
            </>
          ) : null}
          {hours(game.playtimeSeconds)} no total
          {game.lastPlayedAt && (
            <>
              <br />
              <span className="text-slate-500">jogado em {shortDate(game.lastPlayedAt)}</span>
            </>
          )}
        </span>
      </span>
      <AchievementBar game={game} />
    </span>
  </button>
);

export const ProfilePage: React.FC<ProfilePageProps> = ({ onOpenSettings, onSelectGame }) => {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'sync' | 'export' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
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

  const handleSync = async () => {
    setBusy('sync');
    setFeedback(null);
    try {
      const result = await window.electronAPI?.syncAllAchievements();
      await load();
      setFeedback({
        tone: result?.failed ? 'warn' : 'ok',
        text: `Conquistas atualizadas em ${result?.synced ?? 0} jogo(s)${result?.failed ? `; ${result.failed} falharam (sem conexão?)` : ''}.`
      });
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    setBusy('export');
    setFeedback(null);
    try {
      const path = await window.electronAPI?.exportPlayerProfile();
      if (path) setFeedback({ tone: 'ok', text: `Perfil exportado para ${path}. Coloque-o ao lado da página web do perfil para publicá-lo.` });
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
        <AlertTriangle className="w-8 h-8 text-amber-400/80" />
        <p className="text-sm text-slate-300">{error}</p>
        <button onClick={load} className={subtleButton}>
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
  const backdrop = profile.recentGames[0]?.heroUrl || profile.mostPlayed[0]?.heroUrl;
  const levelColor = profile.steamLevel !== undefined ? LEVEL_COLORS[Math.min(9, Math.floor(profile.steamLevel / 10) % 10)] : undefined;
  const maxPlatform = Math.max(1, ...profile.byPlatform.map((p) => p.playtimeSeconds));
  const recentRows = profile.recentGames.slice(0, 5);

  return (
    <div className="min-h-full bg-steam-bg">
      {/* Cabeçalho do perfil */}
      <header className="relative overflow-hidden border-b border-black/40">
        {backdrop && <img src={backdrop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 blur-sm scale-110" />}
        <div className="absolute inset-0 bg-gradient-to-b from-steam-bg/40 to-steam-bg" />
        <div className="relative max-w-6xl mx-auto px-8 py-8 flex flex-wrap items-center gap-6">
          <div className="w-[136px] h-[136px] flex-shrink-0 p-[3px] bg-gradient-to-b from-[#4f94bc] to-[#2a475e]">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                <UserRound className="w-14 h-14 text-slate-500" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-[26px] leading-tight text-white">{profile.displayName}</h1>
            <p className={`mt-1 text-sm ${playingTitle ? 'text-[#a3cf06]' : 'text-[#57cbde]'}`}>
              {playingTitle ? `Jogando agora: ${playingTitle}` : 'Online'}
            </p>
            <p className="mt-3 text-xs text-slate-400">
              {hours(t.playtimeSeconds)} jogadas em {t.playedGames} de {t.games} jogos
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            {profile.steamLevel !== undefined && (
              <div className="flex items-center gap-3 text-lg text-slate-100">
                Nível
                <span
                  className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-base"
                  style={{ borderColor: levelColor }}
                  title="Nível da sua conta Steam"
                >
                  {profile.steamLevel}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={onOpenSettings} className={subtleButton}>
                <Settings className="w-3.5 h-3.5" /> Contas e configurações
              </button>
              <button onClick={handleExport} disabled={busy !== null} className={subtleButton}>
                {busy === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Exportar perfil
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-8 py-6 space-y-4">
        {feedback && (
          <div
            className={`flex items-start gap-2 px-3 py-2 rounded-sm border text-xs ${
              feedback.tone === 'ok' ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/60 border-amber-500/30 text-amber-300'
            }`}
          >
            {feedback.tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
            <span className="break-all">{feedback.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <Box title="Atividade recente" extra={profile.recentPlaytimeSeconds ? `${hours(profile.recentPlaytimeSeconds)} nas últimas 2 semanas` : undefined}>
              {recentRows.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum jogo nas últimas 2 semanas.</p>
              ) : (
                <div className="space-y-2">
                  {recentRows.map((g) => (
                    <GameActivityRow key={g.id} game={g} showRecent onOpen={() => onSelectGame(g.id)} />
                  ))}
                </div>
              )}
            </Box>

            {profile.screenshots.length > 0 && (
              <Box title="Vitrine de capturas">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {profile.screenshots.map((shot) => (
                    <button
                      key={shot.url}
                      onClick={() => onSelectGame(shot.gameId)}
                      title={`${shot.gameTitle} · ${shortDate(shot.takenAt)}`}
                      className={`group relative aspect-video rounded-sm overflow-hidden bg-slate-800 ${focusRing}`}
                    >
                      <img src={shot.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover group-hover:brightness-110" />
                      <span className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-black/60 text-[10px] text-slate-200 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                        {shot.gameTitle}
                      </span>
                    </button>
                  ))}
                </div>
              </Box>
            )}

            <Box title="Mais jogados">
              {profile.mostPlayed.length === 0 ? (
                <p className="text-xs text-slate-500">Jogue algo pelo Lazulium ou conecte a Steam para ver suas horas.</p>
              ) : (
                <div className="space-y-2">
                  {profile.mostPlayed.map((g) => (
                    <GameActivityRow key={g.id} game={g} showRecent={false} onOpen={() => onSelectGame(g.id)} />
                  ))}
                </div>
              )}
            </Box>
          </div>

          <aside className="space-y-4">
            <Box title="Resumo">
              <dl className="space-y-2 text-sm">
                {[
                  ['Jogos', String(t.games)],
                  ['Horas jogadas', hours(t.playtimeSeconds)],
                  ['Conquistas', t.achievementsTotal ? `${t.achievementsUnlocked} de ${t.achievementsTotal}` : '—'],
                  ['Jogos 100%', String(t.perfectGames)],
                  ['Favoritos', String(t.favorites)]
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-slate-400">{label}</dt>
                    <dd className="text-slate-100">{value}</dd>
                  </div>
                ))}
              </dl>
              <button onClick={handleSync} disabled={busy !== null} className={`${subtleButton} w-full justify-center mt-4`}>
                {busy === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Atualizar conquistas
              </button>
            </Box>

            {profile.recentAchievements.length > 0 && (
              <Box title="Conquistas recentes">
                <div className="grid grid-cols-5 gap-1.5">
                  {profile.recentAchievements.map((a) => (
                    <button
                      key={`${a.gameId}-${a.name}`}
                      onClick={() => onSelectGame(a.gameId)}
                      title={`${a.name} — ${a.gameTitle}${a.unlockedAt ? ` (${shortDate(a.unlockedAt)})` : ''}`}
                      className={`aspect-square rounded-sm overflow-hidden bg-slate-800 ${focusRing}`}
                    >
                      {a.iconUrl && <img src={a.iconUrl} alt={a.name} className="w-full h-full object-cover" />}
                    </button>
                  ))}
                </div>
              </Box>
            )}

            {profile.rarestAchievements.length > 0 && (
              <Box title="Conquistas mais raras">
                <div className="space-y-2">
                  {profile.rarestAchievements.slice(0, 4).map((a) => (
                    <button
                      key={`${a.gameId}-${a.name}`}
                      onClick={() => onSelectGame(a.gameId)}
                      className={`w-full flex items-center gap-2.5 text-left rounded-sm hover:bg-black/20 ${focusRing}`}
                    >
                      {a.iconUrl && <img src={a.iconUrl} alt="" className="w-9 h-9 rounded-sm flex-shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-slate-100 truncate">{a.name}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{a.gameTitle}</span>
                      </span>
                      <span className="text-[11px] text-indigo-300 flex-shrink-0">{a.globalPercent.toFixed(1).replace('.', ',')}%</span>
                    </button>
                  ))}
                </div>
              </Box>
            )}

            <Box title="Plataformas">
              <div className="space-y-2">
                {profile.byPlatform.map((p) => (
                  <div key={p.platform} className="text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>{PLATFORM_LABEL[p.platform]}</span>
                      <span className="text-slate-500">
                        {p.games} · {hours(p.playtimeSeconds)}
                      </span>
                    </div>
                    <div className="mt-1 h-1 bg-black/40 rounded-sm overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${(p.playtimeSeconds / maxPlatform) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Box>

            {profile.favorites.length > 0 && (
              <Box title="Favoritos">
                <div className="grid grid-cols-4 gap-1.5">
                  {profile.favorites.slice(0, 12).map((g) => (
                    <button
                      key={g.id}
                      onClick={() => onSelectGame(g.id)}
                      title={g.title}
                      className={`aspect-[2/3] rounded-sm overflow-hidden bg-slate-800 ${focusRing}`}
                    >
                      {g.coverUrl && <img src={g.coverUrl} alt={g.title} loading="lazy" className="w-full h-full object-cover" />}
                    </button>
                  ))}
                </div>
              </Box>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};
