import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { NAV_AUDIO_SETTING_KEYS, navAudio, parseNavAudioSettings } from '../utils/navigationAudio';
import { CEREMONY_SETTING_KEYS, parseCeremonyEnabled, useCeremonyStore } from '../stores/useCeremonyStore';
import { Select } from './Select';
import { Notice, focusRing } from './ui';
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
    hint: 'O X esconde o Lazulium perto do relógio, e as horas e os backups seguem rodando.'
  },
  {
    key: 'startWithWindows',
    defaultValue: false,
    label: 'Iniciar com o Windows (na bandeja)',
    hint: 'Abre na bandeja ao ligar o PC, gastando pouca memória até você abrir a janela.'
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
  const [navSoundEnabled, setNavSoundEnabled] = useState(true);
  const [navSoundVolume, setNavSoundVolume] = useState(100);
  const [ceremoniesEnabled, setCeremoniesEnabled] = useState(true);

  useEffect(() => {
    window.electronAPI?.getScreenshotHotkey().then(setHotkey).catch(() => undefined);
    window.electronAPI
      ?.getSettings()
      .then((settings) => {
        setValues(Object.fromEntries(WINDOW_OPTIONS.map((o) => [o.key, readBool(settings[o.key], o.defaultValue)])));
        setDiscountIdle(readBool(settings.discountIdleTime, true));
        setTrackExternal(readBool(settings.trackExternalGames, true));
        setIdleThreshold(settings.idleThresholdMinutes || '15');
        const audio = parseNavAudioSettings(settings);
        setNavSoundEnabled(audio.enabled);
        setNavSoundVolume(audio.volume);
        setCeremoniesEnabled(parseCeremonyEnabled(settings));
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
          hint="Percebe quando um jogo é aberto por outro launcher (Epic, GOG, EA...) ou por atalho e conta o tempo. Jogos da Steam, que ela mesma conta, e de emulador ficam de fora."
          checked={trackExternal}
          onChange={(checked) => {
            setTrackExternal(checked);
            void window.electronAPI?.setSetting('trackExternalGames', String(checked));
          }}
        />
        <ToggleRow
          label="Descontar tempo ausente"
          hint="Desconta o tempo sem teclado, mouse ou controle Xbox. Outros controles podem passar despercebidos; se você joga com um deles fora da Steam, desligue."
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

      <SettingsGroup title="Som de navegação">
        <ToggleRow
          label="Sons ao navegar"
          hint="Cliques curtos ao andar pelos jogos, abrir telas e favoritar."
          checked={navSoundEnabled}
          onChange={(checked) => {
            setNavSoundEnabled(checked);
            navAudio.setEnabled(checked);
            void window.electronAPI?.setSetting(NAV_AUDIO_SETTING_KEYS.enabled, String(checked));
            if (checked) navAudio.playSelect();
          }}
        />
        {navSoundEnabled && (
          <SettingRow
            label="Volume dos sons"
            hint={navSoundVolume === 0 ? 'Sem som, mesmo com a chave ligada.' : 'Altura dos sons de navegação e conquistas.'}
          >
            <Volume2 className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={navSoundVolume}
              onChange={(e) => {
                const next = Number(e.target.value);
                setNavSoundVolume(next);
                navAudio.setVolume(next);
                void window.electronAPI?.setSetting(NAV_AUDIO_SETTING_KEYS.volume, String(next));
              }}
              onPointerUp={() => navAudio.playMove()}
              onKeyUp={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  navAudio.playMove();
                }
              }}
              aria-label="Volume dos sons de navegação"
              className={`w-36 accent-indigo-400 rounded ${focusRing}`}
            />
            <span className="w-9 text-right text-xs tabular-nums text-slate-300">{navSoundVolume}%</span>
          </SettingRow>
        )}
      </SettingsGroup>
      <SettingsGroup title="Cerimônias">
        <ToggleRow
          label="Comemorar conquistas, Zerado e 100%"
          hint="Mostra a capa do jogo com brilho azul, som e vibração do controle. Guarda para quando você fechar o jogo se estiver em tela cheia."
          checked={ceremoniesEnabled}
          onChange={(checked) => {
            setCeremoniesEnabled(checked);
            useCeremonyStore.getState().setEnabled(checked);
            void window.electronAPI?.setSetting(CEREMONY_SETTING_KEYS.enabled, String(checked));
          }}
        />
      </SettingsGroup>
    </div>
  );
};
