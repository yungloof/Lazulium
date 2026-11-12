import React, { useEffect, useState } from 'react';
import { Select } from './Select';
import { Notice } from './ui';
import { SettingRow, SettingsGroup, ToggleRow } from './settings/controls';

const HOTKEYS = [
  { value: 'Control+F12', label: 'Ctrl + F12 (padrão)' },
  { value: 'Alt+F12', label: 'Alt + F12' },
  { value: 'Control+Shift+S', label: 'Ctrl + Shift + S' },
  { value: 'F9', label: 'F9' },
  { value: 'F10', label: 'F10' },
  { value: 'F11', label: 'F11' },
  { value: 'off', label: 'Desligada' }
];

const IDLE_OPTIONS = [
  { value: '10', label: '10 minutos' },
  { value: '15', label: '15 minutos (padrão)' },
  { value: '30', label: '30 minutos' },
  { value: '0', label: 'Desligado' }
];

const WINDOW_OPTIONS = [
  {
    key: 'closeToTray',
    defaultValue: true,
    label: 'Minimizar para a bandeja ao fechar',
    hint: 'O X da janela esconde o Lazulium perto do relógio; o rastreador de horas e os backups continuam funcionando.'
  },
  {
    key: 'startWithWindows',
    defaultValue: false,
    label: 'Iniciar com o Windows (na bandeja)',
    hint: 'Abre escondido na bandeja ao ligar o PC, usando pouca memória até você abrir a janela.'
  }
] as const;

const readBool = (value: string | undefined, fallback: boolean) => (value === undefined || value === '' ? fallback : value === 'true');

export const AppBehaviorSettings: React.FC = () => {
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [discountIdle, setDiscountIdle] = useState(true);
  const [trackExternal, setTrackExternal] = useState(true);
  const [idleThreshold, setIdleThreshold] = useState('15');
  const [hotkey, setHotkey] = useState('Control+F12');
  const [hotkeyBusy, setHotkeyBusy] = useState(false);

  useEffect(() => {
    window.electronAPI?.getScreenshotHotkey().then(setHotkey).catch(() => undefined);
    window.electronAPI
      ?.getSettings()
      .then((settings) => {
        setValues(Object.fromEntries(WINDOW_OPTIONS.map((o) => [o.key, readBool(settings[o.key], o.defaultValue)])));
        setDiscountIdle(readBool(settings.discountIdleTime, true));
        setTrackExternal(readBool(settings.trackExternalGames, true));
        setIdleThreshold(settings.idleThresholdMinutes || '15');
      })
      .catch(() => undefined);
  }, []);

  const changeHotkey = async (key: string) => {
    setHotkey(key);
    const result = await window.electronAPI?.setScreenshotHotkey(key);
    setHotkeyBusy(result?.ok === false);
  };

  const toggle = async (key: string, value: boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    await window.electronAPI?.setSetting(key, String(value));
  };

  const changeDiscountIdle = async (checked: boolean) => {
    setDiscountIdle(checked);
    await window.electronAPI?.setSetting('discountIdleTime', String(checked));
    // Religar com o tempo em "Desligado" não descontaria nada: volta ao padrão
    if (checked && idleThreshold === '0') {
      setIdleThreshold('15');
      await window.electronAPI?.setSetting('idleThresholdMinutes', '15');
    }
  };

  // "Desligado" no tempo também desliga o desconto (a linha só aparece com ele ligado)
  const changeIdleThreshold = async (value: string) => {
    setIdleThreshold(value);
    await window.electronAPI?.setSetting('idleThresholdMinutes', value);
    if (value === '0') {
      setDiscountIdle(false);
      await window.electronAPI?.setSetting('discountIdleTime', 'false');
    }
  };

  return (
    <div className="space-y-6">
      <SettingsGroup title="Janela">
        {WINDOW_OPTIONS.map((o) => (
          <ToggleRow key={o.key} label={o.label} hint={o.hint} checked={values[o.key] ?? o.defaultValue} onChange={(checked) => void toggle(o.key, checked)} />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Contagem de horas">
        <ToggleRow
          label="Contar jogos abertos fora do Lazulium"
          hint="Percebe quando um jogo da biblioteca é aberto por outro launcher (Epic, GOG, EA...) ou por um atalho, e conta o tempo. Jogos da Steam e de emulador ficam de fora: a Steam já conta os dela."
          checked={trackExternal}
          onChange={(checked) => {
            setTrackExternal(checked);
            void window.electronAPI?.setSetting('trackExternalGames', String(checked));
          }}
        />
        <ToggleRow
          label="Descontar tempo ausente"
          hint="Desconta da sessão o tempo sem teclado, mouse ou controle Xbox. Outros controles podem não ser detectados: se jogar com eles em jogos fora da Steam, desligue esta opção."
          checked={discountIdle}
          onChange={(checked) => void changeDiscountIdle(checked)}
        />
        {discountIdle && (
          <SettingRow label="Considerar ausente após">
            <Select value={idleThreshold} onChange={changeIdleThreshold} ariaLabel="Considerar ausente após" options={IDLE_OPTIONS} />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="Capturas de tela">
        <SettingRow label="Tecla de captura" hint="Vale com o jogo aberto pelo Lazulium. Salva em PNG sem perda, na galeria do jogo.">
          <Select value={hotkey} options={HOTKEYS} onChange={changeHotkey} ariaLabel="Tecla de captura de tela" />
        </SettingRow>
        {hotkeyBusy && (
          <div className="px-4 py-2.5">
            <Notice>Outro programa está usando essa tecla: escolha outra.</Notice>
          </div>
        )}
      </SettingsGroup>
    </div>
  );
};
