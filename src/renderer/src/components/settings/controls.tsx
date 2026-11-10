import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Skeleton, focusRing, focusRingInset, inputClass } from '../ui';

// Peças das Configurações: grupos, linhas, chaves liga/desliga e campos secretos.
// Tudo é botão ou campo comum: o controle chega em cada item pelo direcional.

export const SettingsGroup: React.FC<{ title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  description,
  actions,
  children,
  className = ''
}) => (
  <section className={className}>
    {(title || actions) && (
      <div className="flex items-end justify-between gap-3 mb-2.5 px-1">
        <div className="min-w-0">
          {title && <h3 className="text-[13px] font-semibold text-slate-200">{title}</h3>}
          {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className="rounded-lg bg-slate-900/50 border border-slate-800/90 divide-y divide-slate-800/90">{children}</div>
  </section>
);

// Linha com rótulo à esquerda e o controle à direita
export const SettingRow: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; className?: string }> = ({ label, hint, children, className = '' }) => (
  <div className={`flex items-center justify-between gap-4 px-4 py-3 ${className}`}>
    <div className="min-w-0">
      <div className="text-sm text-slate-100">{label}</div>
      {hint && <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</div>}
    </div>
    {children && <div className="flex flex-shrink-0 items-center gap-2">{children}</div>}
  </div>
);

export const Switch: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span aria-hidden="true" className={`relative inline-flex flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-150 ${checked ? 'bg-indigo-500' : 'bg-slate-700'}`}>
    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-150 ${checked ? 'translate-x-4' : ''}`} />
  </span>
);

// A linha inteira é o botão: clique, Enter ou A do controle liga e desliga
export const ToggleRow: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({
  label,
  hint,
  checked,
  onChange,
  disabled
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`w-full flex items-center justify-between gap-4 px-4 py-3 text-left first:rounded-t-lg last:rounded-b-lg hover:bg-slate-800/40 disabled:opacity-50 transition-colors ${focusRingInset}`}
  >
    <span className="min-w-0">
      <span className="block text-sm text-slate-100">{label}</span>
      {hint && <span className="block mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</span>}
    </span>
    <Switch checked={checked} />
  </button>
);

// Escolha entre poucas opções, todas à vista
export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/60 border border-slate-700/80">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-md text-xs transition-colors ${value === o.value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'} ${focusRing}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Campo de chave ou senha com o botão de mostrar
export const SecretInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { secret?: boolean }> = ({ secret = true, className = '', ...props }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={secret && !visible ? 'password' : 'text'} spellCheck={false} autoComplete="off" className={`${inputClass} font-mono text-xs ${secret ? 'pr-9' : ''} ${className}`} />
      {secret && (
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar' : 'Mostrar'}
          title={visible ? 'Ocultar' : 'Mostrar'}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-200 ${focusRing}`}
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};

export const SettingsSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="rounded-lg bg-slate-900/50 border border-slate-800/90 divide-y divide-slate-800/90" aria-busy="true">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-2.5 w-2/3" />
        </div>
      </div>
    ))}
  </div>
);
