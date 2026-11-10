import React from 'react';
import { Loader2 } from 'lucide-react';
import { ButtonSize, ButtonVariant, buttonClass } from './styles';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;             // Ícone à esquerda do texto
  loading?: boolean;                  // Troca o ícone por um spinner e desabilita
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'sm', icon, loading = false, className = '', type = 'button', disabled, children, ...rest }, ref) => (
    <button ref={ref} type={type} disabled={disabled || loading} className={`${buttonClass(variant, size)} ${className}`} {...rest}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
