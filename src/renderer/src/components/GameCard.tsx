import React, { useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import { Star, Play, Clock, Gamepad2 } from 'lucide-react';

interface GameCardProps {
  game: Game;
  isFocused?: boolean;
  onSelect: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isFocused = false,
  onSelect,
  onToggleFavorite
}) => {
  // Nem todo AppID tem capa vertical na CDN: cai no placeholder em vez de imagem quebrada
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => setCoverFailed(false), [game.media?.coverUrl]);

  const formatPlaytime = (seconds: number) => {
    if (!seconds || seconds < 60) return 'Nunca jogado';
    const hours = (seconds / 3600).toFixed(1);
    return `${hours} hrs`;
  };

  const getPlatformBadge = () => {
    switch (game.platform) {
      case 'steam':
        return <span className="bg-blue-600/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">STEAM</span>;
      case 'epic':
        return <span className="bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">EPIC</span>;
      case 'gog':
        return <span className="bg-purple-600/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">GOG</span>;
      case 'emulator':
        return (
          <span className="bg-amber-600/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
            {game.emulatorId || 'EMU'}
          </span>
        );
      default:
        return <span className="bg-zinc-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">PC</span>;
    }
  };

  return (
    <div
      onClick={() => onSelect(game)}
      className={`group relative aspect-[2/3] rounded-xl overflow-hidden bg-slate-900/90 border transition-all duration-200 cursor-pointer ${
        isFocused
          ? 'border-indigo-400 ring-4 ring-indigo-500/40 scale-[1.04] shadow-2xl shadow-indigo-500/30 z-20'
          : 'border-slate-800 hover:border-slate-600 hover:scale-[1.02] hover:shadow-xl'
      }`}
    >
      {/* Cover Image or Fallback */}
      {game.media?.coverUrl && !coverFailed ? (
        <img
          src={game.media.coverUrl}
          alt={game.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-slate-800 to-slate-950 text-center">
          <Gamepad2 className="w-10 h-10 text-slate-600 mb-2" />
          <span className="text-xs font-semibold text-slate-300 line-clamp-3">{game.title}</span>
        </div>
      )}

      {/* Top Overlay: Platform Badge & Favorite Button */}
      <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
        <div>{getPlatformBadge()}</div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(game.id);
          }}
          className={`p-1.5 rounded-full backdrop-blur-md transition-colors ${
            game.isFavorite
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-black/40 text-slate-400 hover:text-white'
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${game.isFavorite ? 'fill-amber-400' : ''}`} />
        </button>
      </div>

      {/* Bottom Gradient Overlay: Title & Playtime */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-3 pt-8 flex flex-col justify-end">
        <h3 className="text-sm font-bold text-white truncate drop-shadow-md">{game.title}</h3>
        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>{formatPlaytime(game.totalPlaytimeSeconds)}</span>
          </div>
          {game.isRunning && (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold animate-pulse">
              <Play className="w-3 h-3 fill-emerald-400" /> Em execução
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
