import React, { useEffect, useState } from 'react';
import {
  BarChart2,
  CalendarClock,
  Camera,
  Clock,
  FolderOpen,
  Hourglass,
  Image as ImageIcon,
  ImagePlus,
  Info,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Save,
  Star,
  Trophy,
  Users
} from 'lucide-react';
import { Game, GamePlayLength, hasConsistentTimes, isWeakPlayLength } from '@shared/types/game';
import { GameAchievements, achievementSourceLabel } from '@shared/types/achievements';
import { Screenshot } from '@shared/types/screenshots';
import { PlayButton } from './PlayButton';
import { GameStats } from './GameStats';
import { GameLogCard } from './GameLogCard';
import { LOG_STATUS } from './GameLogFields';
import { useLibraryStore } from '../stores/useLibraryStore';
import { GameModalKind, useUiStore } from '../stores/useUiStore';
import { formatLastPlayed, formatPlaytimeLong } from '../utils/format';
import { PLATFORM_FULL } from '../utils/platform';
import { launchGame, openGameFolder, toggleFavorite } from '../utils/gameActions';
import { Skeleton, buttonClass, chipClass, focusRing, iconButtonSolidClass } from './ui';

interface GamePageProps {
  game: Game;
}

const MAX_SHOT_PREVIEW = 6;
const MAX_BADGE_PREVIEW = 6;
const MENU_WIDTH = 240;

const formatDuration = (hours: number) => (hours < 10 ? String(Math.round(hours * 10) / 10).replace('.', ',') : String(Math.round(hours)));

const formatSpan = (low: number, high: number) =>
  formatDuration(low) === formatDuration(high) ? `${formatDuration(low)} horas` : `${formatDuration(low)} a ${formatDuration(high)} horas`;

function formatPlayLength(length: GamePlayLength): string {
  if (length.openEnded) return 'Sem fim definido';
  // Dados fracos: só a faixa do que existe, sem dizer qual número é campanha
  if (isWeakPlayLength(length)) {
    const times = [length.lowHours, length.typicalHours, length.completeHours].filter((h): h is number => !!h);
    return times.length ? `Cerca de ${formatSpan(Math.min(...times), Math.max(...times))}` : '';
  }
  const { lowHours: low, typicalHours: typical, completeHours: complete } = length;
  if (low && typical) return formatSpan(low, typical);
  if (low || typical) return formatSpan((low ?? typical)!, (low ?? typical)!);
  return complete ? `100% em ${formatDuration(complete)} horas` : '';
}

const submissionsLabel = (count: number) => `${count} ${count === 1 ? 'envio' : 'envios'}`;

const open = (kind: GameModalKind, gameId: string, screenshotId?: string) => useUiStore.getState().openModal({ kind, gameId, screenshotId });

const Card: React.FC<{ title: string; icon: React.ElementType; iconClass?: string; action?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon: Icon,
  iconClass = 'text-indigo-400',
  action,
  children
}) => (
  <section className="rounded-lg bg-steam-panel/70 border border-slate-800/80">
    <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-300">
        <Icon className={`w-3.5 h-3.5 ${iconClass}`} /> {title}
      </h3>
      {action}
    </header>
    <div className="px-5 pb-5">{children}</div>
  </section>
);

const linkButton = `text-[11px] font-semibold text-indigo-300 hover:text-white rounded-sm px-1 transition-colors ${focusRing}`;

// Rótulo + valor da barra de ação
const Stat: React.FC<{ icon: React.ElementType; label: React.ReactNode; children: React.ReactNode }> = ({ icon: Icon, label, children }) => (
  <span className="flex items-center gap-2.5 text-left">
    <Icon className="w-5 h-5 text-slate-500 flex-shrink-0" />
    <span className="min-w-0">
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="block text-[13px] text-slate-100 tabular-nums">{children}</span>
    </span>
  </span>
);

