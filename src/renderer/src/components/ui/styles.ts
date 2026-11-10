// Classes compartilhadas da interface. Antes cada arquivo tinha a sua cópia de focusRing e dos botões.

export const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
export const focusRingInset = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'font-semibold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-sm shadow-indigo-950/40',
  secondary: 'bg-slate-800 hover:bg-slate-700 active:bg-slate-800/80 text-slate-200',
  ghost: 'text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-800/70',
  danger: 'font-semibold bg-red-600/90 hover:bg-red-500 active:bg-red-600 text-white',
  link: 'text-indigo-300 hover:text-white'
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-xs',
  lg: 'px-5 py-2.5 text-sm'
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'sm'): string {
  const shape = variant === 'link' ? 'rounded-sm' : `${SIZES[size]} rounded-lg`;
  return `inline-flex items-center justify-center gap-1.5 ${shape} ${VARIANTS[variant]} disabled:opacity-50 disabled:pointer-events-none transition-colors ${focusRing}`;
}

export const iconButtonClass = `p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${focusRing}`;

export const inputClass = `w-full px-3 py-2 text-sm bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 hover:border-slate-600 transition-colors disabled:opacity-50 ${focusRing}`;

export const labelClass = 'block mb-1.5 text-[13px] font-medium text-slate-300';

export const hintClass = 'block mt-1.5 text-xs text-slate-400';

export const sectionTitleClass = 'flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider';

export const cardClass = 'rounded-lg bg-slate-900/60 border border-slate-800';

// --- Acréscimos da 1.0 (as classes acima continuam iguais para quem já usa) ---

// Campo menor, para barras de ferramentas e buscas
export const compactInputClass = `w-full px-3 py-1.5 text-xs bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 hover:border-slate-600 transition-colors disabled:opacity-50 ${focusRing}`;

// Botão de ícone com fundo (barras de ação)
export const iconButtonSolidClass = `inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800/80 hover:bg-slate-700 active:bg-slate-800 text-slate-300 hover:text-white transition-colors disabled:opacity-50 disabled:pointer-events-none ${focusRing}`;

// Abas em pílula (filtros, tipos de arte)
export function pillTabClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${focusRing} ${
    active ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-950/40' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
  }`;
}

// Grupo segmentado (ex: tamanho das capas)
export const segmentedClass = 'inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-900/80 border border-slate-800';

export function segmentClass(active: boolean): string {
  return `px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${focusRing} ${active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-100'}`;
}

// Gatilho compacto de menu (ordenar, filtrar)
export const compactSelectClass = `inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white transition-colors ${focusRing}`;

// Etiqueta pequena (plataforma, status)
export const chipClass = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-900/70 border border-slate-700/70 text-slate-300';

// Superfície de painel (cartões das páginas)
export const panelClass = 'rounded-lg bg-steam-panel/70 border border-slate-800/80';

// Faixas de aviso dentro de janelas e painéis
export const warnBoxClass = 'flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300';
export const okBoxClass = 'flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300';
export const infoBoxClass = 'flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-300';
