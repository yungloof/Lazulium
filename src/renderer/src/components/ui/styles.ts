// Classes compartilhadas da interface. Antes cada arquivo tinha a sua cópia de focusRing e dos botões.

export const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
export const focusRingInset = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'font-semibold bg-indigo-600 hover:bg-indigo-500 text-white',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200',
  ghost: 'text-slate-300 hover:text-white hover:bg-slate-800',
  danger: 'font-semibold bg-red-600/90 hover:bg-red-500 text-white',
  link: 'text-indigo-300 hover:text-white'
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-xs'
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'sm'): string {
  const shape = variant === 'link' ? 'rounded-sm' : `${SIZES[size]} rounded-lg`;
  return `inline-flex items-center justify-center gap-1.5 ${shape} ${VARIANTS[variant]} disabled:opacity-50 disabled:pointer-events-none transition-colors ${focusRing}`;
}

export const iconButtonClass = `p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${focusRing}`;

export const inputClass = `w-full px-3 py-2 text-sm bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-600 disabled:opacity-50 ${focusRing}`;

export const labelClass = 'block mb-1.5 text-[13px] font-medium text-slate-300';

export const hintClass = 'block mt-1.5 text-xs text-slate-500';

export const sectionTitleClass = 'flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider';

export const cardClass = 'rounded-lg bg-slate-900/60 border border-slate-800';
