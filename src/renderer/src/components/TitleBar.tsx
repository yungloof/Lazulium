import React, { useState, useEffect } from 'react';
import { Copy, Minus, Square, X, Gamepad2 } from 'lucide-react';
import { useGamepadStore } from '../stores/useGamepadStore';
import logo from '../assets/logo.png';

const windowButton = 'w-11 h-12 flex items-center justify-center text-slate-400 hover:text-white transition-colors';

// Uma barra só: marca, seções, ações e controles da janela. O que não é botão arrasta a janela.
export const TitleBar: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const gamepad = useGamepadStore((s) => s.gamepad);

  useEffect(() => {
    window.electronAPI?.isMaximized().then(setIsMaximized);
  }, []);

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = async () => {
    await window.electronAPI?.maximizeWindow();
    const max = await window.electronAPI?.isMaximized();
    setIsMaximized(max);
  };
  const handleClose = () => window.electronAPI?.closeWindow();

  return (
    <header className="titlebar-drag-region h-12 flex-shrink-0 bg-steam-header border-b border-slate-800/60 flex items-center gap-3 xl:gap-5 pl-3.5 select-none z-50">
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <img src={logo} alt="" className="w-6 h-6 rounded-md" />
        <span className="font-display text-base font-semibold text-slate-100 tracking-tight">
          Lazulium
          <span className="hidden 2xl:inline text-[10px] font-medium text-indigo-400/80 ml-1.5 uppercase tracking-wide">Steam 2</span>
        </span>
      </div>

      <div className="flex-1 min-w-0 h-full flex items-center justify-between gap-3">{children}</div>

      {gamepad?.connected && (
        <div
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex-shrink-0"
          title={gamepad.id}
        >
          <Gamepad2 className="w-3 h-3" />
          <span className="max-w-[140px] truncate">{gamepad.id.split('(')[0].trim() || 'Controle'}</span>
        </div>
      )}

      <div className="titlebar-no-drag flex items-center flex-shrink-0" data-no-nav>
        <button onClick={handleMinimize} aria-label="Minimizar" title="Minimizar" className={`${windowButton} hover:bg-slate-800/70`}>
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleMaximize} aria-label={isMaximized ? 'Restaurar' : 'Maximizar'} title={isMaximized ? 'Restaurar' : 'Maximizar'} className={`${windowButton} hover:bg-slate-800/70`}>
          {isMaximized ? <Copy className="w-3 h-3 -scale-x-100" /> : <Square className="w-3 h-3" />}
        </button>
        <button onClick={handleClose} aria-label="Fechar" title="Fechar" className={`${windowButton} hover:bg-red-600/90`}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
