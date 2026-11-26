import React, { useState } from 'react';
import { Gamepad2, UserRound } from 'lucide-react';
import { SocialActivity, SocialNowPlaying, SocialUser } from '@shared/types/social';
import { formatLastPlayed } from '../../utils/format';
import { ACTIVITY_ICON, describeActivity } from '../profile/ActivityTimeline';
import { reviewTarget } from '@shared/utils/reactions';
import { Stars } from '../GameLogFields';
import { ReviewToggle, reviewIsLong } from '../ReviewBody';
import { ReactionBar } from './Reactions';

export const Avatar: React.FC<{ user: Pick<SocialUser, 'avatarUrl' | 'name'>; size?: 'xs' | 'sm' | 'md' | 'lg' }> = ({ user, size = 'md' }) => {
  const box = size === 'lg' ? 'w-16 h-16 rounded-2xl' : size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'xs' ? 'w-5 h-5 rounded-md' : 'w-10 h-10 rounded-xl';
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
      className={`${className} rounded-md object-cover flex-shrink-0 bg-slate-800 ring-1 ring-white/5`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setIndex((i) => i + 1)}
    />
  ) : (
    <span className={`${className} rounded-md bg-slate-800 ring-1 ring-white/5 flex items-center justify-center flex-shrink-0`} title={title} aria-hidden>
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

export const OnlineLine: React.FC = () => (
  <span className="flex items-center gap-1.5 text-xs text-sky-300 truncate">
    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" aria-hidden />
    On-line
  </span>
);

// Um evento do feed: quem, o quê, quando e, se houver, a resenha
export const ActivityCard: React.FC<{ activity: SocialActivity; user?: SocialUser; ownerId?: string; onOpenUser?: () => void }> = ({
  activity,
  user,
  ownerId,
  onOpenUser
}) => {
  const [expanded, setExpanded] = useState(false);
  const reactionOwner = ownerId ?? user?.id;
  const longReview = activity.kind === 'reviewed' && reviewIsLong(activity.text, 0, 240, 4);

  return (
    <article className="flex gap-3.5 rounded-xl bg-surface-panel/70 border border-slate-800/80 p-3.5">
      <Cover url={activity.coverUrl} title={activity.gameTitle} gameKey={activity.gameKey} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {user && (
            <button
              type="button"
              onClick={onOpenUser}
              className="flex items-center gap-2 min-w-0 rounded-md hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <Avatar user={user} size="sm" />
              <span className="text-sm font-semibold text-slate-100 truncate">{user.name}</span>
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400 tabular-nums flex-shrink-0">{formatLastPlayed(activity.at)}</span>
        </div>
        <p className="mt-1.5 flex items-start gap-2 text-sm text-slate-300">
          <span className="mt-0.5 flex-shrink-0">{ACTIVITY_ICON[activity.kind]}</span>
          <span className="min-w-0">{describeActivity(activity)}</span>
        </p>
        {activity.kind === 'reviewed' && activity.text && (
          <div className="mt-2.5">
            <blockquote className="rounded-lg bg-slate-950/45 border border-slate-800/75 px-3.5 py-2.5">
              {activity.rating ? (
                <div className="mb-1.5 flex items-center gap-2">
                  <Stars value={activity.rating} size="w-3.5 h-3.5" />
                  <span className="text-xs font-medium text-amber-300/90 tabular-nums">{String(activity.rating).replace('.', ',')}/5</span>
                </div>
              ) : null}
              <p className={`max-w-[68ch] text-sm leading-relaxed text-slate-200/95 whitespace-pre-line break-words select-text ${expanded ? '' : 'line-clamp-4'}`}>
                {activity.text}
              </p>
            </blockquote>
            {longReview && (
              <ReviewToggle
                expanded={expanded}
                onToggle={() => setExpanded((v) => !v)}
                className="mt-1.5 px-1 text-xs font-semibold text-indigo-300 hover:text-white"
                more="Ler resenha inteira"
                less="Mostrar menos"
              />
            )}
          </div>
        )}
        {reactionOwner && (activity.kind === 'reviewed' || activity.kind === 'rated') && (
          <ReactionBar target={reviewTarget(reactionOwner, activity.gameTitle)} className="mt-2.5" />
        )}
      </div>
    </article>
  );
};
