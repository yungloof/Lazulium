import React from 'react';
import { FriendPresence, PresenceStatus, SocialNowPlaying, SocialUser } from '@shared/types/social';
import { PRESENCE_LABEL } from '@shared/utils/presence';
import { Avatar, NowPlayingLine } from './parts';

type AnyPresence = PresenceStatus | FriendPresence;

const MOON_MASK = 'radial-gradient(circle at 18% 18%, transparent 38%, #000 40%)';

// Bolinha de status como no Discord: verde, lua amarela, vermelho com traço, anel cinza
export const PresenceDot: React.FC<{ status: AnyPresence; className?: string; ring?: string }> = ({ status, className = 'w-3 h-3', ring = 'ring-[3px] ring-surface-bg' }) => {
  const base = `inline-block flex-shrink-0 rounded-full ${ring} ${className}`;
  if (status === 'online') return <span className={`${base} bg-emerald-500`} aria-hidden />;
  // Lua: círculo amarelo com um recorte transparente (fica certo sobre qualquer fundo)
  if (status === 'away')
    return <span className={`${base} bg-amber-400`} style={{ WebkitMaskImage: MOON_MASK, maskImage: MOON_MASK }} aria-hidden />;
  if (status === 'dnd')
    return (
      <span className={`${base} bg-red-500 flex items-center justify-center`} aria-hidden>
        <span className="w-[55%] h-[22%] rounded-full bg-slate-950" />
      </span>
    );
  return <span className={`${base} border-[2.5px] border-slate-500`} aria-hidden />;
};

// Foto com a bolinha no canto
export const PresenceAvatar: React.FC<{ user: Pick<SocialUser, 'avatarUrl' | 'name'>; status: AnyPresence; size?: 'sm' | 'md' | 'lg' }> = ({ user, status, size = 'md' }) => (
  <span className="relative flex-shrink-0" title={PRESENCE_LABEL[status]}>
    <Avatar user={user} size={size} />
    <PresenceDot status={status} className={`absolute -bottom-0.5 -right-0.5 ${size === 'lg' ? 'w-4 h-4' : size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
  </span>
);

const LINE_COLOR: Record<AnyPresence, string> = {
  online: 'text-emerald-300',
  away: 'text-amber-300',
  dnd: 'text-red-300',
  invisible: 'text-slate-400',
  offline: 'text-slate-500'
};

// Linha embaixo do nome: jogando agora vence; depois o status; off-line mostra quando foi visto
export const PresenceLine: React.FC<{ status: FriendPresence; nowPlaying?: SocialNowPlaying | null; lastSeen?: string }> = ({ status, nowPlaying, lastSeen }) => {
  if (nowPlaying && status !== 'offline') return <NowPlayingLine nowPlaying={nowPlaying} />;
  if (status === 'offline') return <span className="block text-xs text-slate-500 truncate">{lastSeen ? `Visto ${lastSeen}` : 'Off-line'}</span>;
  return (
    <span className={`flex items-center gap-1.5 text-xs truncate ${LINE_COLOR[status]}`}>
      <PresenceDot status={status} className="w-2 h-2" ring="" />
      {status === 'online' ? 'On-line' : PRESENCE_LABEL[status]}
    </span>
  );
};
