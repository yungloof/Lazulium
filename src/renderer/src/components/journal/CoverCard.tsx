import React, { useEffect, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { focusRing } from '../ui';

interface GameCoverProps {
  src?: string;
  title: string;
  gameId?: string;                  // Capa quebrada de um jogo da biblioteca: o main procura outra
  className?: string;
  compact?: boolean;                // Miniatura: só o ícone, sem o nome
}

// Capa inteira (sem corte) ou um cartão com o nome quando não há arte
export const GameCover: React.FC<GameCoverProps> = ({ src, title, gameId, className = '', compact = false }) => {
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [src]);

  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => {
          setFailed(src);
          if (gameId) window.electronAPI?.reportBrokenArtwork(gameId, 'cover');
        }}
        className={`w-full h-full object-contain ${className}`}
      />
    );
  }
  return (
    <span className={`w-full h-full flex flex-col items-center justify-center gap-1.5 p-2 text-center bg-gradient-to-b from-slate-800 to-slate-900 ${className}`}>
      <Gamepad2 className={compact ? 'w-4 h-4 text-slate-600' : 'w-6 h-6 text-slate-600'} />
      {!compact && <span className="text-[11px] leading-tight font-medium text-slate-400 line-clamp-3">{title}</span>}
    </span>
  );
};

// Moldura das capas: mesma proporção, borda e brilho em todas as telas
export const coverFrame = 'relative block w-full aspect-[2/3] overflow-hidden rounded-md bg-slate-900 border border-slate-800 shadow-md shadow-black/20 transition duration-150';

interface CoverCardProps {
  title: string;
  coverUrl?: string;
  gameId?: string;                  // Jogo da biblioteca: o X do controle favorita o jogo focado
  onOpen: () => void;
  badge?: React.ReactNode;          // Selo no canto da capa (posição na lista, status)
  meta?: React.ReactNode;           // Linha embaixo do nome
  navStart?: boolean;
  highlight?: boolean;              // Borda de destaque
}

// Capa clicável com nome e detalhes embaixo, como nas prateleiras do Diário.
// data-game-id + data-cover: o anel do controle fica em volta da capa (styles/index.css), e o X favorita o jogo focado.
export const CoverCard: React.FC<CoverCardProps> = ({ title, coverUrl, gameId, onOpen, badge, meta, navStart, highlight }) => (
  <button
    type="button"
    onClick={onOpen}
    title={title}
    data-game-id={gameId}
    data-nav-start={navStart ? '' : undefined}
    className={`group min-w-0 text-left rounded-md ${focusRing}`}
  >
    <span data-cover className={`${coverFrame} ${highlight ? 'border-indigo-400/70' : 'group-hover:border-slate-500'} group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-black/40`}>
      <GameCover src={coverUrl} title={title} gameId={gameId} />
      {badge}
    </span>
    <span data-cover-title className="block mt-2 text-[13px] leading-tight text-slate-100 truncate group-hover:text-white">{title}</span>
    {meta && <span className="mt-1 flex items-center justify-between gap-2 min-h-4 text-[11px] text-slate-500">{meta}</span>}
  </button>
);
