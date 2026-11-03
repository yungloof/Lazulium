import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
      <AlertTriangle className="w-10 h-10 text-amber-400" />
      <h1 className="text-lg font-semibold">Esta tela encontrou um erro</h1>
      <p className="max-w-md text-sm text-slate-400">Seus jogos e suas horas continuam salvos. Recarregue para voltar à biblioteca.</p>
      <button
        autoFocus
        onClick={reload}
        className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        <RefreshCw className="w-4 h-4" /> Recarregar
      </button>
    </div>
  );
};

// Um erro de tela nunca pode deixar só o fundo azul
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Interface] Erro de tela:', error, info.componentStack);
  }

  render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}
