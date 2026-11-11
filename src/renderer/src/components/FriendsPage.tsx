import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Eye, Gamepad2, LogIn, RefreshCw, Rss, Shield, Ticket, UserPlus, Users } from 'lucide-react';
import { SocialFeedItem, SocialFriend, SocialInvite } from '@shared/types/social';
import { useSocial } from '../hooks/useSocial';
import { useUiStore } from '../stores/useUiStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { ActivityCard, Avatar, NowPlayingLine } from './friends/parts';
import { PageHeader, emptyBox, pageClass } from './journal/PageLayout';
import { Button, EmptyState, Notice, SectionHeader, Skeleton, focusRing, inputClass } from './ui';

const openFriend = (friendId: string) => useUiStore.getState().openModal({ kind: 'friendProfile', friendId });
const openSettings = () => useUiStore.getState().openModal({ kind: 'settings' });

// Sem conta: explica o que é, o que vai para os amigos e como entrar
const Welcome: React.FC<{ onLogin: () => void; busy: boolean; error: string | null }> = ({ onLogin, busy, error }) => (
  <div className="max-w-3xl mx-auto px-8 pt-14 pb-14 animate-fade-in">
    <div className="rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/15 via-slate-900/60 to-slate-900/40 p-8">
      <span className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
        <Users className="w-7 h-7 text-indigo-200" />
      </span>
      <h1 className="mt-5 text-3xl text-white">Seus amigos no Lazulium</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        Veja o que seus amigos estão jogando agora, o que zeraram, as conquistas e as notas que deram, de qualquer loja: Steam, Epic, GOG, emuladores e jogos
        avulsos.
      </p>
      <ul className="mt-5 grid sm:grid-cols-3 gap-3 text-sm">
        {[
          { icon: Rss, title: 'Feed', text: 'Jogou, zerou, fez 100%, deu nota.' },
          { icon: Gamepad2, title: 'Jogando agora', text: 'Quem está em jogo neste momento.' },
          { icon: Eye, title: 'Perfil', text: 'Horas, mais jogados e resenhas.' }
        ].map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-xl bg-slate-950/40 p-3.5">
            <Icon className="w-4 h-4 text-indigo-300" />
            <p className="mt-2 font-semibold text-slate-100">{title}</p>
            <p className="text-xs text-slate-400">{text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" icon={<LogIn className="w-4 h-4" />} loading={busy} onClick={onLogin}>
          Entrar com a Steam
        </Button>
        <span className="text-xs text-slate-400">{busy ? 'Entre no navegador que abriu e volte para cá.' : 'Sem senha nova: a Steam só confirma quem é você.'}</span>
      </div>
      {error && <Notice className="mt-4">{error}</Notice>}
      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
        <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-300" />
        Só seus amigos veem, e você escolhe o que mostrar em Configurações → Contas. Nada de e-mail, caminhos do PC ou arquivos. Dá para apagar a conta e
        tudo dela a qualquer momento.
      </p>
    </div>
  </div>
);

const InviteBox: React.FC<{ onFriendAdded: () => void }> = ({ onFriendAdded }) => {
  const [invite, setInvite] = useState<SocialInvite | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'accept' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy('create');
    setMessage(null);
    try {
      setInvite((await window.electronAPI?.socialCreateInvite()) ?? null);
    } catch (err) {
      setMessage({ tone: 'error', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.code).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const accept = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy('accept');
    setMessage(null);
    try {
      const friend = await window.electronAPI?.socialAcceptInvite(code);
      setCode('');
      setMessage({ tone: 'success', text: `Agora você e ${friend?.name ?? 'seu amigo'} são amigos no Lazulium.` });
      onFriendAdded();
    } catch (err) {
      setMessage({ tone: 'error', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl bg-slate-900/50 border border-slate-800/90 p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <UserPlus className="w-4 h-4 text-indigo-300" /> Adicionar amigo
      </h3>
      {invite ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-slate-950/60 border border-slate-700/80 px-3 py-2 text-center font-mono text-lg tracking-[0.25em] text-white">{invite.code}</code>
          <Button icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={copy}>
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      ) : (
        <Button icon={<Ticket className="w-3.5 h-3.5" />} loading={busy === 'create'} onClick={create} className="w-full">
          Gerar meu código de convite
        </Button>
      )}
      {invite && <p className="text-xs text-slate-400">Mande o código para seu amigo. Vale por 7 dias e pode ser usado por várias pessoas.</p>}
      <form onSubmit={accept} className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Código de um amigo"
          aria-label="Código de convite de um amigo"
          maxLength={12}
          className={`${inputClass} font-mono tracking-widest`}
        />
        <Button type="submit" variant="primary" loading={busy === 'accept'} disabled={!code.trim()}>
          Adicionar
        </Button>
      </form>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </section>
  );
};

const FriendRow: React.FC<{ friend: SocialFriend }> = ({ friend }) => (
  <li>
    <button type="button" onClick={() => openFriend(friend.id)} className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-slate-800/50 ${focusRing}`}>
      <Avatar user={friend} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-100 truncate">{friend.name}</span>
        {friend.nowPlaying ? (
          <NowPlayingLine nowPlaying={friend.nowPlaying} />
        ) : (
          <span className="block text-xs text-slate-500 truncate">Visto {friend.lastSeenAt ? formatSeen(friend.lastSeenAt) : 'há tempo'}</span>
        )}
      </span>
    </button>
  </li>
);

function formatSeen(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 15) return 'agora há pouco';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

// Aba Amigos: feed no meio, amigos e convite ao lado
export const FriendsPage: React.FC = () => {
  const social = useSocial();
  const connected = !!social.status?.connected;
  const [friends, setFriends] = useState<SocialFriend[] | null>(null);
  const [feed, setFeed] = useState<SocialFeedItem[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [f, items] = await Promise.all([window.electronAPI?.socialGetFriends(), window.electronAPI?.socialGetFeed()]);
      setFriends(f ?? []);
      setFeed(items ?? []);
      setHasMore((items?.length ?? 0) >= 30);
    } catch (err) {
      setError(ipcErrorMessage(err));
      setFriends((prev) => prev ?? []);
      setFeed((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    if (!connected) return;
    void load();
    // "Jogando agora" muda sozinho: atualiza a cada minuto enquanto a aba está aberta
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [connected, load]);

  const loadMore = async () => {
    const last = feed?.[feed.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const more = (await window.electronAPI?.socialGetFeed(last.at)) ?? [];
      setFeed((prev) => [...(prev ?? []), ...more.filter((m) => !prev?.some((p) => p.id === m.id && p.user.id === m.user.id))]);
      setHasMore(more.length >= 30);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  if (!social.status) return <div className={pageClass}><Skeleton className="h-64 w-full" /></div>;
  if (!connected) return <Welcome onLogin={() => void social.login()} busy={social.busy === 'login'} error={social.error} />;

  const playing = friends?.filter((f) => f.nowPlaying) ?? [];

  return (
    <div className={pageClass}>
      <PageHeader
        title="Amigos"
        subtitle="O que seus amigos andam jogando, em qualquer loja."
        actions={
          <>
            <Button icon={<RefreshCw className={`w-3.5 h-3.5 ${social.busy === 'sync' ? 'animate-spin' : ''}`} />} onClick={() => void social.sync().then(load)}>
              Atualizar
            </Button>
            <Button icon={<Shield className="w-3.5 h-3.5" />} onClick={openSettings}>
              Privacidade
            </Button>
          </>
        }
      />
      {(error || social.status.syncError) && <Notice>{error ?? `Não foi possível enviar suas atividades: ${social.status.syncError}`}</Notice>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <section>
          <SectionHeader icon={Rss} title="Feed" />
          {feed === null ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <div className={emptyBox}>
              <EmptyState
                icon={Rss}
                title={friends?.length ? 'Nada no feed ainda' : 'Adicione seus amigos'}
                description={
                  friends?.length
                    ? 'Quando seus amigos jogarem, zerarem ou derem nota em algo, aparece aqui.'
                    : 'Gere o seu código de convite ao lado e mande para eles, ou cole o código que um amigo te mandou.'
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              {feed.map((item) => (
                <ActivityCard key={`${item.user.id}|${item.id}`} activity={item} user={item.user} onOpenUser={() => openFriend(item.user.id)} />
              ))}
              {hasMore && (
                <div className="flex justify-center pt-1">
                  <Button loading={loadingMore} onClick={loadMore}>
                    Ver mais
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {playing.length > 0 && (
            <section className="rounded-xl bg-emerald-500/5 border border-emerald-400/20 p-3">
              <h3 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">Jogando agora</h3>
              <ul>
                {playing.map((f) => (
                  <FriendRow key={f.id} friend={f} />
                ))}
              </ul>
            </section>
          )}
          <section className="rounded-xl bg-slate-900/50 border border-slate-800/90 p-3">
            <h3 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Amigos {friends ? <span className="tabular-nums text-slate-500">{friends.length}</span> : null}
            </h3>
            {friends === null ? (
              <Skeleton className="h-24 w-full" />
            ) : friends.length === 0 ? (
              <p className="px-1 py-2 text-xs text-slate-500">Ninguém ainda. Use o convite abaixo.</p>
            ) : (
              <ul>
                {friends.map((f) => (
                  <FriendRow key={f.id} friend={f} />
                ))}
              </ul>
            )}
          </section>
          <InviteBox onFriendAdded={() => void load()} />
        </aside>
      </div>
    </div>
  );
};
