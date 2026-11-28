import React, { useEffect, useState } from 'react';
import { Phone, PhoneMissed, X } from 'lucide-react';
import { CallAnswer, IncomingCall } from '@shared/types/social';
import { useSocialLiveStore } from '../../stores/useSocialLiveStore';
import { useUiStore } from '../../stores/useUiStore';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Avatar } from '../friends/parts';
import { focusRing } from '../ui';

// Chamadas que ainda esperam resposta: aparecem no topo do app (a tela doida pode ter fechado sem resposta,
// ou a chamada chegou em Não perturbar, com jogo aberto ou com o app fechado)

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const RING_MS = 2 * 60_000;

const CallCard: React.FC<{ call: IncomingCall }> = ({ call }) => {
  const [busy, setBusy] = useState<CallAnswer | 'back' | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const missed = call.missed || now - Date.parse(call.createdAt) > RING_MS;
  // Passados os 2 minutos a chamada vira "perdida" sozinha, sem esperar outra coisa redesenhar o aviso
  useEffect(() => {
    if (missed) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1_000, Date.parse(call.createdAt) + RING_MS - Date.now() + 500));
    return () => clearTimeout(timer);
  }, [missed, call.createdAt, now]);
  // Fechar sem responder: some daqui e do main (senão voltava quando o app recarrega as chamadas)
  const dismiss = () => {
    useSocialLiveStore.getState().removeIncoming(call.id);
    void window.electronAPI?.socialForgetCall(call.id).catch(() => undefined);
  };

  const answer = async (value: CallAnswer) => {
    setBusy(value);
    try {
      await window.electronAPI?.socialAnswerCall(call.id, value);
      dismiss();
    } catch (err) {
      useUiStore.getState().showNotice({ text: ipcErrorMessage(err), tone: 'warn' });
      setBusy(null);
    }
  };

  // Chamada perdida: chamar de volta faz o mesmo barulho do outro lado. A perdida só sai da lista
  // (antes ela respondia "Tô indo!", e quem tinha chamado recebia um "Tô indo pra call" que não era verdade)
  const callBack = async () => {
    setBusy('back');
    try {
      const sent = await window.electronAPI?.socialCallFriend(call.from.id);
      if (sent) useSocialLiveStore.getState().markCalled(call.from.id, sent.id);
      dismiss();
      useUiStore.getState().showNotice({ text: `Chamando ${call.from.name}...`, tone: 'ok' });
    } catch (err) {
      useUiStore.getState().showNotice({ text: ipcErrorMessage(err), tone: 'warn' });
      setBusy(null);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-label={`${call.from.name} tá te chamando pra call no Discord`}
      className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md animate-toast-in ${
        missed ? 'bg-slate-900/95 border-slate-700' : 'bg-gradient-to-r from-red-600/90 to-rose-600/90 border-red-300/40'
      }`}
    >
      <span className={missed ? '' : 'animate-wiggle'}>
        <Avatar user={call.from} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-bold text-white">
          {missed && <PhoneMissed className="w-4 h-4 text-red-300 flex-shrink-0" />}
          <span className="truncate">{call.from.name}</span>
        </p>
        <p className={`text-xs leading-snug ${missed ? 'text-slate-400' : 'text-red-50'}`}>
          {missed ? `Te chamou pra call no Discord às ${timeOf(call.createdAt)}` : 'Tá te chamando pra call no Discord!'}
        </p>
      </div>
      {missed ? (
        <button
          type="button"
          data-nav-start=""
          onClick={() => void callBack()}
          disabled={!!busy}
          className={`flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 px-3.5 py-2 text-sm font-bold text-white disabled:opacity-60 ${focusRing}`}
        >
          <Phone className="w-4 h-4" /> Chamar de volta
        </button>
      ) : (
        <>
          <button
            type="button"
            data-nav-start=""
            onClick={() => void answer('yes')}
            disabled={!!busy}
            className={`rounded-xl bg-emerald-400 hover:bg-emerald-300 px-4 py-2 text-sm font-black text-emerald-950 disabled:opacity-60 ${focusRing}`}
          >
            Tô indo! 🎧
          </button>
          <button
            type="button"
            onClick={() => void answer('no')}
            disabled={!!busy}
            className={`rounded-xl bg-black/25 hover:bg-black/40 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 ${focusRing}`}
          >
            Agora não
          </button>
        </>
      )}
      <button type="button" onClick={dismiss} aria-label="Fechar aviso" title="Fechar (sem responder)" className={`p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 ${focusRing}`}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const IncomingCalls: React.FC = () => {
  const calls = useSocialLiveStore((s) => s.incoming);
  if (calls.length === 0) return null;
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[min(560px,calc(100vw-2rem))] flex flex-col gap-2 pointer-events-none" aria-live="assertive">
      {calls.slice(-3).map((call) => (
        <CallCard key={call.id} call={call} />
      ))}
    </div>
  );
};
