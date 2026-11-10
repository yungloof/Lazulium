import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { buttonClass } from './ui';

const reload = () => window.location.reload();

// O App já caiu aqui, então o controle é lido só para este botão
const CrashScreen: React.FC = () => {
  useEffect(() => {
    let frame = 0;
    let released = false; // O botão que causou o erro pode ainda estar apertado
    const poll = () => {
      const pressed = Array.from(navigator.getGamepads()).some((pad) => pad?.buttons[0]?.pressed);
      if (!pressed) released = true;
      else if (released && document.hasFocus()) reload();
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-steam-bg text-slate-100">
      <span className="flex items-center justify-center w-14 h-14 rounded-lg bg-amber-500/10 border border-amber-500/25">
        <AlertTriangle className="w-6 h-6 text-amber-400" />
      </span>
      <h1 className="text-lg font-semibold">Esta tela encontrou um erro</h1>
      <p className="max-w-md text-sm text-slate-400">Seus jogos e suas horas continuam salvos. Recarregue para voltar à biblioteca.</p>
      <button autoFocus onClick={reload} className={`mt-2 ${buttonClass('primary', 'lg')}`}>
        <RefreshCw className="w-4 h-4" /> Recarregar
      </button>
    </div>
  );
};

// Erro dentro de uma página: a barra do topo e a lista lateral continuam de pé
export const PageCrash: React.FC<{ onReset: () => void }> = ({ onReset }) => (
  <div className="h-full min-h-[60vh] flex flex-col items-center justify-center gap-3 p-8 text-center animate-fade-in">
    <span className="flex items-center justify-center w-14 h-14 rounded-lg bg-amber-500/10 border border-amber-500/25">
      <AlertTriangle className="w-6 h-6 text-amber-400" />
    </span>
    <h2 className="text-lg font-semibold text-slate-100">Esta página não abriu</h2>
    <p className="max-w-md text-sm text-slate-400">Seus jogos e suas horas continuam salvos. Tente de novo ou volte para a biblioteca.</p>
    <div className="mt-2 flex items-center gap-2">
      <button data-nav-start onClick={onReset} className={buttonClass('primary', 'md')}>
        <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
      </button>
      <button onClick={reload} className={buttonClass('secondary', 'md')}>
        <RotateCcw className="w-3.5 h-3.5" /> Recarregar o app
      </button>
    </div>
  </div>
);

interface ErrorBoundaryProps {
  children: React.ReactNode;
  // Sem fallback: tela cheia de erro (raiz do app). Com fallback: só a área que quebrou.
  fallback?: (reset: () => void) => React.ReactNode;
}

// Um erro de tela nunca pode deixar só o fundo azul
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Interface] Erro de tela:', error, info.componentStack);
  }

  reset = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback ? this.props.fallback(this.reset) : <CrashScreen />;
  }
}
