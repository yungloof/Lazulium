import React, { useEffect, useState } from 'react';
import { PartyPopper, Volume2 } from 'lucide-react';
import { CallAlertMode, CallSettings } from '@shared/types/social';
import { CALL_SETTING_KEYS, DEFAULT_CALL_SETTINGS, parseCallSettings } from '@shared/utils/presence';
import { useUiStore } from '../../stores/useUiStore';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Button, focusRing } from '../ui';
import { Segmented, SettingRow, SettingsGroup, ToggleRow } from './controls';

// Como chega o aviso de "chamar pra call no Discord" dos amigos: tela doida com música, só notificação ou recusar sozinho
const MODES: { value: CallAlertMode; label: string }[] = [
  { value: 'chaos', label: 'Tela doida' },
  { value: 'notify', label: 'Só notificação' },
  { value: 'off', label: 'Não receber' }
];

const MODE_HINT: Record<CallAlertMode, string> = {
  chaos: 'A tela fica doida por alguns segundos e toca música alta, para você ver mesmo longe do PC. Responde com Tô indo! ou Agora não.',
  notify: 'Uma notificação do Windows e o aviso no app, sem barulho.',
  off: 'Quem te chamar recebe "ocupado" na hora.'
};

export const CallSettingsCard: React.FC = () => {
  const [settings, setSettings] = useState<CallSettings>(DEFAULT_CALL_SETTINGS);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    window.electronAPI
      ?.getSettings()
      .then((s) => setSettings(parseCallSettings(s)))
      .catch(() => undefined);
  }, []);

  const save = <K extends keyof CallSettings>(key: K, value: CallSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    window.electronAPI?.setSetting(CALL_SETTING_KEYS[key], String(value)).catch((err) => useUiStore.getState().showNotice({ text: ipcErrorMessage(err), tone: 'warn' }));
  };

  const test = async () => {
    setTesting(true);
    try {
      await window.electronAPI?.socialTestCall();
    } finally {
      setTimeout(() => setTesting(false), 1500);
    }
  };

  return (
    <SettingsGroup
      title="Chamar pra call no Discord"
      description="Quando um amigo aperta o botão vermelho no seu perfil para te chamar pra call no Discord. Em Não perturbar o aviso chega quieto, só no app."
      actions={
        <Button icon={<PartyPopper className="w-3.5 h-3.5" />} loading={testing} onClick={() => void test()}>
          Testar
        </Button>
      }
    >
      <SettingRow label="Quando um amigo chamar" hint={MODE_HINT[settings.alert]}>
        <Segmented value={settings.alert} options={MODES} onChange={(value) => save('alert', value)} ariaLabel="Como a chamada chega" />
      </SettingRow>
      {settings.alert === 'chaos' && (
        <>
          <SettingRow label="Volume da música" hint={settings.volume === 0 ? 'Sem música, só a tela doida.' : 'A música vai junto com a tela doida.'}>
            <Volume2 className="w-4 h-4 text-slate-400" />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.volume}
              onChange={(e) => setSettings((prev) => ({ ...prev, volume: Number(e.target.value) }))}
              onPointerUp={(e) => save('volume', Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => save('volume', Number((e.target as HTMLInputElement).value))}
              aria-label="Volume da música da chamada"
              className={`w-36 accent-indigo-400 rounded ${focusRing}`}
            />
            <span className="w-9 text-right text-xs tabular-nums text-slate-300">{settings.volume}%</span>
          </SettingRow>
          <ToggleRow
            label="Tela doida mesmo jogando"
            hint="Desligado, com um jogo aberto a chamada vira notificação: por cima de jogo em tela cheia a tela doida pode minimizar o jogo."
            checked={settings.whilePlaying}
            onChange={(checked) => save('whilePlaying', checked)}
          />
        </>
      )}
      {settings.alert !== 'off' && (
        <ToggleRow label="Tô indo! abre o Discord" hint="Ao responder, o Discord abre neste PC (se estiver instalado)." checked={settings.openDiscord} onChange={(checked) => save('openDiscord', checked)} />
      )}
    </SettingsGroup>
  );
};
