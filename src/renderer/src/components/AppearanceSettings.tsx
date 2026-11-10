import React, { useRef, useState } from 'react';
import { Download, Palette, RotateCcw, Upload } from 'lucide-react';
import { Select } from './Select';
import { FONT_CHOICES, PRESETS, ThemeSettings, applyTheme, loadTheme, sanitizeTheme, saveTheme } from '../utils/theme';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

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

const STATUS_COLORS: { key: ColorKey; label: string }[] = [
  { key: 'success', label: 'Sucesso' },
  { key: 'warn', label: 'Aviso' },
  { key: 'danger', label: 'Erro' }
];

const PART_COLORS: { key: ColorKey; label: string }[] = [
  { key: 'bg', label: 'Fundo do app' },
  { key: 'panel', label: 'Painéis' },
  { key: 'header', label: 'Barra do topo' },
  { key: 'sidebar', label: 'Barra lateral' }
];

const RADIUS_OPTIONS = [
  { value: 'square', label: 'Retos' },
  { value: 'soft', label: 'Suaves (padrão)' },
  { value: 'round', label: 'Bem redondos' }
];

const SIZE_OPTIONS = [
  { value: '0.9', label: 'Pequeno' },
  { value: '1', label: 'Normal (padrão)' },
  { value: '1.1', label: 'Grande' },
  { value: '1.2', label: 'Bem grande' }
];

const ColorPicker: React.FC<{ label: string; hint?: string; value: string | undefined; fallback: string; onChange: (hex: string) => void; onClear: () => void }> = ({
  label,
  hint,
  value,
  fallback,
  onChange,
  onClear
}) => (
  <div className="flex items-center justify-between gap-3">
    <span className="min-w-0">
      <span className="block text-sm text-slate-200">{label}</span>
      {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
    </span>
    <span className="flex items-center gap-2 flex-shrink-0">
      {value && (
        <button type="button" onClick={onClear} className={`text-[11px] text-slate-400 hover:text-white rounded px-1 ${focusRing}`}>
          padrão
        </button>
      )}
      <input
        type="color"
        aria-label={label}
        value={value ?? fallback}
        onChange={(e) => onChange(e.target.value)}
        className={`w-9 h-7 rounded border border-slate-700 bg-transparent cursor-pointer ${focusRing}`}
      />
    </span>
  </div>
);

// Editor de aparência: todas as mudanças valem na hora e ficam guardadas neste PC
export const AppearanceSettings: React.FC = () => {
  const [theme, setTheme] = useState<ThemeSettings>(loadTheme);
  const [message, setMessage] = useState<string | null>(null);
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
      setMessage(Object.keys(imported).length ? 'Tema importado.' : 'O arquivo não tinha nenhuma configuração de aparência válida.');
    } catch {
      setMessage('Não consegui ler esse arquivo de tema.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className="space-y-4 pb-5 border-b border-slate-800/80">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
        <Palette className="w-3.5 h-3.5 text-indigo-400" /> Aparência
      </h3>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => commit({ ...p.theme })}
            className={`px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {MAIN_COLORS.map((c) => (
          <ColorPicker key={c.key} label={c.label} hint={c.hint} value={theme[c.key]} fallback={DEFAULT_COLORS[c.key]} onChange={(hex) => setColor(c.key, hex)} onClear={() => setColor(c.key, undefined)} />
        ))}
      </div>

      <details className="group">
        <summary className={`cursor-pointer text-xs text-slate-400 hover:text-white rounded ${focusRing}`}>Cor de cada parte e dos avisos</summary>
        <div className="mt-3 space-y-2.5">
          {PART_COLORS.map((c) => (
            <ColorPicker key={c.key} label={c.label} value={theme[c.key]} fallback={DEFAULT_COLORS[c.key]} onChange={(hex) => setColor(c.key, hex)} onClear={() => setColor(c.key, undefined)} />
          ))}
          {STATUS_COLORS.map((c) => (
            <ColorPicker key={c.key} label={c.label} value={theme[c.key]} fallback={DEFAULT_COLORS[c.key]} onChange={(hex) => setColor(c.key, hex)} onClear={() => setColor(c.key, undefined)} />
          ))}
        </div>
      </details>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-200">Fonte do texto</span>
          <Select value={fontValue(theme.fontSans)} options={[...FONT_CHOICES, { value: '__custom', label: 'Outra (digite abaixo)' }]} onChange={(v) => setFont('fontSans', v)} ariaLabel="Fonte do texto" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-200">Fonte dos títulos</span>
          <Select value={fontValue(theme.fontDisplay)} options={[...FONT_CHOICES, { value: '__custom', label: 'Outra (digite abaixo)' }]} onChange={(v) => setFont('fontDisplay', v)} ariaLabel="Fonte dos títulos" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm text-slate-200">Outra fonte instalada</span>
            <span className="block text-[11px] text-slate-500">Nome exato da fonte do Windows, para o texto</span>
          </span>
          <input
            type="text"
            placeholder="ex.: Bahnschrift"
            defaultValue={theme.fontSans && fontValue(theme.fontSans) === '__custom' ? theme.fontSans.replace(/'/g, '').split(',')[0] : ''}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name) setFont('fontSans', `'${name.replace(/[^\w\s-]/g, '')}', 'Segoe UI', sans-serif`);
            }}
            className={`w-44 px-2 py-1 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-100 ${focusRing}`}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-200">Tamanho do texto</span>
          <Select
            value={String(SIZE_OPTIONS.find((o) => Number(o.value) === (theme.fontScale ?? 1))?.value ?? '1')}
            options={SIZE_OPTIONS}
            onChange={(v) => commit(sanitizeTheme({ ...theme, fontScale: Number(v) === 1 ? undefined : Number(v) }))}
            ariaLabel="Tamanho do texto"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-200">Cantos</span>
          <Select
            value={theme.radius ?? 'soft'}
            options={RADIUS_OPTIONS}
            onChange={(v) => commit(sanitizeTheme({ ...theme, radius: v === 'soft' ? undefined : v }))}
            ariaLabel="Cantos"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => commit({})} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
          <RotateCcw className="w-3.5 h-3.5" /> Voltar ao padrão
        </button>
        <button type="button" onClick={exportTheme} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
          <Download className="w-3.5 h-3.5" /> Exportar tema
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
          <Upload className="w-3.5 h-3.5" /> Importar tema
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importTheme(e.target.files?.[0])} />
      </div>
      {message && <p className="text-xs text-amber-300">{message}</p>}
    </section>
  );
};
