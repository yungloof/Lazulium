import React, { useEffect, useRef, useState } from 'react';
import { Game } from '@shared/types/game';
import { Star, Gamepad2 } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';

const PLATFORM_BADGES: Record<Game['platform'], { label: string; className: string }> = {
  steam: { label: 'Steam', className: 'bg-blue-600/85' },
  epic: { label: 'Epic', className: 'bg-slate-700/90' },
  gog: { label: 'GOG', className: 'bg-purple-600/85' },
  riot: { label: 'Riot', className: 'bg-red-600/85' },
  xbox: { label: 'Xbox', className: 'bg-emerald-600/85' },
  emulator: { label: 'Emu', className: 'bg-amber-600/85' },
  standalone: { label: 'PC', className: 'bg-zinc-700/90' }
};

interface GameCardProps {
  game: Game;
  isFocused?: boolean;
  onSelect: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onContextMenu?: (game: Game, e: React.MouseEvent) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isFocused = false,
  onSelect,
  onToggleFavorite,
  onContextMenu
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  // Nem todo AppID tem capa vertical na CDN: cai no placeholder em vez de imagem quebrada
  const [coverFailed, setCoverFailed] = useState(false);
  const isLaunching = useLibraryStore((s) => s.launchStatuses[game.id]?.state === 'launching');
  useEffect(() => setCoverFailed(false), [game.media?.coverUrl]);

  // Garante que o item focado pelo controle ou teclado esteja visível na tela
  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused]);

  const formatPlaytime = (seconds: number) => {
    if (!seconds || seconds < 60) return 'Nunca jogado';
    const hours = seconds / 3600;
    return hours < 1 ? `${Math.round(seconds / 60)} min` : `${hours.toFixed(1).replace('.', ',')} h`;
  };

  const badge = PLATFORM_BADGES[game.platform];
  const badgeLabel = game.platform === 'emulator' ? game.emulatorId || 'EMU' : badge.label;

  return (
    <div
      ref={cardRef}
      onClick={() => onSelect(game)}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(game, e);
        }
      }}
      title={game.title}
      className={`group relative aspect-[2/3] overflow-hidden bg-slate-900/90 border transition-all duration-200 cursor-pointer ${
        isFocused
          ? 'border-indigo-400 ring-2 ring-indigo-500/70 scale-[1.05] shadow-xl z-20'
          : 'border-slate-800 hover:border-slate-600 hover:scale-[1.03] hover:shadow-lg'
      }`}
    >
      {/* Cover Image or Fallback */}
      {game.media?.coverUrl && !coverFailed ? (
        <img
          src={game.media.coverUrl}
          alt={game.title}
          className="w-full h-full object-contain"
          loading="lazy"
          onError={() => {
            setCoverFailed(true);
            // O main confirma se a URL não existe e busca uma capa no SteamGridDB
            window.electronAPI?.reportBrokenArtwork(game.id, 'cover');
          }}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-2.5 bg-gradient-to-b from-slate-800 to-slate-950 text-center">
          <Gamepad2 className="w-7 h-7 text-slate-600 mb-1.5" />
          <span className="text-[11px] leading-tight font-semibold text-slate-300 line-clamp-3">{game.title}</span>
        </div>
      )}

      {/* Top Overlay: Platform Badge & Favorite Button */}
      <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between z-10">
        <span className={`${badge.className} text-white text-[9px] font-bold leading-none px-1.5 py-1 rounded uppercase tracking-wide`}>
          {badgeLabel}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(game.id);
          }}
          title={game.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
          className={`p-1 rounded-full backdrop-blur-md transition-all ${
            game.isFavorite
              ? 'bg-amber-500/25 text-amber-400'
              : 'bg-black/50 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-white'
          } ${isFocused ? 'opacity-100' : ''}`}
        >
          <Star className={`w-3 h-3 ${game.isFavorite ? 'fill-amber-400' : ''}`} />
        </button>
      </div>

      {/* Bottom Gradient Overlay: Title & Playtime */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-2 pb-1.5 pt-6">
        <h3 className="text-xs font-bold leading-tight text-white truncate drop-shadow-md">{game.title}</h3>
        <p className="mt-0.5 text-[10px] text-slate-400 truncate">
          {isLaunching ? 'Iniciando...' : formatPlaytime(game.totalPlaytimeSeconds)}
        </p>
      </div>
    </div>
  );
};
