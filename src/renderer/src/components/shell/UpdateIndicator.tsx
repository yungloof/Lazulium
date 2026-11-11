import React, { useEffect, useState } from 'react';
import { Download, Loader2, RotateCcw } from 'lucide-react';
import type { UpdateStatus } from '@shared/types/ipc';
import { focusRing } from '../ui';

const chip = `titlebar-no-drag flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors ${focusRing}`;

// Atualização na barra do topo: baixando (com %), pronta para instalar ou, na versão portátil, nova versão para baixar.
// Some quando não há nada; o aviso some só depois de instalar, para não ser esquecido.
export const UpdateIndicator: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    window.electronAPI
      ?.getUpdateStatus()
      .then(setStatus)
      .catch(() => undefined);
    return window.electronAPI?.onUpdateStatus(setStatus);
  }, []);

  if (!status?.available || !status.version) return null;

  if (status.manualDownload && status.downloadUrl) {
    return (
      <a
        href={status.downloadUrl}
        target="_blank"
        rel="noreferrer"
        title="Esta é a versão portátil: baixe a nova e substitua o arquivo"
        className={`${chip} bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25`}
      >
        <Download className="w-3.5 h-3.5" /> Baixar a {status.version}
      </a>
    );
  }

  if (status.downloaded) {
    const install = () => {
      setInstalling(true);
      void window.electronAPI?.quitAndInstallUpdate().catch(() => setInstalling(false));
    };
    return (
      <button
        type="button"
        onClick={install}
        disabled={installing}
        title={`Fecha o Lazulium, instala a ${status.version} e abre de novo. Se preferir, ela instala sozinha quando você fechar o app.`}
        className={`${chip} bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-70`}
      >
        {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
        Atualizar para a {status.version}
      </button>
    );
  }

  return (
    <span className={`${chip} text-slate-400 font-medium`} title={`Baixando o Lazulium ${status.version} em segundo plano`}>
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span className="hidden xl:inline">Baixando atualização</span>
      {typeof status.progress === 'number' && <span className="tabular-nums">{status.progress}%</span>}
    </span>
  );
};
