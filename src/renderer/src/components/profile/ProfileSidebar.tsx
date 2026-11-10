import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Game } from '@shared/types/game';
import { PlayerProfile } from '@shared/types/profile';
import { focusRing } from '../ui';
import { PLATFORM_LABEL, formatHours, localDay, relativeDay } from '../journal/format';
import { panel } from './parts';

const ACTIVITY_WEEKS = 15;
const RATING_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const RECENT_ACHIEVEMENTS = 6;

const Block: React.FC<{ title: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, extra, children }) => (
  <section className={`${panel} p-4`}>
    <div className="flex items-baseline justify-between gap-2 mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      {extra && <span className="text-[11px] text-slate-500">{extra}</span>}
    </div>
    {children}
  </section>
);

const activityLevel = (count: number) => (count === 0 ? 0 : count === 1 ? 0.35 : count < 4 ? 0.6 : count < 10 ? 0.8 : 1);

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
  const activeDays = cells.filter((c) => c.count > 0).length;
  return (
    <>
      <div className="grid grid-rows-7 grid-flow-col gap-[3px]">
        {cells.map((cell) => (
          <span
            key={cell.key}
            title={cell.future ? undefined : `${new Date(`${cell.key}T12:00:00`).toLocaleDateString('pt-BR')}: ${cell.count} ${cell.count === 1 ? 'atividade' : 'atividades'}`}
            className={`relative aspect-square rounded-[3px] overflow-hidden ${cell.future ? 'bg-transparent' : 'bg-slate-800/80'}`}
          >
            {cell.count > 0 && <span className="absolute inset-0 bg-indigo-400" style={{ opacity: activityLevel(cell.count) }} />}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>{activeDays} dias com atividade</span>
        <span className="flex items-center gap-1">
          menos
          {[0, 1, 3, 9, 12].map((n) => (
            <span key={n} className="relative w-2.5 h-2.5 rounded-[2px] bg-slate-800 overflow-hidden">
              {n > 0 && <span className="absolute inset-0 bg-indigo-400" style={{ opacity: activityLevel(n) }} />}
            </span>
          ))}
          mais
        </span>
      </div>
    </>
  );
};

const RatingsChart: React.FC<{ games: Game[] }> = ({ games }) => {
  const counts = RATING_STEPS.map((step) => games.filter((g) => g.log?.rating === step).length);
  const max = Math.max(1, ...counts);
  const rated = counts.reduce((sum, n) => sum + n, 0);
  const average = rated ? RATING_STEPS.reduce((sum, step, i) => sum + step * counts[i], 0) / rated : 0;
  return (
    <div>
      <div className="flex items-end gap-1 h-20">
        {RATING_STEPS.map((step, index) => (
          <span
            key={step}
            title={`${String(step).replace('.', ',')} estrelas: ${counts[index]}`}
            className={`flex-1 rounded-t-sm ${counts[index] ? 'bg-indigo-400' : 'bg-slate-800'}`}
            style={{ height: `${Math.max(counts[index] ? 8 : 4, (counts[index] / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
        <span>½ ★</span>
        <span>5 ★</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        <b className="font-display text-base text-white">{average.toFixed(1).replace('.', ',')}</b> de média em {rated} {rated === 1 ? 'nota' : 'notas'}
      </p>
    </div>
  );
};

interface ProfileSidebarProps {
  profile: PlayerProfile;
  games: Game[];
  year: number;
  yearStats: { played: number; finished: number };
  onYearReview: () => void;
  onSelectGame: (id: string) => void;
}

export const ProfileSidebar: React.FC<ProfileSidebarProps> = ({ profile, games, year, yearStats, onYearReview, onSelectGame }) => {
  const platforms = profile.byPlatform.filter((p) => p.playtimeSeconds > 0);
  const maxPlatform = Math.max(1, ...platforms.map((p) => p.playtimeSeconds));
  const hasRatings = games.some((g) => g.log?.rating);
  const badges = profile.steam?.badges ?? [];

  return (
    <aside className="space-y-4">
      <section className={`${panel} relative overflow-hidden p-4`}>
        <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 w-36 h-36 rounded-full bg-indigo-500/20 blur-2xl" />
        <p className="relative font-display text-3xl text-white">{year}</p>
        <dl className="relative mt-3 grid grid-cols-2 gap-3">
          <div>
            <dd className="font-display text-2xl text-white tabular-nums">{yearStats.played}</dd>
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Jogados</dt>
          </div>
          <div>
            <dd className="font-display text-2xl text-white tabular-nums">{yearStats.finished}</dd>
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Zerados</dt>
          </div>
        </dl>
        <button
          type="button"
          onClick={onYearReview}
          className={`relative mt-4 w-full flex items-center justify-between px-3 py-2 rounded-lg bg-indigo-500/15 text-sm text-indigo-200 hover:bg-indigo-500/25 hover:text-white transition-colors ${focusRing}`}
        >
          Ver a retrospectiva <ArrowRight className="w-4 h-4" />
        </button>
      </section>

      <Block title="Atividade" extra={`últimas ${ACTIVITY_WEEKS} semanas`}>
        <ActivityMap days={profile.activityByDay} />
      </Block>

      {profile.recentAchievements.length > 0 && (
        <Block title="Últimas conquistas">
          <ul className="space-y-1">
            {profile.recentAchievements.slice(0, RECENT_ACHIEVEMENTS).map((a) => (
              <li key={`${a.gameId}-${a.name}`}>
                <button
                  type="button"
                  onClick={() => onSelectGame(a.gameId)}
                  title={a.description || a.name}
                  className={`w-full flex items-center gap-2.5 p-1.5 -mx-1.5 rounded-lg text-left hover:bg-slate-800/60 transition-colors ${focusRing}`}
                >
                  <span className="w-9 h-9 flex-shrink-0 rounded-md overflow-hidden bg-slate-800">{a.iconUrl && <img src={a.iconUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-slate-100 truncate">{a.name}</span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {a.gameTitle}
                      {a.unlockedAt ? ` · ${relativeDay(a.unlockedAt)}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {hasRatings && (
        <Block title="Suas notas">
          <RatingsChart games={games} />
        </Block>
      )}

      {platforms.length > 0 && (
        <Block title="Onde você joga">
          <div className="space-y-2.5">
            {platforms.map((p) => (
              <div key={p.platform} className="text-xs">
                <div className="flex justify-between gap-2 text-slate-300">
                  <span>{PLATFORM_LABEL[p.platform]}</span>
                  <span className="text-slate-400 tabular-nums">{formatHours(p.playtimeSeconds)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(p.playtimeSeconds / maxPlatform) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {badges.length > 0 && (
        <Block title="Insígnias da Steam">
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <img key={b.iconUrl} src={b.iconUrl} alt={b.name} title={b.name} className="w-11 h-11 object-contain" />
            ))}
          </div>
        </Block>
      )}
    </aside>
  );
};
