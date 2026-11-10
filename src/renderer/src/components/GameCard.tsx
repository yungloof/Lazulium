import React, { memo, useState } from 'react';
import { Game } from '@shared/types/game';
import { Star, Gamepad2, Play } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { formatPlaytimeShort } from '../utils/format';
import { platformBadge } from '../utils/platform';
import { launchGame, openContextMenu, openGame, toggleFavorite } from '../utils/gameActions';

interface GameCardProps {
  game: Game;
  navStart?: boolean;               // Primeiro item do controle nesta tela
  onSelect?: (game: Game) => void;  // Padrão: abre a página do jogo
  onToggleFavorite?: (id: string) => void;
  onContextMenu?: (game: Game, e: React.MouseEvent) => void;
}

// A capa aparece inteira: nome e horas ficam embaixo, não por cima da arte.
// Memorizada: mexer em um jogo não redesenha as outras 269 capas.
export const GameCard = memo<GameCardProps>(({ game, navStart = false, onSelect = openGame, onToggleFavorite = toggleFavorite, onContextMenu = openContextMenu }) => {
  // Nem todo AppID tem capa vertical na CDN: cai no placeholder em vez de imagem quebrada
  const coverUrl = game.media?.coverUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const state = useLibraryStore((s) => s.launchStatuses[game.id]?.state);
  const removed = game.isInstalled === false;
  const canPlay = !game.manualEntry && !removed;

  return (
    <div
      data-game-id={game.id}
      data-nav-start={navStart ? '' : undefined}
      tabIndex={0}
      role="button"
      aria-label={`${game.title}, ${formatPlaytimeShort(game.totalPlaytimeSeconds)}${game.isFavorite ? ', favorito' : ''}`}
      onClick={() => onSelect(game)}
      onContextMenu={(e) => onContextMenu(game, e)}
      title={game.title}
      className="group min-w-0 cursor-pointer rounded-lg focus:outline-none"
    >
      <div
        data-cover
        className={`relative aspect-[2/3] overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-800 shadow-md shadow-black/30 transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/50 group-hover:ring-slate-600 group-focus-visible:ring-2 group-focus-visible:ring-indigo-400`}
      >
        {coverUrl && failedUrl !== coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className={`w-full h-full object-contain transition-[filter,opacity] duration-200 ${removed ? 'grayscale opacity-60' : ''}`}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => {
              setFailedUrl(coverUrl);
              // O main confirma se a URL não existe e busca uma capa no SteamGridDB
              window.electronAPI?.reportBrokenArtwork(game.id, 'cover');
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 bg-gradient-to-b from-slate-800 to-slate-900 text-center">
            <Gamepad2 className="w-7 h-7 text-slate-500" />
            <span className="text-[11px] leading-tight font-medium text-slate-300 line-clamp-3">{game.title}</span>
          </div>
        )}

        {/* Faixa de baixo no hover: jogar sem abrir a página (só mouse; no controle a capa é um item só) */}
        {canPlay && state !== 'running' && (
          <span className="absolute inset-x-0 bottom-0 p-2 flex justify-center bg-gradient-to-t from-black/80 to-transparent opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-[opacity,transform] duration-200">
            <button
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                void launchGame(game);
              }}
              aria-label={`Jogar ${game.title}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-[11px] font-bold shadow-lg"
            >
              <Play className="w-3 h-3 fill-current" /> JOGAR
            </button>
          </span>
        )}

        {state === 'running' && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500 text-[10px] font-bold text-emerald-950 shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-950 animate-pulse" /> Jogando
          </span>
        )}
        {removed && <span className="absolute left-1.5 top-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-medium text-slate-300">Não instalado</span>}

        <button
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(game.id);
          }}
          title={game.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
          aria-label={game.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
          aria-pressed={game.isFavorite}
          className={`absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/65 backdrop-blur-sm transition-opacity ${
            game.isFavorite ? 'text-amber-400' : 'text-slate-200 opacity-0 group-hover:opacity-100 hover:text-white'
          }`}
        >
          <Star className={`w-3 h-3 ${game.isFavorite ? 'fill-amber-400' : ''}`} />
        </button>
      </div>

      <h3 data-cover-title className="mt-2 text-[13px] font-medium leading-tight text-slate-100 truncate transition-colors group-hover:text-white">
        {game.title}
      </h3>
      <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span className={`truncate tabular-nums ${state === 'running' ? 'text-emerald-300' : ''}`}>
          {state === 'launching' ? 'Iniciando...' : state === 'running' ? 'Jogando agora' : formatPlaytimeShort(game.totalPlaytimeSeconds)}
        </span>
        <span className="flex-shrink-0 uppercase tracking-wide text-[10px] font-semibold text-slate-400/90">{platformBadge(game)}</span>
      </p>
    </div>
  );
});
GameCard.displayName = 'GameCard';
