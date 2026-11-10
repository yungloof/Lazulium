import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { iconButtonClass } from './styles';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

const WIDTHS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-4xl',
  '3xl': 'max-w-5xl'
};

interface ModalProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;             // Ícone antes do título
  onClose: () => void;
  size?: ModalSize;
  tall?: boolean;                     // Altura fixa (listas e grades longas): o corpo rola por dentro
  footer?: React.ReactNode;           // Botões no rodapé, alinhados à direita
  headerActions?: React.ReactNode;    // Botões extras no cabeçalho, antes do X
  toolbar?: React.ReactNode;          // Faixa fixa entre o cabeçalho e o corpo (busca, abas)
  onSubmit?: () => void;              // Vira <form>: Enter envia
  bodyClassName?: string;
  layer?: number;                     // z-index de janelas abertas por cima de outra janela
  children: React.ReactNode;
}

// Pilha das janelas abertas: o Esc fecha só a de cima (antes fechava a de baixo junto)
const openModals: symbol[] = [];

// Janela por cima do app: Esc e clique fora fecham, o foco entra nela ao abrir e volta ao fechar
export const Modal: React.FC<ModalProps> = ({
  title,
  subtitle,
  icon,
  onClose,
  size = 'md',
  tall = false,
  footer,
  headerActions,
  toolbar,
  onSubmit,
  bodyClassName = 'p-5 space-y-4',
  layer,
  children
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement & HTMLFormElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const me = Symbol('modal');
    openModals.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openModals[openModals.length - 1] !== me) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    // Leva o foco para dentro, a não ser que um campo já tenha pedido (autoFocus)
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      openModals.splice(openModals.indexOf(me), 1);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
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

  // Portal no body: um transform ou blur de quem abriu não prende a janela dentro dele
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-6 animate-fade-in"
      style={layer ? { zIndex: layer } : undefined}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      // Clique que começou e terminou no fundo; o B do controle chega como click sem mouse (detail 0)
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (pressedOnBackdrop.current || e.detail === 0) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <Panel
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        {...submitProps}
        className={`w-full ${WIDTHS[size]} ${tall ? 'h-[85vh]' : 'max-h-[88vh]'} flex flex-col rounded-lg bg-steam-panel border border-slate-800 shadow-2xl shadow-black/50 outline-none animate-pop-in`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-2 text-base font-medium text-white">
              {icon}
              <span className="truncate">{title}</span>
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerActions}
            <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)" className={iconButtonClass}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {toolbar && <div className="flex-shrink-0 border-b border-slate-800/80">{toolbar}</div>}
        <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800 flex-shrink-0">{footer}</div>}
      </Panel>
    </div>,
    document.body
  );
};
