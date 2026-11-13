import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Star, UserMinus } from 'lucide-react';
import { SocialFriendProfile } from '@shared/types/social';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useUiStore } from '../stores/useUiStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { formatPlaytimeShort } from '../utils/format';
import { ActivityCard, Avatar, Cover, NowPlayingLine } from './friends/parts';
import { StatStrip } from './journal/PageLayout';
import { Button, Notice, Skeleton, focusRing } from './ui';

// Mesma regra do main (social.service gameKeyOf): o mesmo jogo em lojas diferentes tem a mesma chave
function gameKey(platform: string, platformGameId: string | undefined, title: string): string {
  if (platform === 'steam' && platformGameId && /^\d{1,10}$/.test(platformGameId)) return `steam:${platformGameId}`;
  return `t:${title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, 'and').replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 120)}`;
}

const TOP_BAR_REM = 7; // Barra do app (3rem) + a barra do amigo (4rem): o que sobra é da página dele

// Perfil de um amigo em página inteira: a vitrine que ele decorou (a mesma do próprio perfil, com o fundo dele) ou a comparação com você
export const FriendProfilePage: React.FC<{ friendId: string }> = ({ friendId }) => {
  const [profile, setProfile] = useState<SocialFriendProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const games = useLibraryStore((s) => s.games);
  const mine = useMemo(() => new Map(games.map((g) => [gameKey(g.platform, g.platformGameId, g.title), g])), [games]);

  // Vitrine: a página do perfil que o amigo decorou, por um link de 30 minutos do servidor
  const [showcase, setShowcase] = useState<{ url: string | null; reason?: 'hidden' | 'not_sent' } | null>(null);
  const [tab, setTab] = useState<'showcase' | 'compare'>('showcase');

  useEffect(() => {
    let alive = true;
    window.electronAPI
      ?.socialGetFriendProfile(friendId)
      .then((p) => alive && setProfile(p))
      .catch((err) => alive && setError(ipcErrorMessage(err)));
    window.electronAPI
      ?.socialGetFriendShowcaseUrl(friendId)
      .then((s) => alive && setShowcase(s))
      .catch(() => alive && setShowcase({ url: null }));
    return () => {
      alive = false;
    };
  }, [friendId]);

  const back = () => useUiStore.getState().setView('friends');
  const showingFrame = tab === 'showcase' && !!showcase?.url;
  const showcaseNote =
    tab === 'showcase' && showcase && !showcase.url
      ? showcase.reason === 'hidden'
        ? 'Essa pessoa escondeu a vitrine do perfil. Abaixo, o que dá para comparar.'
        : 'A vitrine aparece quando essa pessoa atualizar o Lazulium para a 2.2 ou mais nova. Abaixo, o que dá para comparar.'
      : null;

  const remove = async () => {
    setRemoving(true);
    try {
      await window.electronAPI?.socialRemoveFriend(friendId);
      back();
    } catch (err) {
      setError(ipcErrorMessage(err));
      setRemoving(false);
    }
  };

  const totals = profile?.summary?.totals;
  const inCommon = profile?.summary?.topGames.filter((g) => mine.has(g.gameKey)).length ?? 0;
  const showCompare = tab === 'compare' || (!!showcase && !showingFrame);

  return (
    <div className="min-h-full flex flex-col animate-fade-in">
      <div className="sticky top-0 z-20 h-16 flex-shrink-0 border-b border-slate-800/80 bg-steam-bg/90 backdrop-blur">
        <div className="h-full max-w-6xl mx-auto px-6 flex items-center gap-4">
          <Button variant="ghost" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={back} data-nav-start="">
            Amigos
          </Button>
          {profile && (
            <div className="flex items-center gap-3 min-w-0">
              <Avatar user={profile.user} size="sm" />
              <div className="min-w-0">
                <h1 className="text-base leading-tight text-white truncate">{profile.user.name}</h1>
                {profile.nowPlaying && (
                  <p className="text-xs">
                    <NowPlayingLine nowPlaying={profile.nowPlaying} />
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 ml-4" role="tablist" aria-label="Partes do perfil">
            {(
              [
                { id: 'showcase', label: 'Perfil' },
                { id: 'compare', label: 'Comparar' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${focusRing} ${tab === item.id ? 'bg-indigo-500/20 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {confirmRemove ? (
              <>
                <span className="hidden md:inline text-xs text-slate-400">Vocês deixam de ver o feed um do outro.</span>
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
            )}
          </div>
        </div>
      </div>

      {showingFrame && (
        // Página do servidor numa moldura isolada: sem acesso ao app nem ao login; links abrem no navegador
        <iframe
          src={showcase!.url!}
          title={`Perfil de ${profile?.user.name ?? 'amigo'}`}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="block w-full border-0 bg-slate-950"
          style={{ height: `calc(100vh - ${TOP_BAR_REM}rem)` }}
        />
      )}

      {!showingFrame && (
        <div className="max-w-5xl w-full mx-auto px-6 py-6 space-y-6">
          {tab === 'showcase' && !showcase && <Skeleton className="h-[60vh] w-full" />}
          {showcaseNote && <Notice tone="info">{showcaseNote}</Notice>}
          {showCompare && error && <Notice>{error}</Notice>}
          {showCompare && !profile && !error && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {showCompare && profile && (
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
        </div>
      )}
    </div>
  );
};
