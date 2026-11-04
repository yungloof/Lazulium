import React, { useEffect, useRef, useState } from 'react';
import { Game } from '@shared/types/game';
import { Clock, Play, Square, ExternalLink, Star, Image as ImageIcon, Save, Camera, FolderOpen, ListPlus, Pencil } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';

export interface GameContextMenuProps {
  game: Game;
  x: number;
  y: number;
  onClose: () => void;
  onLaunch: (game: Game) => void;
  onStop: (game: Game) => void;
  onOpenPage: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onOpenArtwork: (game: Game) => void;
  onOpenSaves: (game: Game) => void;
  onOpenScreenshots: (game: Game) => void;
  onEditPlaytime: (game: Game) => void;
  onOpenFolder: (game: Game) => void;
  onAddToList: (game: Game) => void;
  onRename: (game: Game) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  separatorBefore?: boolean;
}

export const GameContextMenu: React.FC<GameContextMenuProps> = ({
  game,
  x,
  y,
  onClose,
  onLaunch,
  onStop,
  onOpenPage,
  onToggleFavorite,
  onOpenArtwork,
  onOpenSaves,
  onOpenScreenshots,
  onEditPlaytime,
  onOpenFolder,
  onAddToList,
  onRename
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const isRunning = useLibraryStore((s) => s.launchStatuses[game.id]?.state === 'running');
  const isLaunching = useLibraryStore((s) => s.launchStatuses[game.id]?.state === 'launching');

  const canInstall = game.isInstalled === false && game.platform === 'steam';
  const canPlay = !game.manualEntry && (game.isInstalled !== false || canInstall);

  const items: MenuItem[] = [
    ...(!canPlay ? [] : [{
      id: 'play',
      label: isRunning ? 'Parar jogo' : isLaunching ? 'Iniciando...' : canInstall ? 'Instalar' : 'Jogar',
      icon: isRunning ? <Square className="w-3.5 h-3.5 text-red-400 fill-red-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />,
      action: () => {
        if (isRunning) onStop(game);
        else if (!isLaunching) onLaunch(game);
      }
    }]),
    ...(game.platform === 'steam' ? [] : [{
      id: 'playtime',
      label: 'Ajustar tempo jogado',
      icon: <Clock className="w-3.5 h-3.5 text-slate-400" />,
      action: () => onEditPlaytime(game)
    }]),
    {
      id: 'open',
      label: 'Abrir página do jogo',
      icon: <ExternalLink className="w-3.5 h-3.5 text-slate-400" />,
      action: () => onOpenPage(game)
    },
    {
      id: 'favorite',
      label: game.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
      icon: <Star className={`w-3.5 h-3.5 ${game.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-slate-400'}`} />,
      action: () => onToggleFavorite(game.id)
    },
    {
      id: 'rename',
      label: 'Renomear',
      icon: <Pencil className="w-3.5 h-3.5 text-slate-400" />,
      action: () => onRename(game)
    },
    {
      id: 'list',
      label: 'Adicionar à lista',
      icon: <ListPlus className="w-3.5 h-3.5 text-slate-400" />,
      action: () => onAddToList(game)
    },
    ...(game.manualEntry || game.isInstalled === false ? [] : [{
      id: 'folder',
      label: 'Abrir pasta do jogo',
      icon: <FolderOpen className="w-3.5 h-3.5 text-slate-400" />,
      action: () => onOpenFolder(game)
    }]),
    {
      id: 'artwork',
      label: 'Trocar artes',
      icon: <ImageIcon className="w-3.5 h-3.5 text-slate-400" />,
      action: () => onOpenArtwork(game),
      separatorBefore: true
    },
    {
      id: 'saves',
      label: 'Backup de saves',
      icon: <Save className="w-3.5 h-3.5 text-slate-400" />,
      action: () => onOpenSaves(game)
    },
    {
      id: 'screenshots',
      label: 'Capturas de tela',
      icon: <Camera className="w-3.5 h-3.5 text-slate-400" />,
      action: () => onOpenScreenshots(game)
    }
  ];

  const [activeIndex, setActiveIndex] = useState(0);

  // Fecha com clique fora ou Esc
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        items[activeIndex]?.action();
        onClose();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [items, activeIndex, onClose]);

  // Posiciona sem vazar para fora da janela
  const MENU_WIDTH = 220;
  const MENU_HEIGHT = 370;
  const posX = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const posY = Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8));

  return (
    <div
      ref={menuRef}
      data-nav-scope
      style={{ left: `${posX}px`, top: `${posY}px` }}
      className="fixed z-50 w-56 rounded-lg bg-steam-bg border border-slate-700/80 p-1.5 shadow-lg shadow-black/90 text-xs select-none backdrop-blur-md"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 truncate border-b border-slate-800/80 mb-1">
        {game.title}
      </div>

      <div className="space-y-0.5" role="menu">
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            {item.separatorBefore && <div className="border-t border-slate-800/80 my-1" />}
            <button
              role="menuitem"
              onClick={() => {
                item.action();
                onClose();
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                index === activeIndex
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="truncate flex-1">{item.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
