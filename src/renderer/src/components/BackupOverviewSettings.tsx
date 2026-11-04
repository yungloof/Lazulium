import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, HardDriveDownload, Loader2, RefreshCw } from 'lucide-react';
import { BackupOverview } from '@shared/types/cloudsync';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);

// O estado de todos os saves num lugar só, e um botão para não depender da passada diária
export const BackupOverviewSettings: React.FC = () => {
  const [overview, setOverview] = useState<BackupOverview | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    window.electronAPI?.getBackupOverview().then(setOverview).catch((err) => setError(ipcErrorMessage(err)));
  }, []);

  useEffect(load, [load]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      setOverview((await window.electronAPI?.runBackupSweep()) ?? null);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="space-y-3 pb-5 border-b border-slate-800/80">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
        <HardDriveDownload className="w-3.5 h-3.5 text-indigo-400" /> Backup de saves
      </h3>
      {overview && (
        <>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div className="px-2 py-2.5 rounded-lg bg-slate-900/60">
              <dd className="text-lg text-white">{overview.games}</dd>
              <dt className="text-[11px] text-slate-400">jogos protegidos</dt>
            </div>
            <div className="px-2 py-2.5 rounded-lg bg-slate-900/60">
              <dd className="text-lg text-white">{overview.backups}</dd>
              <dt className="text-[11px] text-slate-400">backups ({formatSize(overview.sizeBytes)})</dt>
            </div>
            <div className="px-2 py-2.5 rounded-lg bg-slate-900/60">
              <dd className="text-lg text-white">{overview.onDrive}</dd>
              <dt className="text-[11px] text-slate-400">no Google Drive</dt>
            </div>
          </dl>
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            {overview.pendingUpload > 0 ? (
              <>
                <CloudOff className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                {overview.pendingUpload} ainda só neste PC. {overview.driveConnected ? 'Sobem na próxima passada.' : 'Conecte o Google Drive em Contas para enviar.'}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                Tudo enviado.
              </>
            )}
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              {overview.lastSweepAt ? `Última conferência: ${new Date(overview.lastSweepAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Primeira conferência em andamento.'} Roda ao fechar o jogo e uma vez por dia.
            </span>
            <button onClick={runNow} disabled={running} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}>
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {running ? 'Conferindo...' : 'Conferir agora'}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-amber-300">{error}</p>}
    </section>
  );
};
