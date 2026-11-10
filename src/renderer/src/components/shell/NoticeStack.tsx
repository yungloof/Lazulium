import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff, X } from 'lucide-react';
import { useUiStore } from '../../stores/useUiStore';
import { useGamepadStore } from '../../stores/useGamepadStore';
import { focusRing, iconButtonClass } from '../ui';

const NOTICE_MS = 6000;
const NOTICE_WITH_ACTION_MS = 15000;

const toastClass = 'pointer-events-auto w-full rounded-lg border shadow-xl shadow-black/40 backdrop-blur-md animate-toast-in';

// Avisos no canto da tela: sessão registrada, backup feito, scan concluído, sem internet.
// Não empurram o conteúdo e esperam o mouse sair de cima para sumir.
export const NoticeStack: React.FC = () => {
  const notice = useUiStore((s) => s.notice);
  const dismissNotice = useUiStore((s) => s.dismissNotice);
  const scanSummary = useUiStore((s) => s.scanSummary);
  const setScanSummary = useUiStore((s) => s.setScanSummary);
  const isOnline = useUiStore((s) => s.isOnline);
  const hasGamepad = useGamepadStore((s) => !!s.gamepad?.connected);
  const [hovered, setHovered] = useState(false);

  // O aviso que estava sob o mouse sumiu: o próximo volta a contar o tempo
  useEffect(() => setHovered(false), [notice?.id]);

  useEffect(() => {
    if (!notice || hovered) return;
    const timer = setTimeout(dismissNotice, notice.action ? NOTICE_WITH_ACTION_MS : NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, hovered, dismissNotice]);

  if (!notice && !scanSummary && isOnline) return null;

  return (
    <div
      className={`fixed right-5 z-40 w-[min(420px,calc(100vw-2.5rem))] flex flex-col gap-2 pointer-events-none ${hasGamepad ? 'bottom-14' : 'bottom-5'}`}
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {!isOnline && (
        <div role="status" className={`${toastClass} flex items-start gap-3 px-4 py-3 bg-steam-panel/95 border-slate-700 text-xs text-slate-300`}>
          <WifiOff className="w-4 h-4 mt-px flex-shrink-0 text-amber-400" />
          <span>
            <b className="block mb-0.5 font-semibold text-slate-100">Sem conexão</b>
            Jogar, contar horas e fazer backups locais continua funcionando. Artes, conquistas e Google Drive voltam sozinhos com a internet.
          </span>
        </div>
      )}

      {scanSummary && (
        <div role="status" className={`${toastClass} flex items-start gap-3 px-4 py-3 bg-steam-panel/95 border-slate-700 text-xs`}>
          <RefreshCw className="w-4 h-4 mt-px flex-shrink-0 text-indigo-400" />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-slate-200">
              <b className="font-semibold text-slate-50">Scan concluído:</b> <b className="text-emerald-400">{scanSummary.added}</b> novos,{' '}
              <b className="text-indigo-300">{scanSummary.updated}</b> atualizados, {scanSummary.total} na biblioteca.
            </p>
            {scanSummary.warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 text-amber-300">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {w}
              </p>
            ))}
          </div>
          <button onClick={() => setScanSummary(null)} className={`${iconButtonClass} -m-1`} aria-label="Fechar aviso do scan">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {notice && (
        <div
          key={notice.id}
          role={notice.tone === 'warn' ? 'alert' : 'status'}
          className={`${toastClass} flex items-center gap-3 px-4 py-3 text-xs ${
            notice.tone === 'ok' ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200' : 'bg-amber-950/90 border-amber-500/35 text-amber-200'
          }`}
        >
          {notice.tone === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
          )}
          <span className="flex-1 min-w-0 leading-snug">{notice.text}</span>
          {notice.action && (
            <button
              onClick={notice.action.run}
              className={`flex-shrink-0 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 font-semibold text-white transition-colors ${focusRing}`}
            >
              {notice.action.label}
            </button>
          )}
          <button onClick={dismissNotice} className={`${iconButtonClass} -m-1 flex-shrink-0`} aria-label="Fechar aviso">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
