import React, { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Send, Trash2 } from 'lucide-react';
import { ReactionTarget, ReactionThread } from '@shared/types/social';
import { reactionKey } from '@shared/utils/reactions';
import { useReactionsStore } from '../../stores/useReactionsStore';
import { formatLastPlayed } from '../../utils/format';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Notice, focusRing, inputClass } from '../ui';
import { Avatar } from './parts';

// Curtir e comentar uma resenha ou lista. Só aparece quando o servidor diz que você pode ver
// (a resenha/lista é sua ou de um amigo); servidor antigo ou sem conta: nada aparece.

const MAX_TEXT = 1000;

export function formatAgo(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return formatLastPlayed(iso).toLowerCase();
}

const likersText = (thread: ReactionThread, me: string | null): string => {
  const names = thread.likers.map((u) => (u.id === me ? 'você' : u.name));
  const shown = names.slice(0, 4);
  const rest = thread.likes - shown.length;
  return rest > 0 ? `${shown.join(', ')} e mais ${rest}` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}` : shown[0] ?? '';
};

const pill = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${focusRing}`;

const Thread: React.FC<{ target: ReactionTarget; own: boolean; onChange: (thread: ReactionThread) => void; autoFocus: boolean }> = ({ target, own, onChange, autoFocus }) => {
  const me = useReactionsStore((s) => s.me);
  const [thread, setThread] = useState<ReactionThread | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    window.electronAPI
      ?.socialGetReactionThread(target)
      .then((t) => {
        if (!alive) return;
        setThread(t);
        onChange(t);
      })
      .catch((err) => alive && setError(ipcErrorMessage(err)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactionKey(target)]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const apply = (t: ReactionThread) => {
    setThread(t);
    onChange(t);
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const t = await window.electronAPI?.socialAddComment(target, text);
      if (t) apply(t);
      setText('');
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      const t = await window.electronAPI?.socialDeleteComment(id);
      if (t) apply(t);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg bg-slate-950/40 border border-slate-800/80 p-3">
      {thread && thread.likes > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Heart className="w-3 h-3 fill-rose-400 text-rose-400 flex-shrink-0" />
          <span className="min-w-0">
            {likersText(thread, me)} {thread.likes === 1 ? 'curtiu' : 'curtiram'}
          </span>
        </p>
      )}
      {thread && thread.comments.length > 0 && (
        <ul className="space-y-2.5">
          {thread.comments.map((c) => (
            <li key={c.id} className="flex gap-2 group">
              <Avatar user={c.user} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 text-[11px]">
                  <span className="font-semibold text-slate-200 truncate">{c.user.id === me ? 'Você' : c.user.name}</span>
                  <span className="text-slate-500 flex-shrink-0">{formatAgo(c.createdAt)}</span>
                  {(c.user.id === me || own) && (
                    <button
                      type="button"
                      onClick={() => void remove(c.id)}
                      title="Apagar comentário"
                      aria-label="Apagar comentário"
                      className={`ml-auto p-0.5 rounded text-slate-600 hover:text-red-300 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${focusRing}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </p>
                <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-line break-words select-text">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {thread && thread.comments.length === 0 && thread.likes === 0 && <p className="text-[11px] text-slate-500">Ninguém comentou ainda.</p>}
      <form onSubmit={send} className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          onKeyDown={(e) => {
            // Enter envia; Shift+Enter quebra a linha
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={own ? 'Responder' : 'Escreva um comentário'}
          aria-label="Comentário"
          className={`${inputClass} !py-1.5 text-xs resize-none leading-relaxed min-h-[2rem] max-h-32 field-sizing-content`}
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          title="Enviar"
          aria-label="Enviar comentário"
          className={`flex-shrink-0 p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none ${focusRing}`}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
      {error && <Notice>{error}</Notice>}
    </div>
  );
};

export const ReactionBar: React.FC<{ target: ReactionTarget | null; className?: string; defaultOpen?: boolean; alwaysShow?: boolean }> = ({
  target,
  className = '',
  defaultOpen = false,
  alwaysShow = false
}) => {
  const me = useReactionsStore((s) => s.me);
  const key = target ? reactionKey(target) : null;
  const summary = useReactionsStore((s) => (key ? s.summaries[key] : undefined));
  const [open, setOpen] = useState(defaultOpen);
  const [focusInput, setFocusInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target && me) useReactionsStore.getState().request(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, me]);

  if (!target || !summary) return null;
  const own = target.owner === me;
  // Na sua resenha ou lista só aparece quando alguém já reagiu (em listas em grupo sempre mostra comentários)
  if (!alwaysShow && own && summary.likes === 0 && summary.comments === 0 && !open) return null;

  const toggleLike = async () => {
    const before = summary;
    const store = useReactionsStore.getState();
    const like = !summary.liked;
    store.setSummary(target, { ...summary, liked: like, likes: Math.max(0, summary.likes + (like ? 1 : -1)) });
    setError(null);
    try {
      const next = await window.electronAPI?.socialSetLike(target, like);
      if (next) useReactionsStore.getState().setSummary(target, next);
    } catch (err) {
      useReactionsStore.getState().setSummary(target, before);
      setError(ipcErrorMessage(err));
    }
  };

  const onThread = (t: ReactionThread) => useReactionsStore.getState().setSummary(target, { likes: t.likes, liked: t.liked, comments: t.comments.length });

  const commentsLabel = summary.comments === 0 ? (own ? 'Comentários' : 'Comentar') : summary.comments === 1 ? '1 comentário' : `${summary.comments} comentários`;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {own ? (
          summary.likes > 0 && (
            <span className={`${pill} cursor-default bg-rose-500/10 text-rose-200`} title="Curtidas na sua resenha ou lista">
              <Heart className="w-3.5 h-3.5 fill-current" /> {summary.likes}
            </span>
          )
        ) : (
          <button
            type="button"
            onClick={() => void toggleLike()}
            aria-pressed={summary.liked}
            title={summary.liked ? 'Descurtir' : 'Curtir'}
            className={`${pill} ${summary.liked ? 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
          >
            <Heart className={`w-3.5 h-3.5 ${summary.liked ? 'fill-current' : ''}`} />
            {summary.likes > 0 ? summary.likes : 'Curtir'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setFocusInput(!open);
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          className={`${pill} ${open ? 'bg-indigo-500/20 text-indigo-100' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
        >
          <MessageCircle className="w-3.5 h-3.5" /> {commentsLabel}
        </button>
      </div>
      {error && <Notice className="mt-2">{error}</Notice>}
      {open && <Thread target={target} own={own} onChange={onThread} autoFocus={focusInput} />}
    </div>
  );
};

// Sua resenha ou lista: as curtidas e os comentários que seus amigos deixaram
export const MyReactionBar: React.FC<{ kind: ReactionTarget['kind']; target: string | null; title: string; className?: string }> = ({ kind, target, title, className }) => {
  const me = useReactionsStore((s) => s.me);
  return <ReactionBar target={me && target ? { owner: me, kind, target, title } : null} className={className} />;
};
