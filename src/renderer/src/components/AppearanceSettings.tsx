import React, { useRef, useState } from 'react';
import { Check, ChevronDown, Download, RotateCcw, Upload } from 'lucide-react';
import { Select } from './Select';
import { Button, Notice, focusRing, inputClass } from './ui';
import { FONT_CHOICES, PRESETS, ThemeSettings, applyTheme, loadTheme, sanitizeTheme, saveTheme } from '../utils/theme';
import { Segmented, SettingRow, SettingsGroup } from './settings/controls';

type ColorKey = 'base' | 'accent' | 'textMain' | 'textSoft' | 'success' | 'warn' | 'danger' | 'bg' | 'panel' | 'header' | 'sidebar';

// Valores mostrados enquanto a cor não foi mexida (os do tema Noite)
const DEFAULT_COLORS: Record<ColorKey, string> = {
  base: '#60708f',
  accent: '#4a80ff',
  textMain: '#e2e9f7',
  textSoft: '#a7b5d3',
  success: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  bg: '#0e1426',
  panel: '#151c30',
  header: '#0a0f1d',
  sidebar: '#0c1222'
};

const MAIN_COLORS: { key: ColorKey; label: string; hint: string }[] = [
  { key: 'base', label: 'Superfícies', hint: 'Fundos, bordas e cinzas' },
  { key: 'accent', label: 'Destaque', hint: 'Botões, foco e seleção' },
  { key: 'textMain', label: 'Texto principal', hint: 'Títulos e nomes' },
  { key: 'textSoft', label: 'Texto secundário', hint: 'Descrições e detalhes' }
];

const EXTRA_COLORS: { key: ColorKey; label: string }[] = [
  { key: 'bg', label: 'Fundo do app' },
  { key: 'panel', label: 'Painéis' },
  { key: 'header', label: 'Barra do topo' },
  { key: 'sidebar', label: 'Barra lateral' },
  { key: 'success', label: 'Sucesso' },
  { key: 'warn', label: 'Aviso' },
  { key: 'danger', label: 'Erro' }
];

const RADIUS_OPTIONS: { value: NonNullable<ThemeSettings['radius']>; label: string }[] = [
  { value: 'square', label: 'Retos' },
  { value: 'soft', label: 'Suaves' },
  { value: 'round', label: 'Redondos' }
];

const SIZE_OPTIONS = [
  { value: '0.9', label: 'P' },
  { value: '1', label: 'Normal' },
  { value: '1.1', label: 'G' },
  { value: '1.2', label: 'GG' }
];

const FONT_OPTIONS = [...FONT_CHOICES, { value: '__custom', label: 'Outra (digite abaixo)' }];

