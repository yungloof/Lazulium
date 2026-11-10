import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Game } from '@shared/types/game';
import { Clock, Play, Square, ExternalLink, Star, Image as ImageIcon, Save, Camera, FolderOpen, ListPlus, Pencil, EyeOff, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ContextMenuState, GameModalKind, useUiStore } from '../stores/useUiStore';
import { askDeleteEntry, hideGame, launchGame, openGame, openGameFolder, stopGame, toggleFavorite } from '../utils/gameActions';

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
  onHide: (game: Game) => void;
  onLaunchOptions: (game: Game) => void;
  onDeleteEntry: (game: Game) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  separatorBefore?: boolean;
  danger?: boolean;
}

const WINDOW_MARGIN = 8;
const icon = 'w-3.5 h-3.5';

// Menu de contexto de um jogo. Usa o foco de verdade do navegador: setas, controle e mouse
// destacam o mesmo item (antes eram dois destaques diferentes), e o foco volta para quem abriu.
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
  onRename,
  onHide,
  onLaunchOptions,
  onDeleteEntry
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const isRunning = useLibraryStore((s) => s.launchStatuses[game.id]?.state === 'running');
  const isLaunching = useLibraryStore((s) => s.launchStatuses[game.id]?.state === 'launching');

  const canInstall = game.isInstalled === false && game.platform === 'steam';
  const canPlay = !game.manualEntry && (game.isInstalled !== false || canInstall);

  const items: MenuItem[] = [
    ...(!canPlay
      ? []
      : [
          {
            id: 'play',
            label: isRunning ? 'Parar jogo' : isLaunching ? 'Iniciando...' : canInstall ? 'Instalar' : 'Jogar',
            icon: isRunning ? <Square className={`${icon} text-red-400 fill-red-400`} /> : <Play className={`${icon} text-emerald-400 fill-emerald-400`} />,
            action: () => {
              if (isRunning) onStop(game);
              else if (!isLaunching) onLaunch(game);
            }
          }
        ]),
    ...(game.platform === 'steam' ? [] : [{ id: 'playtime', label: 'Ajustar tempo jogado', icon: <Clock className={icon} />, action: () => onEditPlaytime(game) }]),
    { id: 'open', label: 'Abrir página do jogo', icon: <ExternalLink className={icon} />, action: () => onOpenPage(game) },
    {
      id: 'favorite',
      label: game.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
      icon: <Star className={`${icon} ${game.isFavorite ? 'text-amber-400 fill-amber-400' : ''}`} />,
      action: () => onToggleFavorite(game.id)
    },
    { id: 'rename', label: 'Renomear', icon: <Pencil className={icon} />, action: () => onRename(game) },
    { id: 'list', label: 'Adicionar à lista', icon: <ListPlus className={icon} />, action: () => onAddToList(game) },
    ...(game.manualEntry || game.isInstalled === false ? [] : [{ id: 'folder', label: 'Abrir pasta do jogo', icon: <FolderOpen className={icon} />, action: () => onOpenFolder(game) }]),
    { id: 'artwork', label: 'Trocar artes', icon: <ImageIcon className={icon} />, action: () => onOpenArtwork(game), separatorBefore: true },
    { id: 'saves', label: 'Backup de saves', icon: <Save className={icon} />, action: () => onOpenSaves(game) },
    { id: 'screenshots', label: 'Capturas de tela', icon: <Camera className={icon} />, action: () => onOpenScreenshots(game) },
    ...(game.platform === 'steam' || game.manualEntry
      ? []
      : [{ id: 'launch-options', label: 'Opções de inicialização', icon: <SlidersHorizontal className={icon} />, action: () => onLaunchOptions(game) }]),
    { id: 'hide', label: 'Ocultar', icon: <EyeOff className={icon} />, action: () => onHide(game), separatorBefore: true },
    ...(game.manualEntry ? [{ id: 'delete-entry', label: 'Apagar este registro', icon: <Trash2 className={icon} />, action: () => onDeleteEntry(game), danger: true }] : [])
  ];

  // Posiciona pela altura real, sem vazar para fora da janela
  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      left: Math.max(WINDOW_MARGIN, Math.min(x, window.innerWidth - rect.width - WINDOW_MARGIN)),
      top: Math.max(WINDOW_MARGIN, Math.min(y, window.innerHeight - rect.height - WINDOW_MARGIN))
    });
  }, [x, y]);

  // Foco no primeiro item ao abrir; ao fechar, volta para a capa ou botão de onde veio
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    return () => {
      if (previous && previous !== document.body && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  // Fecha com clique fora ou Esc; as setas andam pelo foco (useGamepad), aqui só fecham as pontas
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      data-nav-scope
      role="menu"
      aria-label={`Opções de ${game.title}`}
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      className="fixed z-50 w-60 rounded-lg bg-steam-panel/95 border border-slate-700/80 p-1.5 shadow-2xl shadow-black/60 text-xs select-none backdrop-blur-md animate-pop-in"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-2.5 pt-1 pb-1.5 mb-1 text-[11px] font-semibold text-slate-400 truncate border-b border-slate-800/80">{game.title}</div>
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {item.separatorBefore && <div role="separator" className="border-t border-slate-800/80 my-1" />}
          <button
            role="menuitem"
            onClick={() => {
              item.action();
              onClose();
            }}
            onMouseEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
            className={`group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left outline-none transition-colors focus:bg-indigo-600 focus:text-white ${
              item.danger ? 'text-red-300' : 'text-slate-200'
            }`}
          >
            <span className="flex-shrink-0 text-slate-400 group-focus:text-white">{item.icon}</span>
            <span className="truncate flex-1">{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

const openFor = (kind: GameModalKind) => (game: Game) => useUiStore.getState().openModal({ kind, gameId: game.id });
const closeMenu = () => useUiStore.getState().setContextMenu(null);

// Liga o menu às ações do app (o App só diz onde abrir)
export const GameContextMenuHost: React.FC<{ menu: ContextMenuState }> = ({ menu }) => {
  const game = useLibraryStore((s) => s.games.find((g) => g.id === menu.gameId));
  if (!game) return null;
  return (
    <GameContextMenu
      game={game}
      x={menu.x}
      y={menu.y}
      onClose={closeMenu}
      onLaunch={(g) => void launchGame(g)}
      onStop={stopGame}
      onOpenPage={openGame}
      onOpenFolder={openGameFolder}
      onAddToList={openFor('addToList')}
      onRename={openFor('rename')}
      onHide={(g) => void hideGame(g)}
      onLaunchOptions={openFor('launchOptions')}
      onDeleteEntry={askDeleteEntry}
      onToggleFavorite={(id) => void toggleFavorite(id)}
      onOpenArtwork={openFor('artwork')}
      onOpenSaves={openFor('saves')}
      onEditPlaytime={openFor('playtime')}
      onOpenScreenshots={openFor('screenshots')}
    />
  );
};
