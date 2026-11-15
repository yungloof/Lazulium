import React, { useEffect, useState } from 'react';
import { BellOff, Ban, ChevronDown, Coffee, UserMinus } from 'lucide-react';
import { SocialBlockedUser, SocialMute, SocialUser } from '@shared/types/social';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Button, Modal, Notice, focusRing } from '../ui';
import { Avatar } from './parts';

const DAY_MS = 24 * 60 * 60 * 1000;

const DURATIONS = [
  { label: '1 dia', ms: DAY_MS },
  { label: '1 semana', ms: 7 * DAY_MS },
  { label: '1 mês', ms: 30 * DAY_MS },
  { label: 'Até eu desfazer', ms: null }
] as const;

// "Silenciado até 22/11, 18:30" ou "Silenciado até você desfazer"
export function mutedLabel(muted: SocialMute): string {
  if (!muted.until) return 'Silenciado até você desfazer';
  const when = new Date(muted.until);
  return `Silenciado até ${when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export const MutedBadge: React.FC<{ muted: SocialMute; className?: string }> = ({ muted, className = '' }) => (
  <span className={`inline-flex items-center gap-1 text-xs text-slate-400 ${className}`} title={mutedLabel(muted)}>
    <BellOff className="w-3 h-3" aria-hidden />
    <span className="sr-only">{mutedLabel(muted)}</span>
  </span>
);

type Busy = 'mute' | 'unmute' | 'block' | 'remove' | null;

interface Props {
  friend: SocialUser;
  muted: SocialMute | null;
  onMuted: (muted: SocialMute | null) => void;
  onGone: () => void;               // Bloqueou ou desfez a amizade: volta para a lista
  onClose: () => void;
}

// Silenciar por um tempo (a pessoa não fica sabendo), bloquear ou desfazer a amizade
export const TakeABreakModal: React.FC<Props> = ({ friend, muted, onMuted, onGone, onClose }) => {
  const [busy, setBusy] = useState<Busy>(null);
  const [confirm, setConfirm] = useState<'block' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (kind: Exclude<Busy, null>, run: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await run();
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const mute = (ms: number | null) =>
    act('mute', async () => {
      const result = await window.electronAPI?.socialMuteFriend(friend.id, ms === null ? null : new Date(Date.now() + ms).toISOString());
      onMuted(result ?? null);
      onClose();
    });

  const unmute = () =>
    act('unmute', async () => {
      await window.electronAPI?.socialUnmuteFriend(friend.id);
      onMuted(null);
      onClose();
    });

  const block = () =>
    act('block', async () => {
      await window.electronAPI?.socialBlockUser(friend.id);
      onGone();
    });

  const remove = () =>
    act('remove', async () => {
      await window.electronAPI?.socialRemoveFriend(friend.id);
      onGone();
    });

  return (
    <Modal title={`Dar um tempo com ${friend.name}`} icon={<Coffee className="w-4 h-4 text-indigo-300" />} onClose={onClose} size="sm">
      {error && <Notice>{error}</Notice>}

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <BellOff className="w-4 h-4 text-indigo-300" /> Silenciar
        </h3>
        <p className="text-xs leading-relaxed text-slate-400">
          O que essa pessoa faz some do seu feed e você não recebe avisos dela. Ela não fica sabendo e continua vendo você.
        </p>
        {muted ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 px-3 py-2">
            <span className="text-sm text-slate-200">{mutedLabel(muted)}</span>
            <Button variant="primary" loading={busy === 'unmute'} onClick={() => void unmute()} autoFocus>
              Tirar o silêncio
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {DURATIONS.map((d, i) => (
              <Button key={d.label} disabled={!!busy} onClick={() => void mute(d.ms)} autoFocus={i === 0}>
                {d.label}
              </Button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-slate-800 pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Ban className="w-4 h-4 text-red-300" /> Bloquear
        </h3>
        <p className="text-xs leading-relaxed text-slate-400">
          Desfaz a amizade, tira as curtidas e os comentários dessa pessoa nas suas resenhas e listas, e nenhum convite entre vocês vale até você desbloquear (em Amigos, Bloqueados). Ela não recebe aviso.
        </p>
        {confirm === 'block' ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={busy === 'block'} onClick={() => void block()}>
              Bloquear {friend.name}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="ghost" icon={<Ban className="w-3.5 h-3.5" />} disabled={!!busy} onClick={() => setConfirm('block')}>
              Bloquear
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-slate-800 pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <UserMinus className="w-4 h-4 text-slate-300" /> Desfazer amizade
        </h3>
        <p className="text-xs leading-relaxed text-slate-400">Vocês deixam de ver o feed um do outro. Dá para virar amigo de novo com um código novo.</p>
        {confirm === 'remove' ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={busy === 'remove'} onClick={() => void remove()}>
              Desfazer amizade
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="ghost" icon={<UserMinus className="w-3.5 h-3.5" />} disabled={!!busy} onClick={() => setConfirm('remove')}>
              Desfazer amizade
            </Button>
          </div>
        )}
      </section>
    </Modal>
  );
};

// Quem você bloqueou, para desbloquear. Some quando não tem ninguém. Lê ao abrir a aba (bloquear volta para ela)
export const BlockedBox: React.FC = () => {
  const [blocked, setBlocked] = useState<SocialBlockedUser[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.electronAPI
      ?.socialGetBlocked()
      .then((list) => alive && setBlocked(list))
      .catch(() => undefined); // Servidor antigo, sem a rota: a caixa só não aparece
    return () => {
      alive = false;
    };
  }, []);

  if (blocked.length === 0) return null;

  const unblock = async (user: SocialBlockedUser) => {
    setBusy(user.id);
    setError(null);
    try {
      await window.electronAPI?.socialUnblockUser(user.id);
      setBlocked((list) => list.filter((u) => u.id !== user.id));
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl bg-slate-900/50 border border-slate-800/90 p-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between rounded-lg px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 ${focusRing}`}
      >
        <span>
          Bloqueados <span className="tabular-nums text-slate-500">{blocked.length}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <>
          {error && <Notice>{error}</Notice>}
          <ul className="mt-2 space-y-1">
            {blocked.map((user) => (
              <li key={user.id} className="flex items-center gap-3 rounded-lg px-2.5 py-1.5">
                <Avatar user={user} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{user.name}</span>
                <Button variant="ghost" loading={busy === user.id} onClick={() => void unblock(user)}>
                  Desbloquear
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-xs text-slate-500">Desbloquear não refaz a amizade: para isso, um de vocês manda um código novo.</p>
        </>
      )}
    </section>
  );
};