// Amostra da cor: o botão abre o seletor do sistema (o campo de cor sozinho não abre pelo controle)
const ColorRow: React.FC<{ label: string; hint?: string; value: string | undefined; fallback: string; onChange: (hex: string) => void; onClear: () => void }> = ({
  label,
  hint,
  value,
  fallback,
  onChange,
  onClear
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = value ?? fallback;
  return (
    <SettingRow label={label} hint={hint}>
      {value && (
        <Button variant="ghost" onClick={onClear} title="Voltar à cor do tema">
          Padrão
        </Button>
      )}
      <span className="relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={`${label}: ${shown}`}
          className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg border border-slate-700 bg-slate-950/50 hover:border-slate-500 transition-colors ${focusRing}`}
        >
          <span className="w-6 h-6 rounded-md border border-black/30" style={{ backgroundColor: shown }} />
          <span className="font-mono text-[11px] uppercase text-slate-400">{shown}</span>
        </button>
        {/* Invisível embaixo da amostra: o seletor do sistema abre ali. Opacidade 0 tira do caminho do controle. */}
        <input ref={inputRef} type="color" tabIndex={-1} aria-hidden="true" value={shown} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" />
      </span>
    </SettingRow>
  );
};

const samePreset = (theme: ThemeSettings, preset: ThemeSettings) => {
  const keys = new Set([...Object.keys(theme), ...Object.keys(preset)]) as Set<keyof ThemeSettings>;
  return [...keys].every((k) => theme[k] === preset[k]);
};

// Editor de aparência: todas as mudanças valem na hora e ficam guardadas neste PC
export const AppearanceSettings: React.FC = () => {
  const [theme, setTheme] = useState<ThemeSettings>(loadTheme);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [showExtra, setShowExtra] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const commit = (next: ThemeSettings) => {
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  };

  const setColor = (key: ColorKey, hex: string | undefined) => {
    const next = { ...theme };
    if (hex) next[key] = hex;
    else delete next[key];
    commit(next);
  };

  const fontValue = (current: string | undefined) => (FONT_CHOICES.some((f) => f.value === (current ?? '')) ? (current ?? '') : '__custom');

  const setFont = (key: 'fontSans' | 'fontDisplay', value: string) => {
    const next = { ...theme };
    if (value && value !== '__custom') next[key] = value;
    else if (!value) delete next[key];
    commit(sanitizeTheme(next));
  };

  const exportTheme = () => {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'lazulium-tema.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importTheme = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = sanitizeTheme(JSON.parse(await file.text()));
      commit(imported);
      setMessage(Object.keys(imported).length ? { tone: 'success', text: 'Tema importado.' } : { tone: 'error', text: 'O arquivo não tinha nenhuma configuração de aparência válida.' });
    } catch {
      setMessage({ tone: 'error', text: 'Não consegui ler esse arquivo de tema.' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const colorRow = (c: { key: ColorKey; label: string; hint?: string }) => (
    <ColorRow key={c.key} label={c.label} hint={c.hint} value={theme[c.key]} fallback={DEFAULT_COLORS[c.key]} onChange={(hex) => setColor(c.key, hex)} onClear={() => setColor(c.key, undefined)} />
  );

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 px-1 text-[13px] font-semibold text-slate-200">Temas prontos</h3>
        <div className="grid grid-cols-3 gap-2.5">
          {PRESETS.map((p) => {
            const active = samePreset(theme, p.theme);
            const base = p.theme.base ?? DEFAULT_COLORS.base;
            const accent = p.theme.accent ?? DEFAULT_COLORS.accent;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => commit({ ...p.theme })}
                aria-pressed={active}
                className={`group relative flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${active ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'} ${focusRing}`}
              >
                {/* Prévia do tema com as cores dele mesmo */}
                <span className="relative w-11 h-9 flex-shrink-0 rounded-md overflow-hidden border border-black/30 bg-black" style={{ backgroundImage: `linear-gradient(135deg, ${base}66, ${base}22)` }}>
                  <span className="absolute left-1.5 top-1.5 right-1.5 h-1.5 rounded-sm" style={{ backgroundColor: `${base}88` }} />
                  <span className="absolute left-1.5 bottom-1.5 w-5 h-2.5 rounded-sm" style={{ backgroundColor: accent }} />
                </span>
                <span className="min-w-0 text-[13px] text-slate-200 truncate">{p.label}</span>
                {active && <Check className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-indigo-300" />}
              </button>
            );
          })}
        </div>
      </section>

      <SettingsGroup title="Cores">
        {MAIN_COLORS.map(colorRow)}
        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          aria-expanded={showExtra}
          className={`w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-400 hover:text-white rounded-b-lg transition-colors ${focusRing}`}
        >
          Cor de cada parte e dos avisos
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExtra ? 'rotate-180' : ''}`} />
        </button>
        {showExtra && EXTRA_COLORS.map(colorRow)}
      </SettingsGroup>

      <SettingsGroup title="Texto e formas">
        <SettingRow label="Fonte do texto">
          <Select value={fontValue(theme.fontSans)} options={FONT_OPTIONS} onChange={(v) => setFont('fontSans', v)} ariaLabel="Fonte do texto" />
        </SettingRow>
        <SettingRow label="Fonte dos títulos">
          <Select value={fontValue(theme.fontDisplay)} options={FONT_OPTIONS} onChange={(v) => setFont('fontDisplay', v)} ariaLabel="Fonte dos títulos" />
        </SettingRow>
        <SettingRow label="Outra fonte instalada" hint="Nome exato da fonte do Windows, para o texto">
          <input
            type="text"
            placeholder="ex.: Bahnschrift"
            aria-label="Outra fonte instalada"
            defaultValue={theme.fontSans && fontValue(theme.fontSans) === '__custom' ? theme.fontSans.replace(/'/g, '').split(',')[0] : ''}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name) setFont('fontSans', `'${name.replace(/[^\w\s-]/g, '')}', 'Segoe UI', sans-serif`);
            }}
            className={`${inputClass} w-44`}
          />
        </SettingRow>
        <SettingRow label="Tamanho do texto">
          <Segmented
            ariaLabel="Tamanho do texto"
            value={SIZE_OPTIONS.find((o) => Number(o.value) === (theme.fontScale ?? 1))?.value ?? '1'}
            options={SIZE_OPTIONS}
            onChange={(v) => commit(sanitizeTheme({ ...theme, fontScale: Number(v) === 1 ? undefined : Number(v) }))}
          />
        </SettingRow>
        <SettingRow label="Cantos">
          <Segmented ariaLabel="Cantos" value={theme.radius ?? 'soft'} options={RADIUS_OPTIONS} onChange={(v) => commit(sanitizeTheme({ ...theme, radius: v === 'soft' ? undefined : v }))} />
        </SettingRow>
      </SettingsGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => commit({})}>
          Voltar ao padrão
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" icon={<Download className="w-3.5 h-3.5" />} onClick={exportTheme}>
          Exportar tema
        </Button>
        <Button variant="ghost" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => fileRef.current?.click()}>
          Importar tema
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importTheme(e.target.files?.[0])} />
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
};