// Página de um jogo com cara de vitrine: arte grande, logo, ação principal e o resto em cartões
export const GamePage: React.FC<GamePageProps> = ({ game }) => {
  const [heroFailed, setHeroFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [shots, setShots] = useState<Screenshot[] | null>(null);
  const [achievements, setAchievements] = useState<GameAchievements | null>(null);
  const [achievementsLoaded, setAchievementsLoaded] = useState(false);
  const [playLength, setPlayLength] = useState<GamePlayLength | null>(null);
  const screenshotsVersion = useUiStore((s) => s.screenshotsVersion);
  const achievementsVersion = useUiStore((s) => s.achievementsVersion);
  const isRunning = useLibraryStore((s) => s.launchStatuses[game.id]?.state === 'running');

  useEffect(() => setHeroFailed(false), [game.media?.heroUrl]);
  useEffect(() => setLogoFailed(false), [game.media?.logoUrl]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      ?.listScreenshots(game.id)
      .then((list) => !cancelled && setShots(list))
      .catch(() => !cancelled && setShots([]));
    return () => {
      cancelled = true;
    };
  }, [game.id, screenshotsVersion]);

  // Conquistas do cache local; a sincronização acontece no painel e avisa por achievementsVersion
  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      ?.getAchievements(game.id)
      .then((res) => !cancelled && setAchievements(res))
      .catch(() => undefined)
      .finally(() => !cancelled && setAchievementsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [game.id, achievementsVersion]);

  useEffect(() => {
    let cancelled = false;
    setPlayLength(null);
    window.electronAPI
      ?.getGamePlayLength(game.id)
      .then((length) => !cancelled && setPlayLength(length))
      .catch(() => undefined); // Dado opcional: sem ele, a página só não mostra
    return () => {
      cancelled = true;
    };
  }, [game.id, game.title]);

  const heroUrl = !heroFailed ? game.media?.heroUrl : undefined;
  const logoUrl = !logoFailed ? game.media?.logoUrl : undefined;
  const hasAchievements = !!achievements && achievements.total > 0;
  const percent = hasAchievements ? Math.round((achievements!.unlocked / achievements!.total) * 100) : 0;
  // Uma linha só: até 6 ícones, ou 5 e o "+N"
  const badgeCount = hasAchievements && achievements!.total > MAX_BADGE_PREVIEW ? MAX_BADGE_PREVIEW - 1 : MAX_BADGE_PREVIEW;
  const badgePreview = hasAchievements ? [...achievements!.items].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)).slice(0, badgeCount) : [];
  const canEditPlaytime = game.platform !== 'steam';
  const status = LOG_STATUS.find((s) => s.id === game.log?.status);

  // Noção de quanto falta. Zerado, sem fim definido ou com dados fracos, a barra só atrapalharia.
  const typicalHours = playLength && !playLength.openEnded && !isWeakPlayLength(playLength) ? playLength.typicalHours ?? playLength.lowHours : null;
  const finished = game.log?.status === 'finished' || game.log?.status === 'completed';
  const progress = typicalHours && !finished && game.totalPlaytimeSeconds > 0 ? Math.min(100, Math.round((game.totalPlaytimeSeconds / 3600 / typicalHours) * 100)) : null;

  const platformText = game.platform === 'emulator' ? `Emulador · ${game.emulatorId ?? ''}` : PLATFORM_FULL[game.platform];

  return (
    <div className="min-h-full animate-fade-in">
      {/* Banner (hero) com logo */}
      <div className="relative h-[clamp(240px,44vh,460px)] overflow-hidden bg-slate-900">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt=""
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover animate-fade-in"
            onError={() => {
              setHeroFailed(true);
              window.electronAPI?.reportBrokenArtwork(game.id, 'hero');
            }}
          />
        ) : game.media?.coverUrl ? (
          <img src={game.media.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-50" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 via-slate-900 to-steam-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-steam-bg via-steam-bg/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-transparent to-transparent" />
        <div className="absolute left-8 right-8 bottom-6 space-y-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={game.title}
              title={game.title}
              decoding="async"
              className="max-h-[min(8rem,18vh)] max-w-[min(460px,60%)] object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]"
              onError={() => {
                setLogoFailed(true);
                window.electronAPI?.reportBrokenArtwork(game.id, 'logo');
              }}
            />
          ) : (
            <h1 className="max-w-3xl text-4xl xl:text-5xl font-bold text-white tracking-tight leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] line-clamp-2">{game.title}</h1>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${chipClass} bg-black/45 border-white/10 backdrop-blur-sm`}>{platformText}</span>
            {status && (
              <span className={`${chipClass} bg-black/45 border-white/10 backdrop-blur-sm`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
              </span>
            )}
            {game.isInstalled === false && !game.manualEntry && <span className={`${chipClass} bg-black/45 border-white/10 backdrop-blur-sm text-slate-300`}>Não instalado</span>}
            {game.familyShared && (
              <span className={`${chipClass} bg-black/45 border-white/10 backdrop-blur-sm`}>
                <Users className="w-3 h-3" /> Família Steam
              </span>
            )}
            {game.isFavorite && (
              <span className={`${chipClass} bg-black/45 border-amber-400/30 text-amber-300 backdrop-blur-sm`}>
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> Favorito
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Barra de ação: fica presa no topo ao rolar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-6 2xl:gap-x-8 gap-y-3 px-8 py-3.5 bg-steam-bg/85 backdrop-blur-md border-b border-slate-800/80">
        <PlayButton game={game} onLaunch={(g) => void launchGame(g)} size="lg" />

        <Stat icon={CalendarClock} label="Última sessão">
          {isRunning ? <span className="text-emerald-300">Agora</span> : formatLastPlayed(game.lastPlayedAt)}
        </Stat>

        <button
          onClick={canEditPlaytime ? () => open('playtime', game.id) : undefined}
          disabled={!canEditPlaytime}
          title={canEditPlaytime ? 'Ajustar tempo jogado' : 'Tempo importado da Steam'}
          className={`rounded-md -mx-2 px-2 py-1 transition-colors ${canEditPlaytime ? `hover:bg-slate-800/70 ${focusRing}` : 'cursor-default'}`}
        >
          <Stat
            icon={Clock}
            label={
              <>
                Tempo de jogo {canEditPlaytime && <Pencil className="w-2.5 h-2.5 text-indigo-400" />}
              </>
            }
          >
            {formatPlaytimeLong(game.totalPlaytimeSeconds, game.lastPlayedAt)}
          </Stat>
        </button>

        {playLength && (
          <span
            title={
              playLength.source === 'igdb'
                ? `Média de ${submissionsLabel(playLength.sampleSize)} de jogadores no IGDB.com, para ${playLength.matchedName ?? game.title}.`
                : `Estimativa com as horas de ${playLength.sampleSize} reviews positivas recentes na Steam. Não é o tempo oficial de campanha.`
            }
          >
            <Stat icon={Hourglass} label={playLength.source === 'igdb' ? 'Tempo para zerar' : 'Duração típica'}>
              {formatPlayLength(playLength)}
              {progress !== null && (
                <span className="mt-1 block w-28 h-1 rounded-full bg-slate-800 overflow-hidden" title={`Você jogou o equivalente a ${progress}% do tempo típico`}>
                  <span className="block h-full rounded-full bg-indigo-400" style={{ width: `${progress}%` }} />
                </span>
              )}
            </Stat>
          </span>
        )}

        <button onClick={() => open('achievements', game.id)} title="Ver conquistas" className={`rounded-md -mx-2 px-2 py-1 hover:bg-slate-800/70 transition-colors ${focusRing}`}>
          <Stat icon={Trophy} label="Conquistas">
            {hasAchievements ? (
              <span className="flex items-center gap-2">
                {achievements!.unlocked}/{achievements!.total}
                <span className="w-20 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} />
                </span>
              </span>
            ) : (
              <span className="text-slate-400">Ver</span>
            )}
          </Stat>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {[
            { label: 'Adicionar à lista', icon: ListPlus, onClick: () => open('addToList', game.id) },
            { label: 'Capturas', icon: Camera, onClick: () => open('screenshots', game.id) },
            { label: 'Backup de saves', icon: Save, onClick: () => open('saves', game.id) },
            { label: 'Trocar artes', icon: ImageIcon, onClick: () => open('artwork', game.id) }
          ].map(({ label, icon: Icon, onClick }) => (
            <button key={label} onClick={onClick} title={label} aria-label={label} className={iconButtonSolidClass}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <button
            onClick={(e) => {
              // Abre embaixo do botão: com teclado ou controle o clique não tem posição
              const rect = e.currentTarget.getBoundingClientRect();
              useUiStore.getState().setContextMenu({ gameId: game.id, x: rect.right - MENU_WIDTH, y: rect.bottom + 6 });
            }}
            title="Mais opções"
            aria-label="Mais opções"
            aria-haspopup="menu"
            className={iconButtonSolidClass}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          <button
            onClick={() => void toggleFavorite(game.id)}
            title={game.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
            aria-label={game.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
            aria-pressed={game.isFavorite}
            className={`${iconButtonSolidClass} ${game.isFavorite ? '!bg-amber-500/20 !text-amber-400' : ''}`}
          >
            <Star className={`w-4 h-4 ${game.isFavorite ? 'fill-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-8 py-7 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <div className="space-y-6 min-w-0">
          <GameLogCard game={game} />

          <Card
            title="Capturas de tela"
            icon={Camera}
            action={
              shots && shots.length > 0 ? (
                <button onClick={() => open('screenshots', game.id)} className={linkButton}>
                  Ver todas ({shots.length})
                </button>
              ) : undefined
            }
          >
            {shots === null ? (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="aspect-video" />
                ))}
              </div>
            ) : shots.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-slate-700/80 px-4 py-3.5">
                <p className="text-xs text-slate-400 max-w-md">Nenhuma captura ainda. As do F12 da Steam e do Win+Alt+PrtScn aparecem aqui sozinhas.</p>
                <button onClick={() => open('screenshots', game.id)} className={buttonClass('secondary')}>
                  <ImagePlus className="w-3.5 h-3.5" /> Anexar imagens
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {shots.slice(0, MAX_SHOT_PREVIEW).map((shot) => (
                  <button
                    key={shot.id}
                    onClick={() => open('screenshots', game.id, shot.id)}
                    aria-label={`Abrir captura de ${new Date(shot.takenAt).toLocaleDateString('pt-BR')}`}
                    className={`group aspect-video rounded-md overflow-hidden bg-slate-800 ring-1 ring-slate-800 hover:ring-indigo-400 transition-shadow ${focusRing}`}
                  >
                    <img src={shot.thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Atividade" icon={BarChart2}>
            <GameStats game={game} collapsible={false} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Conquistas"
            icon={Trophy}
            iconClass="text-amber-400"
            action={
              <button onClick={() => open('achievements', game.id)} className={linkButton}>
                {hasAchievements ? 'Ver todas' : 'Abrir'}
              </button>
            }
          >
            {!achievementsLoaded ? (
              <div className="space-y-3">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-1.5" />
                <div className="flex gap-1.5">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="w-10 h-10" />
                  ))}
                </div>
              </div>
            ) : hasAchievements ? (
              <div className="space-y-3.5">
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm text-slate-100">
                      <b className="font-semibold tabular-nums">{achievements!.unlocked}</b>
                      <span className="text-slate-400"> de {achievements!.total} alcançadas</span>
                    </p>
                    <span className="text-sm font-semibold text-amber-400 tabular-nums">{percent}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-[width] duration-500" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">{achievementSourceLabel(achievements!)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {badgePreview.map((a) => (
                    <img
                      key={a.id}
                      src={a.unlocked ? a.iconUrl : a.iconLockedUrl || a.iconUrl}
                      alt={a.name}
                      title={`${a.name}${a.unlocked ? '' : ' (bloqueada)'}`}
                      loading="lazy"
                      className={`w-10 h-10 rounded-md bg-slate-900 ring-1 ring-slate-800 ${a.unlocked ? '' : 'grayscale opacity-45'}`}
                    />
                  ))}
                  {achievements!.total > badgePreview.length && (
                    <button
                      onClick={() => open('achievements', game.id)}
                      aria-label={`Ver mais ${achievements!.total - badgePreview.length} conquistas`}
                      className={`w-10 h-10 rounded-md bg-slate-800 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition-colors ${focusRing}`}
                    >
                      +{achievements!.total - badgePreview.length}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-slate-400">{achievements?.warning ?? 'Nenhuma conquista encontrada ainda. Abra para buscar ou criar as suas.'}</p>
            )}
          </Card>

          <Card title="Informações" icon={Info} iconClass="text-slate-400">
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Nome</dt>
                <dd className="min-w-0">
                  <button onClick={() => open('rename', game.id)} title="Renomear" className={`flex items-center gap-1.5 max-w-full text-slate-200 hover:text-white rounded-sm ${focusRing}`}>
                    <span className="truncate">{game.title}</span>
                    <Pencil className="w-3 h-3 flex-shrink-0 text-slate-400" />
                  </button>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Plataforma</dt>
                <dd className="text-slate-200 text-right">
                  {platformText}
                  {game.manualPlatform && ` · ${game.manualPlatform}`}
                  {game.id.startsWith('steam-shortcut-') && ' (atalho da Steam)'}
                  {game.familyShared && ' · Família Steam'}
                  {game.isInstalled === false && !game.manualEntry && ' · não instalado'}
                </dd>
              </div>
              {game.installPath && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400 flex-shrink-0 flex items-center gap-1">
                    <FolderOpen className="w-3 h-3" /> Pasta
                  </dt>
                  <dd className="min-w-0">
                    {game.isInstalled === false ? (
                      <span className="block text-slate-300 text-right truncate" title={game.installPath}>
                        {game.installPath}
                      </span>
                    ) : (
                      <button
                        onClick={() => openGameFolder(game)}
                        title={`Abrir ${game.installPath}`}
                        className={`block max-w-full text-slate-200 hover:text-white hover:underline text-right truncate rounded-sm ${focusRing}`}
                      >
                        {game.installPath}
                      </button>
                    )}
                  </dd>
                </div>
              )}
              {playLength?.source === 'igdb' &&
                hasConsistentTimes(playLength) &&
                [
                  { label: 'Campanha', hours: playLength.lowHours },
                  { label: 'Com extras', hours: playLength.typicalHours },
                  { label: 'Tudo (100%)', hours: playLength.completeHours }
                ].map(
                  (row) =>
                    row.hours && (
                      <div key={row.label} className="flex justify-between gap-3">
                        <dt className="text-slate-400">{row.label}</dt>
                        <dd className="text-slate-200 tabular-nums">{formatDuration(row.hours)} h</dd>
                      </div>
                    )
                )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Na biblioteca desde</dt>
                <dd className="text-slate-200 tabular-nums">{game.createdAt ? new Date(game.createdAt).toLocaleDateString('pt-BR') : '—'}</dd>
              </div>
            </dl>
            {playLength?.source === 'igdb' && (
              <p className="mt-2.5 text-[11px] text-slate-400">
                {isWeakPlayLength(playLength) ? 'Poucos dados: ' : ''}
                média de {submissionsLabel(playLength.sampleSize)} no IGDB.com
              </p>
            )}
            <button onClick={() => open('saves', game.id)} className={`mt-4 w-full ${buttonClass('secondary', 'md')}`}>
              <Save className="w-3.5 h-3.5 text-indigo-300" /> Backup de saves
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
};
