// Aparência personalizável: tudo vira variáveis CSS do @theme (slate/indigo/steam-*/fontes/raios),
// então os componentes não mudam. O padrão (tema vazio) é o azul-noite definido em styles/index.css.

export interface ThemeSettings {
  base?: string;        // cor das superfícies (gera a escala slate)
  accent?: string;      // destaque (escala indigo)
  textMain?: string;    // texto principal
  textSoft?: string;    // texto secundário
  success?: string;     // verdes (concluído, ligado)
  warn?: string;        // amarelos (avisos)
  danger?: string;      // vermelhos (erros, apagar)
  bg?: string;          // fundo do app
  panel?: string;       // cartões e painéis
  header?: string;      // barra do topo
  sidebar?: string;     // barra lateral
  fontSans?: string;    // fonte do texto
  fontDisplay?: string; // fonte dos títulos
  fontScale?: number;   // 0.85 a 1.3
  radius?: 'square' | 'soft' | 'round';
}

const STORAGE_KEY = 'lazulium-theme';
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const SURFACE_L = [96, 92, 84, 72, 60, 47, 35, 25, 17, 12, 7];
const ACCENT_L = [97, 93, 87, 78, 68, 60, 52, 44, 36, 28, 19];

export const FONT_CHOICES: { value: string; label: string }[] = [
  { value: '', label: 'Padrão do Lazulium' },
  { value: "'Segoe UI', Arial, sans-serif", label: 'Segoe UI' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: "Georgia, 'Times New Roman', serif", label: 'Georgia (com serifa)' },
  { value: "Consolas, 'Courier New', monospace", label: 'Consolas (código)' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet' },
  { value: "Impact, 'Arial Black', sans-serif", label: 'Impact' }
];

export const PRESETS: { id: string; label: string; theme: ThemeSettings }[] = [
  { id: 'noite', label: 'Noite (padrão)', theme: {} },
  { id: 'grafite', label: 'Grafite', theme: { base: '#808792', accent: '#58a6ff' } },
  { id: 'floresta', label: 'Floresta', theme: { base: '#6f9a74', accent: '#f59e0b' } },
  { id: 'ametista', label: 'Ametista', theme: { base: '#8b7bb8', accent: '#c084fc' } },
  { id: 'brasa', label: 'Brasa', theme: { base: '#a8847a', accent: '#f97316' } },
  { id: 'oceano', label: 'Oceano', theme: { base: '#5a9aa8', accent: '#22d3ee' } }
];

const RADII = {
  square: ['0rem', '0rem', '0rem', '0rem'],
  soft: ['0.375rem', '0.5rem', '0.75rem', '0.875rem'],
  round: ['0.5rem', '0.75rem', '1rem', '1.375rem']
};

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function scale(hex: string | undefined, lightness: number[], maxSat: number): string[] | null {
  const parsed = hex ? hexToHsl(hex) : null;
  if (!parsed) return null;
  const [h, s] = parsed;
  return lightness.map((l) => hsl(h, Math.min(s, maxSat), l));
}

const appliedVars = new Set<string>();

function apply(vars: Record<string, string>, fontScale?: number): void {
  const root = document.documentElement;
  appliedVars.forEach((name) => root.style.removeProperty(name));
  appliedVars.clear();
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
    appliedVars.add(name);
  }
  root.style.fontSize = fontScale && fontScale !== 1 ? `${Math.round(fontScale * 100)}%` : '';
}

export function applyTheme(theme: ThemeSettings): void {
  const vars: Record<string, string> = {};
  const put = (prefix: string, colors: string[] | null) => colors?.forEach((c, i) => (vars[`--color-${prefix}-${STEPS[i]}`] = c));

  put('slate', scale(theme.base, SURFACE_L, 60));
  put('indigo', scale(theme.accent, ACCENT_L, 100));
  put('emerald', scale(theme.success, ACCENT_L, 100));
  put('amber', scale(theme.warn, ACCENT_L, 100));
  put('red', scale(theme.danger, ACCENT_L, 100));

  const base = theme.base ? hexToHsl(theme.base) : null;
  if (base) {
    const tone = Math.min(base[1], 60);
    vars['--color-steam-bg'] = hsl(base[0], tone, 9);
    vars['--color-steam-panel'] = hsl(base[0], tone, 12);
    vars['--color-steam-header'] = hsl(base[0], tone, 7);
    vars['--color-steam-sidebar'] = hsl(base[0], tone, 8);
  }
  if (theme.bg) vars['--color-steam-bg'] = theme.bg;
  if (theme.panel) vars['--color-steam-panel'] = theme.panel;
  if (theme.header) vars['--color-steam-header'] = theme.header;
  if (theme.sidebar) vars['--color-steam-sidebar'] = theme.sidebar;

  if (theme.textMain) {
    for (const step of [50, 100, 200]) vars[`--color-slate-${step}`] = theme.textMain;
    vars['--color-white'] = theme.textMain;
  }
  if (theme.textSoft) {
    for (const step of [300, 400]) vars[`--color-slate-${step}`] = theme.textSoft;
  }

  if (theme.fontSans) vars['--font-sans'] = theme.fontSans;
  if (theme.fontDisplay) vars['--font-display'] = theme.fontDisplay;
  if (theme.radius && theme.radius !== 'soft') {
    ['xs', 'sm', 'md', 'lg'].forEach((k, i) => (vars[`--radius-${k}`] = RADII[theme.radius!][i]));
  }
  apply(vars, theme.fontScale);
}

const COLOR_KEYS = ['base', 'accent', 'textMain', 'textSoft', 'success', 'warn', 'danger', 'bg', 'panel', 'header', 'sidebar'] as const;

// Aceita só o que sabemos aplicar: um arquivo importado não pode injetar CSS
export function sanitizeTheme(input: unknown): ThemeSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: ThemeSettings = {};
  for (const key of COLOR_KEYS) {
    const v = src[key];
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out[key] = v.toLowerCase();
  }
  for (const key of ['fontSans', 'fontDisplay'] as const) {
    const v = src[key];
    if (typeof v === 'string' && v.length <= 120 && /^[\w\s,'"-]+$/.test(v)) out[key] = v;
  }
  if (typeof src.fontScale === 'number') out.fontScale = Math.min(1.3, Math.max(0.85, src.fontScale));
  if (src.radius === 'square' || src.radius === 'soft' || src.radius === 'round') out.radius = src.radius;
  return out;
}

export function loadTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeTheme(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveTheme(theme: ThemeSettings): void {
  try {
    if (Object.keys(theme).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

export function initTheme(): void {
  applyTheme(loadTheme());
}
