import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import logo from '../assets/logo.png';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Notice } from './ui';
import { SettingsGroup } from './settings/controls';

// Os mesmos atalhos do useGamepad e das teclas do App
const GAMEPAD: [string, string][] = [
  ['Direcional / analógico', 'Andar pela tela'],
  ['A', 'Abrir, confirmar'],
  ['B', 'Voltar, fechar janela'],
  ['X', 'Favoritar o jogo focado'],
  ['Y', 'Buscar na biblioteca'],
  ['LB / RB', 'Trocar o filtro da biblioteca'],
  ['LT / RT', 'Trocar de seção (Diário, Listas...)'],
  ['Start', 'Configurações']
];

const KEYBOARD: [string, string][] = [
  ['Setas', 'Andar pela tela, como o direcional'],
  ['Enter', 'Abrir, confirmar'],
  ['Esc', 'Fechar janela'],
  ['Ctrl + K', 'Busca rápida de jogos'],
  ['F', 'Favoritar o jogo focado'],
  ['Backspace', 'Voltar para a biblioteca']
];

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
    <div className="space-y-6">
      <SettingsGroup>
        <div className="flex items-center gap-4 px-4 py-4">
          <img src={logo} alt="" className="w-12 h-12 rounded-xl" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg text-white">Lazulium {version && <span className="text-sm text-slate-400">v{version}</span>}</p>
            <p className="text-xs leading-relaxed text-slate-500">
              Se algo der errado, abra a pasta de logs e envie o arquivo <code className="text-slate-300">lazulium.log</code> para quem te passou o app.
            </p>
          </div>
          <Button icon={<FileText className="w-3.5 h-3.5" />} onClick={openLogs} className="flex-shrink-0">
            Pasta de logs
          </Button>
        </div>
        {error && (
          <div className="px-4 py-2.5">
            <Notice>{error}</Notice>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Controle" description="Xbox, PlayStation, Switch Pro e genéricos. Com um jogo aberto, o controle fica só com o jogo.">
        <Shortcuts rows={GAMEPAD} />
      </SettingsGroup>
      <SettingsGroup title="Teclado">
        <Shortcuts rows={KEYBOARD} />
      </SettingsGroup>
    </div>
  );
};
