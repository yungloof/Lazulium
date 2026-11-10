import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

type Tone = 'error' | 'success' | 'info';

const TONES: Record<Tone, { icon: React.ElementType; className: string }> = {
  error: { icon: AlertTriangle, className: 'text-amber-300' },
  success: { icon: CheckCircle2, className: 'text-emerald-300' },
  info: { icon: Info, className: 'text-slate-400' }
};

// Linha curta de aviso: erro de uma ação, confirmação ou explicação
export const Notice: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string }> = ({ tone = 'error', children, className = '' }) => {
  if (!children) return null;
  const { icon: Icon, className: color } = TONES[tone];
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-1.5 text-xs ${color} ${className}`}>
      <Icon className="w-3.5 h-3.5 mt-px flex-shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
};
