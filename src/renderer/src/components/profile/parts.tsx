import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { Game } from '@shared/types/game';
import { ProfileGame } from '@shared/types/profile';
import { buttonClass, focusRing } from '../ui';
import { Stars, StatusDot } from '../GameLogFields';
import { GameCover, coverFrame } from '../journal/CoverCard';
import { formatDay, formatHours, percent, shortDate } from '../journal/format';
import { PLATFORM_FULL } from '../../utils/platform';

// Com fundo escolhido (data-backdrop na raiz do perfil), o painel deixa de ser caixa: vira um véu preto sem borda nem sombra,
// a arte passa por trás e a página parece uma coisa só. Escuro o bastante para ler sobre imagem ou vídeo claro.
export const panelOverArt = 'group-data-[backdrop=true]/profile:bg-black/55 group-data-[backdrop=true]/profile:border-transparent group-data-[backdrop=true]/profile:shadow-none';

// Painéis do perfil
export const panel = `rounded-xl bg-steam-bg/85 border border-slate-700/40 shadow-xl shadow-black/20 ${panelOverArt}`;

export const Panel: React.FC<{ title?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, extra, children, className = '' }) => (
  <section className={`${panel} p-5 ${className}`}>
    {(title || extra) && (
      <div className="flex items-baseline justify-between gap-3 mb-4">
        {title && <h2 className="text-[17px] text-white">{title}</h2>}
        {extra && <span className="flex-shrink-0 text-xs text-slate-400">{extra}</span>}
      </div>
    )}
    {children}
  </section>
);

export const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className={`${buttonClass('link')} text-xs`}>
    {children}
  </button>
);

// Raridade pela % de jogadores que têm a conquista
export function rarity(globalPercent?: number): { label: string; className: string; ring: string } | null {
  if (typeof globalPercent !== 'number') return null;
  if (globalPercent < 5) return { label: 'Ultra rara', className: 'text-amber-300 bg-amber-400/10 ring-amber-400/40', ring: 'ring-amber-400/60' };
  if (globalPercent < 15) return { label: 'Rara', className: 'text-indigo-200 bg-indigo-400/10 ring-indigo-400/40', ring: 'ring-indigo-400/60' };
  return { label: 'Comum', className: 'text-slate-300 bg-slate-400/10 ring-slate-500/40', ring: 'ring-slate-600' };
}

export const AchievementTile: React.FC<{ name: string; gameTitle: string; iconUrl?: string; globalPercent?: number; onOpen: () => void }> = ({ name, gameTitle, iconUrl, globalPercent, onOpen }) => {
  const r = rarity(globalPercent);
  return (
    <button type="button" onClick={onOpen} title={`${name} — ${gameTitle}`} className={`group flex items-center gap-3 p-2.5 rounded-lg text-left bg-slate-900/60 border border-slate-800 hover:border-slate-600 hover:bg-slate-800/50 transition-colors ${focusRing}`}>
      <span className={`relative w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-slate-800 ring-2 ${r?.ring ?? 'ring-slate-700'}`}>
        {iconUrl && <img src={iconUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-100 truncate group-hover:text-white">{name}</span>
        <span className="block text-[11px] text-slate-400 truncate">{gameTitle}</span>
      </span>
      {r && (
        <span className={`flex-shrink-0 flex flex-col items-end gap-0.5 px-2 py-1 rounded-md ring-1 ring-inset ${r.className}`}>
          <span className="text-xs font-semibold tabular-nums">{percent(globalPercent!)}</span>
          <span className="text-[10px] uppercase tracking-wide opacity-80">{r.label}</span>
        </span>
      )}
    </button>
  );
};

const REVIEW_COLLAPSED_CHARS = 360; // Acima disso a resenha começa recolhida, com "Ler mais"

// Resenha no formato de publicação: capa à esquerda; nome e data; nota, horas, status e plataforma; e o texto que abre e fecha
export const ReviewCard: React.FC<{ game: Game; onOpen: () => void }> = ({ game, onOpen }) => {
  const [expanded, setExpanded] = useState(false);
  const date = game.log?.finishedOn ?? game.lastPlayedAt?.slice(0, 10);
  const review = game.log?.review?.trim();
  const long = !!review && (review.length > REVIEW_COLLAPSED_CHARS || review.split('\n').length > 5);
  return (
    <article className="grid grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[96px_minmax(0,1fr)] gap-x-4 py-4 first:pt-0 last:pb-0 border-b border-slate-800/80 last:border-b-0">
      <button type="button" onClick={onOpen} title={game.title} className={`${coverFrame} self-start hover:border-slate-500 ${focusRing}`}>
        <GameCover src={game.media?.coverUrl} title={game.title} gameId={game.id} />
      </button>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <button type="button" onClick={onOpen} className={`min-w-0 truncate text-left text-[15px] font-bold text-white hover:underline rounded-sm ${focusRing}`}>
            {game.title}
          </button>
          {date && <span className="flex-shrink-0 text-sm text-slate-500">· {formatDay(date, 'long')}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-slate-400">
          {!!game.log?.rating && <Stars value={game.log.rating} size="w-3.5 h-3.5" />}
          {(game.totalPlaytimeSeconds ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {formatHours(game.totalPlaytimeSeconds)}
            </span>
          )}
          <StatusDot status={game.log?.status} />
          <span className="truncate">em {game.manualPlatform ?? PLATFORM_FULL[game.platform]}</span>
        </div>
        {review && (
          <>
            <p className={`mt-3 text-[15px] leading-relaxed text-slate-300 whitespace-pre-wrap break-words select-text ${expanded ? '' : 'line-clamp-5'}`}>{review}</p>
            {long && (
              <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={`mt-1 text-[15px] text-indigo-300 hover:underline rounded-sm ${focusRing}`}>
                {expanded ? 'Ler menos' : 'Ler mais'}
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
};

// Jogo da atividade recente: arte larga, horas e o avanço nas conquistas
export const ActivityRow: React.FC<{ game: ProfileGame; onOpen: () => void }> = ({ game, onOpen }) => {
  const total = game.achievementsTotal ?? 0;
  const unlocked = game.achievementsUnlocked ?? 0;
  const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;
  return (
    <button type="button" onClick={onOpen} className={`group w-full flex items-center gap-4 p-2.5 rounded-lg text-left bg-slate-900/50 border border-slate-800/80 hover:border-slate-600 hover:bg-slate-800/40 transition-colors ${focusRing}`}>
      <span className="w-[184px] aspect-[184/69] flex-shrink-0 rounded-md overflow-hidden bg-slate-800">
        {(game.heroUrl || game.coverUrl) && <img src={game.heroUrl || game.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] text-white truncate">{game.title}</span>
        <span className="block mt-0.5 text-xs text-slate-400">
          {formatHours(game.playtimeSeconds)} no total{game.lastPlayedAt ? ` · jogado em ${shortDate(game.lastPlayedAt)}` : ''}
        </span>
        {total > 0 && (
          <span className="mt-2 flex items-center gap-3">
            <span className="flex-1 max-w-56 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <span className={`block h-full rounded-full ${pct === 100 ? 'bg-amber-400' : 'bg-indigo-400'}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {unlocked}/{total} conquistas
            </span>
          </span>
        )}
      </span>
      {!!game.recentAchievementIcons?.length && (
        <span className="hidden xl:flex gap-1 flex-shrink-0">
          {game.recentAchievementIcons.slice(0, 4).map((a) => (
            <img key={a.name} src={a.iconUrl} alt={a.name} title={a.name} loading="lazy" className="w-8 h-8 rounded-sm" />
          ))}
        </span>
      )}
    </button>
  );
};
