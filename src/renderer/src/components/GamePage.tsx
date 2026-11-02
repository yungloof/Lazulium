import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Clock, FolderOpen, Image as ImageIcon, Info, Pencil, Save, Star, Trophy, BarChart2, CalendarClock } from 'lucide-react';
import { Game } from '@shared/types/game';
import { GameAchievements } from '@shared/types/achievements';
import { Screenshot } from '@shared/types/screenshots';
import { PlayButton } from './PlayButton';
import { GameStats } from './GameStats';
import { GameLogCard } from './GameLogCard';
import { useLibraryStore } from '../stores/useLibraryStore';

interface GamePageProps {
  game: Game;
  achievements: GameAchievements | null;
  screenshotsVersion: number;       // Muda quando a galeria é alterada (recarrega a prévia)
  onLaunch: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onOpenAchievements: () => void;
  onOpenScreenshots: () => void;
  onOpenSaves: () => void;
  onOpenArtwork: () => void;
  onEditPlaytime: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const MAX_SHOT_PREVIEW = 6;
const MAX_BADGE_PREVIEW = 6;

const PLATFORM_LABEL: Record<Game['platform'], string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG Galaxy',
  riot: 'Riot Games',
  xbox: 'Xbox / Microsoft Store',
  emulator: 'Emulador',
  standalone: 'PC'
};

function formatHours(seconds: number): string {
  if (!seconds || seconds < 60) return 'Nunca jogado';
  const hours = seconds / 3600;
  return hours < 1 ? `${Math.round(seconds / 60)} minutos` : `${hours.toFixed(1).replace('.', ',')} horas`;
}

function formatLastPlayed(iso?: string): string {
  if (!iso) return 'Nunca';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return 'Nunca';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
}

const Card: React.FC<{ title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  action,
  children
}) => (
  <section className="rounded-md bg-slate-900/60 border border-slate-800/80">
    <header className="flex items-center justify-between px-4 pt-3 pb-2">
      <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {icon} {title}
      </h3>
      {action}
    </header>
    <div className="px-4 pb-4">{children}</div>
  </section>
);

const linkButton = `text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 rounded px-1 ${focusRing}`;

