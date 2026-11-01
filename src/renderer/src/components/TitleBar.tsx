import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Gamepad2, Tv, Monitor } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useGamepadStore } from '../stores/useGamepadStore';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const { uiMode, setUiMode } = useLibraryStore();
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
    <header className="titlebar-drag-region h-11 bg-[#0d0f17] border-b border-slate-800/80 flex items-center justify-between px-3 select-none z-50">
      {/* Left: Brand / Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Gamepad2 className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-extrabold tracking-wider text-slate-200">
          LAZULIUM
          <span className="text-[10px] font-medium text-indigo-400/80 ml-1.5 uppercase tracking-normal">Steam 2</span>
        </span>
      </div>

      {/* Center: Controller Status & UI Mode Toggle */}
      <div className="titlebar-no-drag flex items-center gap-3">
        {gamepad?.connected && (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium animate-pulse">
            <Gamepad2 className="w-3 h-3" />
            <span className="max-w-[140px] truncate">{gamepad.id.split('(')[0] || 'Controle'}</span>
          </div>
        )}

        {/* Toggle Mode: Desktop vs Big Picture */}
        <button
          onClick={() => setUiMode(uiMode === 'desktop' ? 'big-picture' : 'desktop')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 transition-colors"
          title="Alternar entre Modo Desktop e Modo Big Picture"
        >
          {uiMode === 'desktop' ? (
            <>
              <Tv className="w-3.5 h-3.5 text-indigo-400" />
              <span>Big Picture</span>
            </>
          ) : (
            <>
              <Monitor className="w-3.5 h-3.5 text-pink-400" />
              <span>Desktop</span>
            </>
          )}
        </button>
      </div>

      {/* Right: Window Controls */}
      <div className="titlebar-no-drag flex items-center">
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
