import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Download, Flame, Gamepad2, Loader2, RefreshCw, Trophy, UserRound, X } from 'lucide-react';
import { GamePlatform } from '@shared/types/game';
import { PlayerProfile, ProfileGame } from '@shared/types/profile';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface ProfilePanelProps {
  onClose: () => void;
  onOpenSettings: () => void;
  onSelectGame: (gameId: string) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const PLATFORM_LABEL: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG',
  emulator: 'Emuladores',
  standalone: 'Avulsos'
};

type Feedback = { tone: 'ok' | 'warn'; text: string } | null;

const hours = (seconds: number) => `${(seconds / 3600).toFixed(1).replace('.', ',')} h`;

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({ icon, label, value, hint }) => (
  <div className="px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-800">
    <p className="flex items-center gap-1.5 text-[11px] text-slate-400">{icon} {label}</p>
    <p className="text-xl font-extrabold text-white mt-1">{value}</p>
    {hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const GameTile: React.FC<{ game: ProfileGame; onClick: () => void }> = ({ game, onClick }) => (
  <button onClick={onClick} className={`group text-left ${focusRing} rounded-lg`} title={game.title}>
    <div className="aspect-[2/3] rounded-lg overflow-hidden bg-slate-800 border border-slate-800 group-hover:border-indigo-400 transition-colors">
      {game.coverUrl ? (
        <img src={game.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-2 text-center text-[11px] text-slate-400">{game.title}</div>
      )}
    </div>
    <p className="mt-1 text-[11px] text-slate-300 truncate">{game.title}</p>
    <p className="text-[10px] text-slate-500">{hours(game.playtimeSeconds)}</p>
  </button>
);

export const ProfilePanel: React.FC<ProfilePanelProps> = ({ onClose, onOpenSettings, onSelectGame }) => {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'sync' | 'export' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      if (path) setFeedback({ tone: 'ok', text: `Perfil exportado para ${path}` });
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const openGame = (id: string) => {
    onSelectGame(id);
    onClose();
  };

  const t = profile?.totals;
  const maxPlatform = Math.max(1, ...(profile?.byPlatform.map((p) => p.playtimeSeconds) ?? [1]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-[#0d0f17] border border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-10 h-10 rounded-lg border border-slate-700" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                <UserRound className="w-5 h-5 text-slate-400" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-white truncate">{profile?.displayName ?? 'Perfil'}</h2>
              <p className="text-[11px] text-slate-500">Perfil do jogador · todas as plataformas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSync} disabled={busy !== null || !profile} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}>
              {busy === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Atualizar conquistas
            </button>
            <button onClick={handleExport} disabled={busy !== null || !profile} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}>
              {busy === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Exportar
            </button>
            <button onClick={onClose} className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {feedback && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${feedback.tone === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
              {feedback.tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
              <span className="break-all">{feedback.text}</span>
            </div>
          )}

          {error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400/80" />
              <p className="text-xs text-slate-300">{error}</p>
              <button onClick={load} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 ${focusRing}`}>
                <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
              </button>
            </div>
          ) : !profile || !t ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Montando seu perfil...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat icon={<Clock className="w-3.5 h-3.5 text-indigo-400" />} label="Horas jogadas" value={hours(t.playtimeSeconds)} hint={`em ${t.playedGames} de ${t.games} jogos`} />
                <Stat
                  icon={<Trophy className="w-3.5 h-3.5 text-amber-400" />}
                  label="Conquistas"
                  value={`${t.achievementsUnlocked}/${t.achievementsTotal}`}
                  hint={t.gamesWithAchievementData ? `em ${t.gamesWithAchievementData} jogo(s) sincronizados` : 'nenhum jogo sincronizado ainda'}
                />
                <Stat icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />} label="Jogos 100%" value={String(t.perfectGames)} />
                <Stat icon={<Flame className="w-3.5 h-3.5 text-amber-400" />} label="Favoritos" value={String(t.favorites)} />
              </div>

              {t.gamesWithAchievementData === 0 && (
                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-400">
                  <span>Entre com a Steam ou o RetroAchievements e clique em “Atualizar conquistas” para montar sua vitrine.</span>
                  <button onClick={onOpenSettings} className={`flex-shrink-0 px-2 py-1 rounded text-indigo-300 hover:bg-indigo-500/10 ${focusRing}`}>
                    Abrir Contas
                  </button>
                </div>
              )}

              {profile.byPlatform.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <Gamepad2 className="w-3.5 h-3.5 text-indigo-400" /> Por plataforma
                  </h3>
                  {profile.byPlatform.map((p) => (
                    <div key={p.platform} className="flex items-center gap-3 text-xs">
                      <span className="w-24 text-slate-300">{PLATFORM_LABEL[p.platform]}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(p.playtimeSeconds / maxPlatform) * 100}%` }} />
                      </div>
                      <span className="w-32 text-right text-slate-400">
                        {hours(p.playtimeSeconds)} · {p.games} jogo(s)
                      </span>
                    </div>
                  ))}
                </section>
              )}

              {profile.rarestAchievements.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" /> Conquistas mais raras
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {profile.rarestAchievements.map((a) => (
                      <button
                        key={`${a.gameId}-${a.name}`}
                        onClick={() => openGame(a.gameId)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-amber-400/50 text-left ${focusRing}`}
                      >
                        {a.iconUrl ? <img src={a.iconUrl} alt="" className="w-10 h-10 rounded" /> : <Trophy className="w-10 h-10 p-2 text-amber-400" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-100 truncate">{a.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{a.gameTitle}</p>
                        </div>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-bold">{a.globalPercent.toFixed(1).replace('.', ',')}%</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {[
                { title: 'Mais jogados', icon: <Clock className="w-3.5 h-3.5 text-indigo-400" />, games: profile.mostPlayed },
                { title: 'Favoritos', icon: <Flame className="w-3.5 h-3.5 text-amber-400" />, games: profile.favorites },
                { title: 'Jogados recentemente', icon: <RefreshCw className="w-3.5 h-3.5 text-slate-400" />, games: profile.recentlyPlayed }
              ]
                .filter((s) => s.games.length > 0)
                .map((s) => (
                  <section key={s.title} className="space-y-2">
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      {s.icon} {s.title}
                    </h3>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      {s.games.map((g) => (
                        <GameTile key={g.id} game={g} onClick={() => openGame(g.id)} />
                      ))}
                    </div>
                  </section>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
