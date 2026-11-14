import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { PresenceStatus } from '@shared/types/social';
import { PRESENCE_DURATIONS, PRESENCE_HINT, PRESENCE_LABEL } from '@shared/utils/presence';
import { useSocialLiveStore } from '../../stores/useSocialLiveStore';
import { useUiStore } from '../../stores/useUiStore';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { PresenceDot } from '../friends/presence';
import { focusRing } from '../ui';

// Seu status, como no Discord: Disponível, Ausente, Não perturbar e Invisível, com prazo para voltar.
// Só aparece com a conta Lazulium conectada.

const ROWS: PresenceStatus[] = ['online', 'away', 'dnd', 'invisible'];

const untilText = (iso?: string) => {
  if (!iso) return null;
  const at = new Date(iso);
  const sameDay = at.toDateString() === new Date().toDateString();
  const time = at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `até ${time}` : `até ${at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`;
};

export const StatusMenu: React.FC = () => {
  const connected = useSocialLiveStore((s) => s.connected);
  const presence = useSocialLiveStore((s) => s.presence);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<PresenceStatus | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key);
    // Abre com o foco na opção atual (teclado e controle)
    requestAnimationFrame(() => box.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!connected || !presence) return null;

  const pick = async (status: PresenceStatus, durationMs: number | null) => {
    setOpen(false);
    setExpanded(null);
    try {
      const next = await window.electronAPI?.socialSetPresence(status, durationMs);
      if (next) useSocialLiveStore.getState().setPresence(next);
    } catch (err) {
      useUiStore.getState().showNotice({ text: ipcErrorMessage(err), tone: 'warn' });
    }
  };

  const shown = presence.effective;
  const label = presence.auto ? 'Ausente (PC parado)' : PRESENCE_LABEL[shown];
  const until = presence.auto ? null : untilText(presence.until);

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Status: ${label}${until ? ` ${until}` : ''}`}
        className={`flex items-center gap-2 h-8 px-2.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors ${focusRing}`}
      >
        <PresenceDot status={shown} className="w-2.5 h-2.5" ring="" />
        <span className="hidden xl:inline">{label}</span>
      </button>

      {open && (
        <div role="menu" aria-label="Seu status" className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-slate-700/80 bg-[#111827] shadow-2xl shadow-black/60 p-1.5 animate-fade-in">
          {ROWS.map((status, index) => {
            const checked = presence.chosen === status;
            const hint = status === 'online' ? null : PRESENCE_HINT[status];
            const canExpand = status !== 'online';
            return (
              <React.Fragment key={status}>
                {index === 1 && <div className="my-1.5 h-px bg-slate-700/70" />}
                <div className="flex items-stretch rounded-lg hover:bg-slate-800/80">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    onClick={() => void pick(status, null)}
                    className={`flex-1 flex items-start gap-3 px-3 py-2.5 text-left rounded-lg ${focusRing}`}
                  >
                    <PresenceDot status={status} className="w-3 h-3 mt-1" ring="" />
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold ${checked ? 'text-white' : 'text-slate-200'}`}>{PRESENCE_LABEL[status]}</span>
                      {hint && <span className="block text-xs leading-snug text-slate-400">{hint}</span>}
                      {checked && until && <span className="block text-xs text-indigo-300">{until}</span>}
                    </span>
                  </button>
                  {canExpand && (
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => (v === status ? null : status))}
                      aria-expanded={expanded === status}
                      aria-label={`Por quanto tempo: ${PRESENCE_LABEL[status]}`}
                      title="Por quanto tempo"
                      className={`px-3 rounded-lg text-slate-400 hover:text-white ${focusRing}`}
                    >
                      <ChevronRight className={`w-4 h-4 transition-transform ${expanded === status ? 'rotate-90' : ''}`} />
                    </button>
                  )}
                </div>
                {expanded === status && (
                  <div className="ml-9 mb-1 grid grid-cols-2 gap-1" role="group" aria-label={`${PRESENCE_LABEL[status]} por quanto tempo`}>
                    {PRESENCE_DURATIONS.map((duration) => (
                      <button
                        key={duration.label}
                        type="button"
                        role="menuitem"
                        onClick={() => void pick(status, duration.ms)}
                        className={`px-2.5 py-1.5 rounded-md text-left text-xs text-slate-300 hover:bg-slate-700/70 hover:text-white ${focusRing}`}
                      >
                        {duration.label}
                      </button>
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          })}
          <p className="px-3 pt-2 pb-1 text-[11px] leading-snug text-slate-500">Parado por 10 minutos (sem jogo aberto) ou com a tela bloqueada, você aparece como Ausente sozinho.</p>
        </div>
      )}
    </div>
  );
};
