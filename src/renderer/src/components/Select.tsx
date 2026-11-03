import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  dot?: string;                     // Classe da bolinha colorida
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  id?: string;
  className?: string;               // Substitui o visual do botão
  children?: React.ReactNode;       // Substitui o conteúdo do botão
}

const ROW_HEIGHT = 34;
const MAX_LIST_HEIGHT = 320;
const MIN_LIST_WIDTH = 180;
const SEARCH_FROM = 12;             // Listas longas ganham busca
const WINDOW_MARGIN = 8;

const defaultTrigger = 'flex items-center justify-between gap-2 px-3 py-2 text-[13px] bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 hover:border-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

// Menu do próprio app: o <select> nativo abre na cor do sistema e não dá para estilizar
export function Select<T extends string>({ value, options, onChange, ariaLabel, id, className, children }: SelectProps<T>): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  const searchable = options.length >= SEARCH_FROM;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? listRef.current?.querySelector<HTMLElement>('button');
    selected?.focus();
    // Esc fecha só o menu, não a janela que está por baixo
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const position = (): React.CSSProperties => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return {};
    const height = Math.min(options.length * ROW_HEIGHT + 10 + (searchable ? 44 : 0), MAX_LIST_HEIGHT);
    const width = Math.max(rect.width, MIN_LIST_WIDTH);
    const left = Math.max(WINDOW_MARGIN, Math.min(rect.left, window.innerWidth - width - WINDOW_MARGIN));
    const fitsBelow = rect.bottom + height + WINDOW_MARGIN < window.innerHeight;
    return fitsBelow
      ? { left, width, top: rect.bottom + 4, maxHeight: MAX_LIST_HEIGHT }
      : { left, width, bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(MAX_LIST_HEIGHT, rect.top - WINDOW_MARGIN) };
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={className ?? defaultTrigger}
      >
        {children ?? (
          <>
            <span className="flex items-center gap-2 min-w-0">
              {current?.dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${current.dot}`} />}
              <span className="truncate">{current?.label}</span>
            </span>
            <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[80]"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          >
            <div
              ref={listRef}
              role="listbox"
              aria-label={ariaLabel}
              style={position()}
              onClick={(e) => e.stopPropagation()}
              className="fixed flex flex-col rounded-lg bg-slate-900 border border-slate-700 shadow-lg shadow-black/60 overflow-hidden"
            >
              {searchable && (
                <div className="relative p-1.5 border-b border-slate-800 flex-shrink-0">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar"
                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-950/60 border border-slate-800 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              )}
              <div className="p-1 overflow-y-auto">
                {visible.map((option) => {
                  const selected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(option.value);
                        close();
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[13px] transition-colors focus:outline-none hover:bg-slate-800 focus:bg-slate-800 ${selected ? 'text-white' : 'text-slate-300'}`}
                    >
                      {option.dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${option.dot}`} />}
                      <span className="flex-1 min-w-0 truncate">{option.label}</span>
                      {selected && <Check className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />}
                    </button>
                  );
                })}
                {visible.length === 0 && <p className="px-2.5 py-2 text-xs text-slate-500">Nada com esse nome.</p>}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
