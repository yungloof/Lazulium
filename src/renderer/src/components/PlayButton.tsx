import React, { useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import { Download, Loader2, Play, Square } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';

interface PlayButtonProps {
  game: Game;
  onLaunch: (game: Game) => void;
}

const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export const PlayButton: React.FC<PlayButtonProps> = ({ game, onLaunch }) => {
  const status = useLibraryStore((s) => s.launchStatuses[game.id]);
  const [now, setNow] = useState(Date.now());

  // Cronômetro da sessão atual (só tica enquanto o jogo está rodando)
  useEffect(() => {
    if (status?.state !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status?.state]);

  if (status?.state === 'launching') {
    return (
      <button
        disabled
        className={`flex items-center gap-2 px-6 py-2.5 rounded-md bg-slate-700 text-slate-200 font-bold text-sm cursor-wait ${focusRing}`}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>INICIANDO...</span>
      </button>
    );
  }

  if (status?.state === 'running') {
    const startedAt = status.startTime ? new Date(status.startTime).getTime() : now;
    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Jogando · {formatElapsed(now - startedAt)}
        </span>
        <button
          onClick={() => window.electronAPI?.stopGame(game.id)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-md bg-red-600/90 hover:bg-red-500 text-white font-bold text-sm transition-colors ${focusRing}`}
        >
          <Square className="w-4 h-4 fill-white" />
          <span>PARAR</span>
        </button>
      </div>
    );
  }

  if (game.manualEntry) return null;

  // Desinstalado: a Steam reinstala em um clique; nas outras plataformas só avisa
  if (game.isInstalled === false) {
    if (game.platform === 'steam') {
      return (
        <button
          onClick={() => onLaunch(game)}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm tracking-wide transition-colors ${focusRing}`}
        >
          <Download className="w-4 h-4" />
          <span>INSTALAR</span>
        </button>
      );
    }
    return <span className="px-4 py-2.5 rounded-sm bg-slate-800 text-slate-400 font-semibold text-sm tracking-wide">NÃO INSTALADO</span>;
  }

  return (
    <button
      onClick={() => onLaunch(game)}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-sm bg-gradient-to-r from-[#75b022] to-[#588a1b] hover:from-[#8ed629] hover:to-[#6aa621] text-white font-semibold text-sm tracking-wide transition-colors ${focusRing}`}
    >
      <Play className="w-4 h-4 fill-white" />
      <span>JOGAR</span>
    </button>
  );
};
