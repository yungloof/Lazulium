import React, { useEffect, useState } from 'react';
import { MonitorDown } from 'lucide-react';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const OPTIONS = [
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

export const AppBehaviorSettings: React.FC = () => {
  const [values, setValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    window.electronAPI?.getSettings().then((settings) => {
      setValues(
        Object.fromEntries(
          OPTIONS.map((o) => [o.key, settings[o.key] === undefined || settings[o.key] === '' ? o.defaultValue : settings[o.key] === 'true'])
        )
      );
    });
  }, []);

  const toggle = async (key: string, value: boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    await window.electronAPI?.setSetting(key, String(value));
  };

  return (
    <section className="space-y-3 pb-5 border-b border-slate-800/80">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
        <MonitorDown className="w-3.5 h-3.5 text-indigo-400" /> Comportamento do App
      </h3>
      {OPTIONS.map((o) => (
        <label key={o.key} className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={values[o.key] ?? o.defaultValue}
            onChange={(e) => toggle(o.key, e.target.checked)}
            className={`mt-0.5 w-4 h-4 accent-indigo-500 rounded ${focusRing}`}
          />
          <span>
            <span className="block text-xs text-slate-200">{o.label}</span>
            <span className="block text-[11px] text-slate-500">{o.hint}</span>
          </span>
        </label>
      ))}
    </section>
  );
};
