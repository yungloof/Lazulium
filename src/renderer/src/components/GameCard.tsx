import React, { useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import { Star, Gamepad2 } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';

const PLATFORM_LABEL: Record<Game['platform'], string> = {
  steam: 'Steam',
  epic: 'Epic',
  gog: 'GOG',
  riot: 'Riot',
  xbox: 'Xbox',
  emulator: 'Emu',
  standalone: 'PC'
};

interface GameCardProps {
  game: Game;
  navStart?: boolean;               // Primeiro item do controle nesta tela
  onSelect: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onContextMenu?: (game: Game, e: React.MouseEvent) => void;
}

const formatPlaytime = (seconds: number) => {
  if (!seconds || seconds < 60) return 'Nunca jogado';
  const hours = seconds / 3600;
  return hours < 1 ? `${Math.round(seconds / 60)} min` : `${hours.toFixed(1).replace('.', ',')} h`;
};

// A capa aparece inteira: nome e horas ficam embaixo, não por cima da arte
export const GameCard: React.FC<GameCardProps> = ({ game, navStart = false, onSelect, onToggleFavorite, onContextMenu }) => {
  // Nem todo AppID tem capa vertical na CDN: cai no placeholder em vez de imagem quebrada
  const [coverFailed, setCoverFailed] = useState(false);
  const isLaunching = useLibraryStore((s) => s.launchStatuses[game.id]?.state === 'launching');
  useEffect(() => setCoverFailed(false), [game.media?.coverUrl]);

  const platform = game.platform === 'emulator' ? game.emulatorId || PLATFORM_LABEL.emulator : PLATFORM_LABEL[game.platform];

  return (
    <div
      data-game-id={game.id}
      data-nav-start={navStart ? '' : undefined}
      tabIndex={0}
      role="button"
      onClick={() => onSelect(game)}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(game, e);
        }
      }}
      title={game.title}
      className="group min-w-0 cursor-pointer focus:outline-none"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-slate-900 border border-slate-800 group-hover:border-slate-500 transition-colors">
        {game.media?.coverUrl && !coverFailed ? (
          <img
            src={game.media.coverUrl}
            alt=""
            className="w-full h-full object-contain"
            loading="lazy"
            onError={() => {
              setCoverFailed(true);
              // O main confirma se a URL não existe e busca uma capa no SteamGridDB
              window.electronAPI?.reportBrokenArtwork(game.id, 'cover');
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-2.5 bg-slate-900 text-center">
            <Gamepad2 className="w-7 h-7 text-slate-600 mb-1.5" />
            <span className="text-[11px] leading-tight font-medium text-slate-400 line-clamp-3">{game.title}</span>
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(game.id);
          }}
          title={game.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
          className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-opacity ${
            game.isFavorite ? 'bg-black/70 text-amber-400' : 'bg-black/70 text-slate-200 opacity-0 group-hover:opacity-100 hover:text-white'
          }`}
        >
          <Star className={`w-3 h-3 ${game.isFavorite ? 'fill-amber-400' : ''}`} />
        </button>
      </div>

      <h3 className="mt-2 text-[13px] leading-tight text-slate-100 truncate">{game.title}</h3>
      <p className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="truncate">{isLaunching ? 'Iniciando...' : formatPlaytime(game.totalPlaytimeSeconds)}</span>
        <span className="flex-shrink-0 uppercase tracking-wide">{platform}</span>
      </p>
    </div>
  );
};
