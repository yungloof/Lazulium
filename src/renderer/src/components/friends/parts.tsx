import React, { useState } from 'react';
import { Gamepad2, UserRound } from 'lucide-react';
import { SocialActivity, SocialNowPlaying, SocialUser } from '@shared/types/social';
import { formatLastPlayed } from '../../utils/format';
import { ACTIVITY_ICON, describeActivity } from '../profile/ActivityTimeline';

export const Avatar: React.FC<{ user: Pick<SocialUser, 'avatarUrl' | 'name'>; size?: 'sm' | 'md' | 'lg' }> = ({ user, size = 'md' }) => {
  const box = size === 'lg' ? 'w-16 h-16 rounded-2xl' : size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl';
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className={`${box} object-cover flex-shrink-0 bg-slate-800`} referrerPolicy="no-referrer" />
  ) : (
    <span className={`${box} bg-slate-800 flex items-center justify-center flex-shrink-0`} aria-hidden>
      <UserRound className="w-1/2 h-1/2 text-slate-500" />
    </span>
  );
};

// Capa vista pelos amigos. Jogo da Steam sem capa vertical (comum nos lançamentos novos) usa a imagem da loja; sem nada, o ícone.
export const Cover: React.FC<{ url: string | null; title: string; gameKey?: string; className?: string }> = ({ url, title, gameKey, className = 'w-12 h-16' }) => {
  const steamId = gameKey?.match(/^steam:(\d+)$/)?.[1];
  const candidates = [url, steamId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamId}/header.jpg` : null].filter((u): u is string => !!u);
  const [index, setIndex] = useState(0);
  const src = candidates[index];
  return src ? (
    <img
      src={src}
      alt=""
      className={`${className} rounded-md object-cover flex-shrink-0 bg-slate-800`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setIndex((i) => i + 1)}
    />
  ) : (
    <span className={`${className} rounded-md bg-slate-800 flex items-center justify-center flex-shrink-0`} title={title} aria-hidden>
      <Gamepad2 className="w-5 h-5 text-slate-600" />
    </span>
  );
};

export const NowPlayingLine: React.FC<{ nowPlaying: SocialNowPlaying }> = ({ nowPlaying }) => (
  <span className="flex items-center gap-1.5 text-xs text-emerald-300 truncate">
    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" aria-hidden />
    Jogando {nowPlaying.gameTitle}
  </span>
);

const stars = (rating: number) => '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '');

// Um evento do feed: quem, o quê, quando e, se houver, a resenha
export const ActivityCard: React.FC<{ activity: SocialActivity; user?: SocialUser; onOpenUser?: () => void }> = ({ activity, user, onOpenUser }) => (
  <article className="flex gap-3.5 rounded-xl bg-slate-900/50 border border-slate-800/90 p-3.5">
    <Cover url={activity.coverUrl} title={activity.gameTitle} gameKey={activity.gameKey} />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 min-w-0">
        {user && (
          <button type="button" onClick={onOpenUser} className="flex items-center gap-2 min-w-0 rounded-md hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
            <Avatar user={user} size="sm" />
            <span className="text-sm font-semibold text-slate-100 truncate">{user.name}</span>
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500 flex-shrink-0">{formatLastPlayed(activity.at)}</span>
      </div>
      <p className="mt-1.5 flex items-start gap-2 text-sm text-slate-300">
        <span className="mt-0.5 flex-shrink-0">{ACTIVITY_ICON[activity.kind]}</span>
        <span className="min-w-0">{describeActivity(activity)}</span>
      </p>
      {activity.kind === 'reviewed' && activity.text && (
        <blockquote className="mt-2 rounded-lg bg-slate-950/40 border-l-2 border-indigo-400/50 px-3 py-2 text-sm leading-relaxed text-slate-300 line-clamp-4 whitespace-pre-line">
          {activity.rating ? <span className="mr-2 text-amber-300">{stars(activity.rating)}</span> : null}
          {activity.text}
        </blockquote>
      )}
    </div>
  </article>
);
