import React from 'react';
import { CalendarDays, Loader2, MoreHorizontal, Pencil, UserRound } from 'lucide-react';
import { FlaskConical } from 'lucide-react';
import { PlayerProfile } from '@shared/types/profile';
import { Select } from '../Select';
import { Button, buttonClass } from '../ui';
import { Stat, StatStrip } from '../journal/PageLayout';
import { panel } from './parts';

// Cores do nível da Steam (as mesmas do site da Steam, a cada 10 níveis)
const LEVEL_COLORS = ['#9b9b9b', '#c02942', '#d95b43', '#fecc23', '#467a3c', '#4e8ddb', '#7652c9', '#c252c9', '#542437', '#997c52'];

export type ProfileAction = 'sync' | 'export' | 'publish' | 'settings';

interface ProfileHeroProps {
  profile: PlayerProfile;
  stats: Stat[];
  presence?: { text: string; className: string };
  busy: boolean;
  publishLabel: string;
  onEdit: () => void;
  onYearReview: () => void;
  onAction: (action: ProfileAction) => void;
}

// Identidade do jogador: avatar, nome, bio e os números principais
export const ProfileHero: React.FC<ProfileHeroProps> = ({ profile, stats, presence, busy, publishLabel, onEdit, onYearReview, onAction }) => {
  const { custom, steam } = profile;
  const realName = custom.realName || steam?.realName;
  const location = custom.location || steam?.location;
  const bio = custom.bio || steam?.summary;
  const frameUrl = custom.hideAvatarFrame ? undefined : steam?.avatarFrameUrl;
  const levelColor = profile.steamLevel !== undefined ? LEVEL_COLORS[Math.floor(profile.steamLevel / 10) % 10] : undefined;

  const actions: { value: ProfileAction; label: string }[] = [
    { value: 'sync', label: 'Atualizar conquistas' },
    { value: 'export', label: 'Exportar perfil (arquivo)' },
    { value: 'publish', label: publishLabel },
    { value: 'settings', label: 'Contas e configurações' }
  ];

  return (
    <header className={`${panel} overflow-hidden`}>
      <div className="flex flex-wrap items-end gap-6 px-6 pt-6 pb-5">
        <div className="relative w-36 h-36 flex-shrink-0">
          <div className="w-full h-full rounded-2xl overflow-hidden bg-slate-800 ring-4 ring-steam-bg shadow-2xl shadow-black/50">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="h-full flex items-center justify-center bg-gradient-to-br from-indigo-500/30 to-slate-800">
                <UserRound className="w-14 h-14 text-slate-300/80" />
              </span>
            )}
          </div>
          {frameUrl && <img src={frameUrl} alt="" className="absolute -inset-[7%] w-[114%] h-[114%] max-w-none pointer-events-none" />}
        </div>

        <div className="flex-1 min-w-[260px] pb-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-4xl leading-tight text-white truncate">{profile.displayName}</h1>
            {profile.steamLevel !== undefined && (
              <span title="Nível na Steam" className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold text-slate-100" style={{ borderColor: levelColor }}>
                {profile.steamLevel}
              </span>
            )}
            {profile.betaTester && (
              <span title="Ajudou a testar o Lazulium desde as primeiras versões" className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-indigo-500/20 ring-1 ring-inset ring-indigo-400/40 text-xs font-medium text-indigo-200">
                <FlaskConical className="w-3 h-3" aria-hidden="true" /> Beta tester
              </span>
            )}
            {presence && (
              <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-slate-900/80 text-xs ${presence.className}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" /> {presence.text}
              </span>
            )}
          </div>
          {(realName || location) && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-300">
              {realName && <span>{realName}</span>}
              {realName && location && <span className="text-slate-600">·</span>}
              {!custom.location && steam?.flagUrl && <img src={steam.flagUrl} alt="" className="w-4 h-[11px]" />}
              {location && <span>{location}</span>}
            </p>
          )}
          {bio ? (
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-300 line-clamp-3 whitespace-pre-wrap">{bio}</p>
          ) : (
            <button type="button" onClick={onEdit} className={`${buttonClass('link')} mt-2 text-sm`}>
              Escrever uma bio
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 pb-1">
          <Button variant="primary" size="md" icon={<Pencil className="w-3.5 h-3.5" />} onClick={onEdit} data-nav-start="">
            Editar perfil
          </Button>
          <Button size="md" icon={<CalendarDays className="w-3.5 h-3.5" />} onClick={onYearReview}>
            Retrospectiva
          </Button>
          <Select<ProfileAction | ''> value="" options={actions} onChange={(v) => v && onAction(v)} ariaLabel="Mais ações do perfil" align="right" className={buttonClass('secondary', 'md')}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
          </Select>
        </div>
      </div>

      <StatStrip stats={stats} className="py-4 border-t border-slate-800/80 bg-slate-950/30" />
    </header>
  );
};
