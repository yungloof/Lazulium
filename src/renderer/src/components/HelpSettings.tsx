import React, { useEffect, useState } from 'react';
import { Download, FileText, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import type { UpdateStatus } from '@shared/types/ipc';
import logo from '../assets/logo.png';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Notice, buttonClass } from './ui';
import { useUiStore } from '../stores/useUiStore';
import { SettingsGroup } from './settings/controls';
import { useGamepadStore } from '../stores/useGamepadStore';
import { detectGamepadFamily, getGamepadBindings } from '../utils/gamepadGlyphs';

function formatUpdateError(raw: string): string {
  if (/404|Cannot find latest\.yml/i.test(raw)) {
    return 'Nenhuma versão publicada encontrada.';
  }
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ENOTFOUND|ETIMEDOUT/i.test(raw)) {
    return 'Não foi possível verificar atualizações: sem conexão ou servidor indisponível.';
  }
  return `Falha ao verificar atualizações: ${raw}`;
}

// Atalhos padrão de controle adaptados conforme a marca conectada
const GAMEPAD_STATIC: [string, string][] = [
  ['Direcional / analógico esq.', 'Andar pela tela']
];

const KEYBOARD: [string, string][] = [
  ['Setas', 'Andar pela tela, como o direcional'],
  ['Enter', 'Abrir, confirmar'],
  ['Esc', 'Fechar janela'],
  ['Ctrl + K', 'Busca rápida de jogos'],
  ['F', 'Favoritar o jogo focado'],
  ['Backspace', 'Voltar para a biblioteca']
];

const GAMEPAD_LABELS: Record<string, string> = {
  Selecionar: 'Abrir, confirmar',
  Voltar: 'Voltar, fechar janela',
  Favoritar: 'Favoritar o jogo focado',
  Buscar: 'Buscar na biblioteca',
  Filtros: 'Trocar o filtro da biblioteca',
  Seções: 'Trocar de seção (Diário, Listas...)',
  Opções: 'Menu do jogo focado',
  Configurações: 'Configurações',
  Rolar: 'Rolar a página'
};

const Shortcuts: React.FC<{ rows: [string, string][] }> = ({ rows }) => (
  <dl className="px-4 py-2">
    {rows.map(([key, action]) => (
      <div key={key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
        <dt className="text-slate-300">{action}</dt>
        <dd>
          <kbd className="inline-block min-w-7 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-center text-[11px] font-medium text-slate-200">{key}</kbd>
        </dd>
      </div>
    ))}
  </dl>
);

const GamepadShortcuts: React.FC = () => {
  const gamepad = useGamepadStore((s) => s.gamepad);
  const family = detectGamepadFamily(gamepad?.connected ? gamepad.id : undefined);
  const { face, extra } = getGamepadBindings(family);
  const rows: [string, string][] = [
    ...GAMEPAD_STATIC,
    ...face.map((b): [string, string] => [b.keyLabel, GAMEPAD_LABELS[b.label] ?? b.label]),
    ...extra.map((b): [string, string] => [b.keyLabel, GAMEPAD_LABELS[b.label] ?? b.label])
  ];
  return <Shortcuts rows={rows} />;
};

export const HelpSettings: React.FC = () => {
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [manualCheckDone, setManualCheckDone] = useState(false);

  useEffect(() => {
    window.electronAPI?.getAppInfo().then((info) => setVersion(info.version)).catch(() => undefined);
    window.electronAPI?.getUpdateStatus().then((status) => setUpdateStatus(status)).catch(() => undefined);
    const unsubscribe = window.electronAPI?.onUpdateStatus((status) => setUpdateStatus(status));
    return () => unsubscribe?.();
  }, []);

  const openLogs = async () => {
    setError(null);
    try {
      await window.electronAPI?.openLogsFolder();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const checkUpdates = async () => {
    setError(null);
    try {
      const next = await window.electronAPI?.checkForUpdates();
      if (next) setUpdateStatus(next);
      setManualCheckDone(true);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const installUpdate = async () => {
    setError(null);
    try {
      await window.electronAPI?.quitAndInstallUpdate();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const updateNotice = (() => {
    if (updateStatus?.downloaded) {
      return { tone: 'success' as const, text: `Lazulium ${updateStatus.version ?? ''} baixado e pronto para instalar.` };
    }
    if (updateStatus?.available && updateStatus.manualDownload) {
      return { tone: 'info' as const, text: `A versão ${updateStatus.version ?? ''} já saiu. Esta é a versão portátil: baixe a nova e substitua o arquivo.` };
    }
    if (updateStatus?.available) {
      const progress = typeof updateStatus.progress === 'number' ? ` (${updateStatus.progress}%)` : '';
      return { tone: 'info' as const, text: `Nova versão ${updateStatus.version ?? ''} encontrada. Baixando em segundo plano${progress}...` };
    }
    if (updateStatus?.error) {
      return { tone: 'error' as const, text: formatUpdateError(updateStatus.error) };
    }
    if (manualCheckDone && updateStatus?.supported === false && !updateStatus.manualDownload) {
      return { tone: 'info' as const, text: 'Só a versão instalada se atualiza sozinha.' };
    }
    if (manualCheckDone && updateStatus?.checked && !updateStatus.checking) {
      return { tone: 'success' as const, text: 'Você já está na versão mais recente.' };
    }
    return null;
  })();

  return (
    <div className="space-y-6">
      <SettingsGroup>
        <div className="flex flex-wrap items-center gap-4 px-4 py-4">
          <img src={logo} alt="" className="w-12 h-12 rounded-xl" />
          <div className="flex-1 min-w-[16rem]">
            <p className="font-display text-lg text-white">Lazulium {version && <span className="text-sm text-slate-400">v{version}</span>}</p>
            <p className="text-xs leading-relaxed text-slate-500">
              Se algo der errado, abra a pasta de logs e envie o arquivo <code className="text-slate-300">lazulium.log</code> para quem te passou o app.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {updateStatus?.downloaded ? (
              <Button variant="primary" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={installUpdate}>
                Reiniciar e instalar
              </Button>
            ) : updateStatus?.available && updateStatus.downloadUrl ? (
              <a href={updateStatus.downloadUrl} target="_blank" rel="noreferrer" className={`${buttonClass('primary', 'sm')}`}>
                <Download className="w-3.5 h-3.5" /> Baixar a {updateStatus.version}
              </a>
            ) : (
              <Button icon={<RefreshCw className="w-3.5 h-3.5" />} loading={Boolean(updateStatus?.checking)} onClick={checkUpdates}>
                Verificar atualizações
              </Button>
            )}
            <Button icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => useUiStore.getState().openModal({ kind: 'whatsNew' })}>
              Novidades
            </Button>
            <Button icon={<FileText className="w-3.5 h-3.5" />} onClick={openLogs}>
              Pasta de logs
            </Button>
          </div>
        </div>
        {(error || updateNotice) && (
          <div className="px-4 pb-3 space-y-1.5">
            {updateNotice && <Notice tone={updateNotice.tone}>{updateNotice.text}</Notice>}
            {error && <Notice>{error}</Notice>}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Controle" description="Xbox, PlayStation, Switch Pro e genéricos. Com um jogo aberto, o controle fica só com o jogo.">
        <GamepadShortcuts />
      </SettingsGroup>
      <SettingsGroup title="Teclado">
        <Shortcuts rows={KEYBOARD} />
      </SettingsGroup>
    </div>
  );
};
