import React, { useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import { Download, Loader2, Play, Square } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { formatElapsed } from '../utils/format';
import { stopGame } from '../utils/gameActions';
import { focusRing } from './ui';

interface PlayButtonProps {
  game: Game;
  onLaunch: (game: Game) => void;
  size?: 'md' | 'lg';
}

const SIZES = {
  md: 'h-10 px-6 text-sm gap-2',
  lg: 'h-11 px-7 text-[15px] gap-2.5'
};

// Botão principal da página do jogo: Jogar, Iniciando, Parar (com cronômetro) ou Instalar
export const PlayButton: React.FC<PlayButtonProps> = ({ game, onLaunch, size = 'md' }) => {
  const status = useLibraryStore((s) => s.launchStatuses[game.id]);
  const [now, setNow] = useState(Date.now());
  const base = `flex items-center justify-center rounded-lg font-bold tracking-wide transition-[background-color,box-shadow,transform] active:scale-[0.98] ${SIZES[size]} ${focusRing}`;

  // Cronômetro da sessão atual (só tica enquanto o jogo está rodando)
  useEffect(() => {
    if (status?.state !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status?.state]);

  if (status?.state === 'launching') {
    return (
      <button disabled aria-live="polite" className={`${base} bg-slate-700 text-slate-200 cursor-wait`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>INICIANDO...</span>
      </button>
    );
  }

  if (status?.state === 'running') {
    const startedAt = status.startTime ? new Date(status.startTime).getTime() : now;
    return (
      <div className="flex items-center gap-3">
        <button data-nav-start onClick={() => stopGame(game)} className={`${base} bg-red-600/90 hover:bg-red-500 text-white`}>
          <Square className="w-4 h-4 fill-current" />
          <span>PARAR</span>
        </button>
        <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-300 tabular-nums">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Jogando · {formatElapsed(now - startedAt)}
        </span>
      </div>
    );
  }

  if (game.manualEntry) return null;

  // Desinstalado: a Steam reinstala em um clique; nas outras plataformas só avisa
  if (game.isInstalled === false) {
    if (game.platform === 'steam') {
      return (
        <button data-nav-start onClick={() => onLaunch(game)} className={`${base} bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/50`}>
          <Download className="w-4 h-4" />
          <span>INSTALAR</span>
        </button>
      );
    }
    return <span className={`${base} bg-slate-800 text-slate-400 cursor-default`}>NÃO INSTALADO</span>;
  }

  return (
    <button
      data-nav-start
      onClick={() => onLaunch(game)}
      className={`${base} bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-950/40 hover:shadow-emerald-500/20`}
    >
      <Play className="w-4 h-4 fill-current" />
      <span>JOGAR</span>
    </button>
  );
};