export const GamePage: React.FC<GamePageProps> = ({
  game,
  achievements,
  screenshotsVersion,
  onLaunch,
  onToggleFavorite,
  onOpenAchievements,
  onOpenScreenshots,
  onOpenSaves,
  onOpenArtwork,
  onEditPlaytime
}) => {
  const [heroFailed, setHeroFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [shots, setShots] = useState<Screenshot[]>([]);

  useEffect(() => setHeroFailed(false), [game.media?.heroUrl]);
  useEffect(() => setLogoFailed(false), [game.media?.logoUrl]);

  useEffect(() => {
    let cancelled = false;
    setShots([]);
    window.electronAPI
      ?.listScreenshots(game.id)
      .then((list) => !cancelled && setShots(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [game.id, screenshotsVersion]);

  const heroUrl = !heroFailed ? game.media?.heroUrl : undefined;
  const logoUrl = !logoFailed ? game.media?.logoUrl : undefined;
  const hasAchievements = !!achievements && achievements.total > 0;
  const percent = hasAchievements ? Math.round((achievements!.unlocked / achievements!.total) * 100) : 0;
  const badgePreview = hasAchievements
    ? [...achievements!.items].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)).slice(0, MAX_BADGE_PREVIEW)
    : [];
  const canEditPlaytime = game.platform !== 'steam';
  // Conquistas vêm da Steam e do RetroAchievements; outras plataformas não têm de onde buscar
  const supportsAchievements = game.platform === 'steam' || game.platform === 'emulator';

  const launchStatus = useLibraryStore((s) => s.launchStatuses[game.id]);
  const isRunning = launchStatus?.state === 'running';
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const runningMinutes = useMemo(() => {
    if (!isRunning) return 0;
    const start = launchStatus?.startTime ? new Date(launchStatus.startTime).getTime() : now;
    return Math.max(1, Math.floor((now - start) / 60000));
  }, [isRunning, launchStatus?.startTime, now]);

  return (
    <div className="min-h-full">
      {/* Banner (hero) com logo */}
      <div className="relative h-[300px] lg:h-[340px] overflow-hidden bg-slate-900">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => {
              setHeroFailed(true);
              window.electronAPI?.reportBrokenArtwork(game.id, 'hero');
            }}
          />
        ) : game.media?.coverUrl ? (
          <img src={game.media.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-50" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0e1426] via-[#0e1426]/30 to-transparent" />
        <div className="absolute left-8 bottom-6 right-8">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={game.title}
              title={game.title}
              className="max-h-28 max-w-[min(460px,60%)] object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]"
              onError={() => {
                setLogoFailed(true);
                window.electronAPI?.reportBrokenArtwork(game.id, 'logo');
              }}
            />
          ) : (
            <h1 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">{game.title}</h1>
          )}
        </div>
      </div>

      {/* Barra de ação (estilo Steam) */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-8 gap-y-3 px-8 py-3 bg-[#121a24]/95 backdrop-blur-md border-y border-slate-800/80">
        <div className="flex items-center gap-3">
          <PlayButton game={game} onLaunch={onLaunch} />
          {isRunning && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Jogando há {runningMinutes} min</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <CalendarClock className="w-5 h-5 text-slate-500" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Última sessão</p>
            <p className="text-xs text-slate-300">{formatLastPlayed(game.lastPlayedAt)}</p>
          </div>
        </div>

        <button
          onClick={canEditPlaytime ? onEditPlaytime : undefined}
          disabled={!canEditPlaytime}
          title={canEditPlaytime ? 'Ajustar tempo jogado' : 'Tempo importado da Steam'}
          className={`group flex items-center gap-2.5 text-left rounded-md -mx-1.5 px-1.5 py-0.5 ${canEditPlaytime ? `hover:bg-slate-800/70 ${focusRing}` : 'cursor-default'}`}
        >
          <Clock className="w-5 h-5 text-slate-500" />
          <div>
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Tempo de jogo
              {canEditPlaytime && <Pencil className="w-2.5 h-2.5 text-indigo-400" />}
            </p>
            <p className="text-xs text-slate-300">{formatHours(game.totalPlaytimeSeconds)}</p>
          </div>
        </button>

        {supportsAchievements && (
        <button
          onClick={onOpenAchievements}
          className={`flex items-center gap-2.5 text-left rounded-md -mx-1.5 px-1.5 py-0.5 hover:bg-slate-800/70 ${focusRing}`}
          title="Ver conquistas"
        >
          <Trophy className="w-5 h-5 text-slate-500" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conquistas</p>
            {hasAchievements ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300">
                  {achievements!.unlocked}/{achievements!.total}
                </span>
                <span className="w-20 h-1 rounded-full bg-slate-700 overflow-hidden">
                  <span className="block h-full bg-indigo-400" style={{ width: `${percent}%` }} />
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Ver</p>
            )}
          </div>
        </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {[
            { label: 'Capturas', icon: <Camera className="w-4 h-4" />, onClick: onOpenScreenshots },
            { label: 'Backup de saves', icon: <Save className="w-4 h-4" />, onClick: onOpenSaves },
            { label: 'Trocar artes', icon: <ImageIcon className="w-4 h-4" />, onClick: onOpenArtwork }
          ].map((b) => (
            <button
              key={b.label}
              onClick={b.onClick}
              title={b.label}
              aria-label={b.label}
              className={`p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors ${focusRing}`}
            >
              {b.icon}
            </button>
          ))}
          <button
            onClick={() => onToggleFavorite(game.id)}
            title={game.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
            aria-label={game.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
            className={`p-2.5 rounded-lg transition-colors ${focusRing} ${
              game.isFavorite ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Star className={`w-4 h-4 ${game.isFavorite ? 'fill-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-8 py-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
        <div className="space-y-5 min-w-0">
          <GameLogCard game={game} />

          <Card
            title="Capturas de tela"
            icon={<Camera className="w-3.5 h-3.5 text-indigo-400" />}
            action={
              <button onClick={onOpenScreenshots} className={linkButton}>
                {shots.length > 0 ? `Ver todas (${shots.length})` : 'Anexar imagens'}
              </button>
            }
          >
            {shots.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nenhuma captura ainda. Fotos com F12 na Steam e Win+Alt+PrtScn aparecem aqui sozinhas.
              </p>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {shots.slice(0, MAX_SHOT_PREVIEW).map((shot) => (
                  <button
                    key={shot.id}
                    onClick={onOpenScreenshots}
                    className={`aspect-video rounded-md overflow-hidden bg-slate-800 border border-slate-800 hover:border-indigo-400 transition-colors ${focusRing}`}
                  >
                    <img src={shot.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Atividade" icon={<BarChart2 className="w-3.5 h-3.5 text-indigo-400" />}>
            <GameStats game={game} collapsible={false} />
          </Card>
        </div>

        <div className="space-y-5">
          {supportsAchievements && (
          <Card
            title="Conquistas"
            icon={<Trophy className="w-3.5 h-3.5 text-amber-400" />}
            action={
              <button onClick={onOpenAchievements} className={linkButton}>
                {hasAchievements ? 'Ver todas' : 'Abrir'}
              </button>
            }
          >
            {hasAchievements ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-300">
                    {achievements!.unlocked}/{achievements!.total} alcançadas <span className="text-slate-500">({percent}%)</span>
                  </p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {badgePreview.map((a) => (
                    <img
                      key={a.id}
                      src={a.unlocked ? a.iconUrl : a.iconLockedUrl || a.iconUrl}
                      alt={a.name}
                      title={`${a.name}${a.unlocked ? '' : ' (bloqueada)'}`}
                      className={`w-9 h-9 rounded ${a.unlocked ? '' : 'grayscale opacity-50'}`}
                    />
                  ))}
                  {achievements!.total > badgePreview.length && (
                    <button
                      onClick={onOpenAchievements}
                      className={`w-9 h-9 rounded bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 ${focusRing}`}
                    >
                      +{achievements!.total - badgePreview.length}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                {achievements?.warning ?? 'Abra para sincronizar as conquistas deste jogo.'}
              </p>
            )}
          </Card>
          )}

          <Card title="Informações" icon={<Info className="w-3.5 h-3.5 text-slate-400" />}>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Plataforma</dt>
                <dd className="text-slate-300 text-right">
                  {game.platform === 'emulator' ? `Emulador · ${game.emulatorId ?? ''}` : PLATFORM_LABEL[game.platform]}
                  {game.manualPlatform && ` · ${game.manualPlatform}`}
                  {game.id.startsWith('steam-shortcut-') && ' (atalho da Steam)'}
                  {game.familyShared && ' · Família Steam'}
                  {game.isInstalled === false && !game.manualEntry && ' · não instalado'}
                </dd>
              </div>
              {game.installPath && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 flex-shrink-0 flex items-center gap-1">
                    <FolderOpen className="w-3 h-3" /> Pasta
                  </dt>
                  <dd className="text-slate-300 text-right truncate" title={game.installPath}>
                    {game.installPath}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Na biblioteca desde</dt>
                <dd className="text-slate-300">{game.createdAt ? new Date(game.createdAt).toLocaleDateString('pt-BR') : '—'}</dd>
              </div>
            </dl>
            <button
              onClick={onOpenSaves}
              className={`mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 ${focusRing}`}
            >
              <Save className="w-3.5 h-3.5 text-sky-400" /> Backup de saves
            </button>
          </Card>

          {game.media?.coverUrl && (
            <div className="hidden xl:flex justify-center">
              <img src={game.media.coverUrl} alt="" className="w-40 rounded-lg border border-slate-800 shadow-xl" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
