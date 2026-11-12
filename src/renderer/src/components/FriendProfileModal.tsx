import React, { useEffect, useMemo, useState } from 'react';
import { Star, UserMinus } from 'lucide-react';
import { SocialFriendProfile } from '@shared/types/social';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { formatPlaytimeShort } from '../utils/format';
import { ActivityCard, Avatar, Cover, NowPlayingLine } from './friends/parts';
import { StatStrip } from './journal/PageLayout';
import { Button, Modal, Notice, Skeleton } from './ui';

// Mesma regra do main (social.service gameKeyOf): o mesmo jogo em lojas diferentes tem a mesma chave
function gameKey(platform: string, platformGameId: string | undefined, title: string): string {
  if (platform === 'steam' && platformGameId && /^\d{1,10}$/.test(platformGameId)) return `steam:${platformGameId}`;
  return `t:${title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, 'and').replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 120)}`;
}

// Perfil de um amigo: números, mais jogados (com "você também tem") e o que fez por último
export const FriendProfileModal: React.FC<{ friendId: string; onClose: () => void }> = ({ friendId, onClose }) => {
  const [profile, setProfile] = useState<SocialFriendProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const games = useLibraryStore((s) => s.games);
  const mine = useMemo(() => new Map(games.map((g) => [gameKey(g.platform, g.platformGameId, g.title), g])), [games]);

  useEffect(() => {
    let alive = true;
    window.electronAPI
      ?.socialGetFriendProfile(friendId)
      .then((p) => alive && setProfile(p))
      .catch((err) => alive && setError(ipcErrorMessage(err)));
    return () => {
      alive = false;
    };
  }, [friendId]);

  const remove = async () => {
    setRemoving(true);
    try {
      await window.electronAPI?.socialRemoveFriend(friendId);
      onClose();
    } catch (err) {
      setError(ipcErrorMessage(err));
      setRemoving(false);
    }
  };

  const totals = profile?.summary?.totals;
  const inCommon = profile?.summary?.topGames.filter((g) => mine.has(g.gameKey)).length ?? 0;

  return (
    <Modal
      title={profile ? profile.user.name : 'Perfil do amigo'}
      subtitle={profile?.nowPlaying ? <NowPlayingLine nowPlaying={profile.nowPlaying} /> : undefined}
      icon={profile ? <Avatar user={profile.user} size="sm" /> : undefined}
      onClose={onClose}
      size="xl"
      tall
      footer={
        confirmRemove ? (
          <>
            <span className="mr-auto text-xs text-slate-400">Vocês deixam de ver o feed um do outro.</span>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={removing} onClick={remove}>
              Desfazer amizade
            </Button>
          </>
        ) : (
          <Button variant="ghost" icon={<UserMinus className="w-3.5 h-3.5" />} onClick={() => setConfirmRemove(true)} disabled={!profile}>
            Desfazer amizade
          </Button>
        )
      }
    >
      {error && <Notice>{error}</Notice>}
      {!profile && !error && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {profile && (
        <>
          {totals && (
            <StatStrip
              className="rounded-xl bg-slate-900/50 border border-slate-800/90 py-4"
              stats={[
                { label: 'Jogos', value: totals.games },
                { label: 'Horas', value: totals.playtimeSeconds ? Math.round(totals.playtimeSeconds / 3600) : '—' },
                { label: 'Zerados', value: totals.finishedGames },
                { label: 'Conquistas', value: totals.achievementsUnlocked || '—' },
                { label: '100%', value: totals.perfectGames || '—', accent: true }
              ]}
            />
          )}

          {profile.summary && profile.summary.topGames.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Mais jogados
                {inCommon > 0 && <span className="normal-case tracking-normal font-normal text-indigo-300">{inCommon === 1 ? '1 em comum com você' : `${inCommon} em comum com você`}</span>}
              </h3>
              <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {profile.summary.topGames.map((g) => {
                  const own = mine.get(g.gameKey);
                  return (
                    <li key={g.gameKey} className="min-w-0">
                      <div className="relative">
                        <Cover url={g.coverUrl} title={g.title} gameKey={g.gameKey} className="w-full aspect-[2/3]" />
                        {own && <span className="absolute top-1.5 left-1.5 rounded-md bg-indigo-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">Você tem</span>}
                      </div>
                      <p className="mt-1.5 text-xs font-semibold text-slate-200 truncate" title={g.title}>
                        {g.title}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 whitespace-nowrap">
                        {g.playtimeSeconds > 0 && <span>{formatPlaytimeShort(g.playtimeSeconds)}</span>}
                        {g.rating && (
                          <span className="inline-flex items-center gap-0.5 text-amber-300">
                            <Star className="w-3 h-3 fill-current" />
                            {String(g.rating).replace('.', ',')}
                          </span>
                        )}
                        {own && (own.totalPlaytimeSeconds ?? 0) > 0 && <span className="text-indigo-300">você: {formatPlaytimeShort(own.totalPlaytimeSeconds)}</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Atividade</h3>
            {profile.activities.length === 0 ? (
              <p className="text-sm text-slate-500">Nada por aqui ainda.</p>
            ) : (
              <div className="space-y-2.5">
                {profile.activities.map((a) => (
                  <ActivityCard key={a.id} activity={a} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Modal>
  );
};
