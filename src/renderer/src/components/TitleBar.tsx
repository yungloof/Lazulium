import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Gamepad2 } from 'lucide-react';
import { useGamepadStore } from '../stores/useGamepadStore';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const { gamepad } = useGamepadStore();

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
    <header className="titlebar-drag-region h-11 bg-steam-header flex items-center justify-between px-3 select-none z-50">
      {/* Left: Brand / Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-sm bg-indigo-800 flex items-center justify-center">
          <Gamepad2 className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <span className="text-sm font-extrabold tracking-wider text-slate-200">
          LAZULIUM
          <span className="text-[10px] font-medium text-indigo-400/80 ml-1.5 uppercase tracking-normal">Steam 2</span>
        </span>
      </div>

      {/* Center: Controller Status */}
      <div className="titlebar-no-drag flex items-center gap-3">
        {gamepad?.connected && (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium animate-pulse">
            <Gamepad2 className="w-3 h-3" />
            <span className="max-w-[140px] truncate">{gamepad.id.split('(')[0] || 'Controle'}</span>
          </div>
        )}
      </div>

      {/* Right: Window Controls */}
      <div className="titlebar-no-drag flex items-center" data-no-nav>
        <button
          onClick={handleMinimize}
          className="w-10 h-11 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-10 h-11 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          className="w-10 h-11 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-600/90 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
