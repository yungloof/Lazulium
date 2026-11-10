import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { iconButtonClass } from './styles';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const WIDTHS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl'
};

interface ModalProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;             // Ícone antes do título
  onClose: () => void;
  size?: ModalSize;
  footer?: React.ReactNode;           // Botões no rodapé, alinhados à direita
  headerActions?: React.ReactNode;    // Botões extras no cabeçalho, antes do X
  onSubmit?: () => void;              // Vira <form>: Enter envia
  bodyClassName?: string;
  children: React.ReactNode;
}

// Janela por cima do app: Esc e clique fora fecham, o foco entra nela ao abrir e volta ao fechar
export const Modal: React.FC<ModalProps> = ({ title, subtitle, icon, onClose, size = 'md', footer, headerActions, onSubmit, bodyClassName = 'p-5 space-y-4', children }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement & HTMLFormElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    // Leva o foco para dentro, a não ser que um campo já tenha pedido (autoFocus)
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const Panel = (onSubmit ? 'form' : 'div') as 'div';
  const submitProps = onSubmit
    ? {
        onSubmit: (e: React.FormEvent) => {
          e.preventDefault();
          onSubmit();
        }
      }
    : {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Panel
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        {...submitProps}
        className={`w-full ${WIDTHS[size]} max-h-[88vh] flex flex-col rounded-lg bg-steam-panel border border-slate-800 shadow-2xl shadow-black/40 outline-none`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-2 text-base text-white">
              {icon}
              <span className="truncate">{title}</span>
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerActions}
            <button type="button" onClick={onClose} aria-label="Fechar" className={iconButtonClass}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800">{footer}</div>}
      </Panel>
    </div>
  );
};
