import React, { useEffect, useState } from 'react';
import { Phone, PhoneMissed, PhoneOff } from 'lucide-react';
import { FriendPresence } from '@shared/types/social';
import { useSocialLiveStore } from '../../stores/useSocialLiveStore';
import { useUiStore } from '../../stores/useUiStore';
import { callPhase } from '../../utils/callPhase';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { focusRing } from '../ui';

// O botão vermelho gigante do perfil do amigo: avisa que você está chamando pra call no Discord. Do outro lado a
// tela fica doida e toca música alta (ou só notifica, conforme o que o amigo escolheu), para ele ver mesmo longe do PC.
// Quem chama acompanha a chamada como num telefone: chamando, tocando no PC do amigo, a resposta ou "não atendeu",
// e pode desligar enquanto toca (do outro lado a tela e o aviso fecham).

const ERROR_MS = 8_000;

const ANSWER_LABEL = {
  yes: { text: 'Tô indo! 🎧', tone: 'bg-emerald-500 text-emerald-950' },
  no: { text: 'Agora não', tone: 'bg-slate-700 text-slate-100' },
  busy: { text: 'Ocupado', tone: 'bg-slate-700 text-slate-100' }
} as const;

// Estado e ações de uma chamada para um amigo, o mesmo no botão grande do perfil e no pequeno da lista de amigos
function useFriendCall(friendId: string, onError: (text: string) => void) {
  const outgoing = useSocialLiveStore((s) => s.outgoing[friendId]);
  const [busy, setBusy] = useState<'call' | 'hangup' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const phase = callPhase(outgoing, now);
  // Relógio só enquanto há algo para mudar sozinho (tocando, ou a resposta que some depois de um tempo)
  useEffect(() => {
    if (phase === 'idle') return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [phase]);

  const call = async () => {
    setBusy('call');
    try {
      const sent = await window.electronAPI?.socialCallFriend(friendId);
      if (sent) useSocialLiveStore.getState().markCalled(friendId, sent.id);
      setNow(Date.now());
    } catch (err) {
      onError(ipcErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const hangUp = async () => {
    if (!outgoing) return;
    setBusy('hangup');
    try {
      await window.electronAPI?.socialCancelCall(outgoing.callId);
      useSocialLiveStore.getState().clearOutgoing(friendId);
    } catch (err) {
      onError(ipcErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return { outgoing, phase, busy, ringing: phase === 'ringing', call, hangUp };
}

export const CallButton: React.FC<{ friendId: string; friendName: string; presence: FriendPresence }> = ({ friendId, friendName, presence }) => {
  const [error, setError] = useState<string | null>(null);
  const { outgoing, phase, busy, ringing, call, hangUp } = useFriendCall(friendId, setError);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_MS);
    return () => clearTimeout(timer);
  }, [error]);

  const offline = presence === 'offline';

  const answer = phase === 'answered' && outgoing?.answer ? ANSWER_LABEL[outgoing.answer] : null;
  const caption = ringing
    ? outgoing?.rang
      ? `Tocando no PC de ${friendName}...`
      : `Chamando ${friendName}...`
    : offline
      ? `${friendName} está off-line`
      : presence === 'dnd'
        ? 'Está em Não perturbar: chega sem a tela doida'
        : phase === 'answered' || phase === 'unanswered'
          ? 'Chamar de novo'
          : 'Chamar pra call no Discord';

  return (
    <div className="fixed bottom-28 right-8 z-30 flex flex-col items-end gap-2.5 pointer-events-none">
      {(answer || error || phase === 'unanswered') && (
        <div
          role="status"
          className={`pointer-events-auto max-w-xs flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold shadow-xl shadow-black/40 animate-toast-in ${
            error ? 'bg-amber-500/95 text-amber-950' : answer ? answer.tone : 'bg-slate-800 text-slate-100'
          }`}
        >
          {error ? (
            error
          ) : answer ? (
            `${friendName}: ${answer.text}`
          ) : (
            <>
              <PhoneMissed className="w-4 h-4 text-red-300 flex-shrink-0" /> {friendName} não atendeu
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setError(null);
          void call();
        }}
        disabled={!!busy || ringing || offline}
        aria-label={caption}
        title={offline ? `${friendName} está com o Lazulium fechado` : ringing ? caption : `Avisar ${friendName} que você está chamando pra call no Discord`}
        className={`pointer-events-auto group relative w-28 h-28 rounded-full flex items-center justify-center text-white transition-transform
          bg-[radial-gradient(circle_at_35%_30%,#ff6b6b,#dc2626_55%,#991b1b)] shadow-[0_10px_0_#7f1d1d,0_20px_50px_rgba(220,38,38,.55)]
          hover:scale-105 active:translate-y-2 active:shadow-[0_2px_0_#7f1d1d,0_10px_30px_rgba(220,38,38,.5)]
          disabled:cursor-not-allowed disabled:hover:scale-100 ${offline ? 'grayscale opacity-60' : ''} ${focusRing} focus-visible:ring-offset-4 focus-visible:ring-offset-surface-bg`}
      >
        {ringing && <span className={`absolute inset-0 rounded-full bg-red-500/60 ${outgoing?.rang ? 'animate-ping' : 'animate-pulse'}`} aria-hidden />}
        {offline ? (
          <PhoneOff className="w-11 h-11 relative" />
        ) : (
          <Phone className={`w-12 h-12 relative drop-shadow ${ringing ? 'animate-wiggle' : 'group-hover:animate-wiggle'}`} />
        )}
      </button>
      <div className="flex items-center gap-2">
        {ringing && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              void hangUp();
            }}
            disabled={!!busy}
            className={`pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/70 hover:bg-black/85 px-3 py-1 text-xs font-bold text-red-200 hover:text-white backdrop-blur disabled:opacity-60 ${focusRing}`}
          >
            <PhoneOff className="w-3.5 h-3.5" /> Desligar
          </button>
        )}
        <span className="pointer-events-none rounded-full bg-black/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-white backdrop-blur">{caption}</span>
      </div>
    </div>
  );
};

// Botão pequeno ao lado de cada amigo on-line na lista: chama sem precisar abrir o perfil, e desliga enquanto toca.
// A resposta chega no aviso do app, como a do botão grande.
export const QuickCallButton: React.FC<{ friendId: string; friendName: string }> = ({ friendId, friendName }) => {
  const notifyError = (text: string) => useUiStore.getState().showNotice({ text, tone: 'warn' });
  const { outgoing, busy, ringing, call, hangUp } = useFriendCall(friendId, notifyError);
  const label = ringing ? `Desligar a chamada para ${friendName}` : `Chamar ${friendName} pra call no Discord`;
  return (
    <button
      type="button"
      onClick={() => void (ringing ? hangUp() : call())}
      disabled={!!busy}
      aria-label={label}
      title={ringing ? (outgoing?.rang ? `Tocando no PC de ${friendName}. Clique para desligar.` : `Chamando ${friendName}... Clique para desligar.`) : label}
      className={`relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-60 ${focusRing} ${
        ringing ? 'bg-red-600 text-white hover:bg-red-500' : 'text-slate-400 hover:text-white hover:bg-red-600/80'
      }`}
    >
      {ringing && <span className={`absolute inset-0 rounded-full bg-red-500/50 ${outgoing?.rang ? 'animate-ping' : 'animate-pulse'}`} aria-hidden />}
      {ringing ? <PhoneOff className="relative w-4 h-4" /> : <Phone className="w-4 h-4" />}
    </button>
  );
};
