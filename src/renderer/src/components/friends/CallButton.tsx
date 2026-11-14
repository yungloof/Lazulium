import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { FriendPresence } from '@shared/types/social';
import { useSocialLiveStore } from '../../stores/useSocialLiveStore';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { focusRing } from '../ui';

// O botão vermelho gigante do perfil do amigo: avisa que você está chamando pra call no Discord. Do outro lado a
// tela fica doida e toca música alta (ou só notifica, conforme o que o amigo escolheu), para ele ver mesmo longe do PC. Enquanto espera, o botão toca; a resposta aparece nele.

const RING_MS = 2 * 60_000;

const ANSWER_LABEL = {
  yes: { text: 'Tô indo! 🎧', tone: 'bg-emerald-500 text-emerald-950' },
  no: { text: 'Agora não', tone: 'bg-slate-700 text-slate-100' },
  busy: { text: 'Ocupado', tone: 'bg-slate-700 text-slate-100' }
} as const;

export const CallButton: React.FC<{ friendId: string; friendName: string; presence: FriendPresence }> = ({ friendId, friendName, presence }) => {
  const outgoing = useSocialLiveStore((s) => s.outgoing[friendId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const ringing = !!outgoing && !outgoing.answer && Date.now() - outgoing.at < RING_MS;
  // Depois de 2 min sem resposta, o botão volta ao normal
  useEffect(() => {
    if (!ringing) return;
    const timer = setTimeout(() => setTick((t) => t + 1), RING_MS - (Date.now() - outgoing!.at) + 50);
    return () => clearTimeout(timer);
  }, [ringing, outgoing]);

  const offline = presence === 'offline';
  const call = async () => {
    setBusy(true);
    setError(null);
    try {
      const sent = await window.electronAPI?.socialCallFriend(friendId);
      if (sent) useSocialLiveStore.getState().markCalled(friendId, sent.id);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const answer = outgoing?.answer ? ANSWER_LABEL[outgoing.answer] : null;
  const caption = ringing
    ? `Chamando ${friendName}...`
    : offline
      ? `${friendName} está off-line`
      : presence === 'dnd'
        ? 'Está em Não perturbar: chega sem a tela doida'
        : 'Chamar pra call no Discord';

  return (
    <div className="fixed bottom-28 right-8 z-30 flex flex-col items-end gap-2.5 pointer-events-none">
      {(answer || error) && (
        <div className={`pointer-events-auto max-w-xs rounded-2xl px-4 py-2.5 text-sm font-bold shadow-xl shadow-black/40 animate-toast-in ${error ? 'bg-amber-500/95 text-amber-950' : answer!.tone}`}>
          {error ?? `${friendName}: ${answer!.text}`}
        </div>
      )}
      <button
        type="button"
        onClick={() => void call()}
        disabled={busy || ringing || offline}
        aria-label={caption}
        title={offline ? `${friendName} está com o Lazulium fechado` : `Avisar ${friendName} que você está chamando pra call no Discord`}
        className={`pointer-events-auto group relative w-28 h-28 rounded-full flex items-center justify-center text-white transition-transform
          bg-[radial-gradient(circle_at_35%_30%,#ff6b6b,#dc2626_55%,#991b1b)] shadow-[0_10px_0_#7f1d1d,0_20px_50px_rgba(220,38,38,.55)]
          hover:scale-105 active:translate-y-2 active:shadow-[0_2px_0_#7f1d1d,0_10px_30px_rgba(220,38,38,.5)]
          disabled:cursor-not-allowed disabled:hover:scale-100 ${offline ? 'grayscale opacity-60' : ''} ${focusRing} focus-visible:ring-offset-4 focus-visible:ring-offset-steam-bg`}
      >
        {ringing && <span className="absolute inset-0 rounded-full bg-red-500/60 animate-ping" aria-hidden />}
        {offline ? (
          <PhoneOff className="w-11 h-11 relative" />
        ) : (
          <Phone className={`w-12 h-12 relative drop-shadow ${ringing ? 'animate-wiggle' : 'group-hover:animate-wiggle'}`} />
        )}
      </button>
      <span className="pointer-events-none rounded-full bg-black/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-white backdrop-blur">{caption}</span>
    </div>
  );
};
