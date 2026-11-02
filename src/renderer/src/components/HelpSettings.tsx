import React, { useEffect, useState } from 'react';
import { FileText, LifeBuoy } from 'lucide-react';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export const HelpSettings: React.FC = () => {
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.getAppInfo().then((info) => setVersion(info.version)).catch(() => undefined);
  }, []);

  const openLogs = async () => {
    setError(null);
    try {
      await window.electronAPI?.openLogsFolder();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  return (
    <section className="space-y-3 pt-5 border-t border-slate-800/80">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
        <LifeBuoy className="w-3.5 h-3.5 text-indigo-400" /> Ajuda e diagnóstico
      </h3>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Lazulium {version && <span className="text-slate-300">v{version}</span>}. Se algo der errado, abra a pasta de logs e
          envie o arquivo <code className="text-slate-300">lazulium.log</code> para quem te passou o app.
        </p>
        <button
          onClick={openLogs}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}
        >
          <FileText className="w-3.5 h-3.5" /> Abrir pasta de logs
        </button>
      </div>
      {error && <p className="text-[11px] text-amber-300">{error}</p>}
    </section>
  );
};
