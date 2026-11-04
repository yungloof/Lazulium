import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Gamepad2, Play, Search } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';

interface QuickSearchProps {
  onOpenGame: (game: Game) => void;
  onLaunchGame: (game: Game) => void;
  onClose: () => void;
}

const MAX_RESULTS = 8;

// Ordem: começo do nome, depois qualquer parte, e as iniciais ("totk", "gta") por último
function matchScore(title: string, query: string): number {
  const lower = title.toLowerCase();
  if (lower.startsWith(query)) return 0;
  if (lower.includes(query)) return 1;
  const initials = lower.split(/[\s:\-_]+/).filter(Boolean).map((w) => w[0]).join('');
  return initials.includes(query) ? 2 : -1;
}

// Ctrl+K: abrir ou iniciar qualquer jogo sem sair do que está fazendo
export const QuickSearch: React.FC<QuickSearchProps> = ({ onOpenGame, onLaunchGame, onClose }) => {
  const games = useLibraryStore((s) => s.games);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = games.filter((g) => !g.isHidden && !g.manualEntry);
    const byInstalled = (a: Game, b: Game) => Number(b.isInstalled !== false) - Number(a.isInstalled !== false);
    if (!q) {
      return visible
        .filter((g) => g.isInstalled !== false && g.lastPlayedAt)
        .sort((a, b) => b.lastPlayedAt!.localeCompare(a.lastPlayedAt!))
        .slice(0, MAX_RESULTS);
    }
    return visible
      .map((game) => ({ game, score: matchScore(game.title, q) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || byInstalled(a.game, b.game) || (b.game.totalPlaytimeSeconds ?? 0) - (a.game.totalPlaytimeSeconds ?? 0))
      .slice(0, MAX_RESULTS)
      .map((r) => r.game);
  }, [games, query]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const act = (game: Game | undefined, play: boolean) => {
    if (!game) return;
    onClose();
    if (play) onLaunchGame(game);
    else onOpenGame(game);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      act(results[selected], e.ctrlKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-xl rounded-lg bg-steam-panel border border-slate-700 shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="relative border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar jogo: nome ou iniciais (totk)"
            spellCheck={false}
            className="w-full pl-11 pr-4 py-3.5 text-[15px] bg-transparent text-white placeholder-slate-500 focus:outline-none"
          />
        </div>
        <ul ref={listRef} className="max-h-96 overflow-y-auto p-1.5">
          {!query.trim() && results.length > 0 && <li className="px-3 py-1 text-[11px] text-slate-500">Jogados por último</li>}
          {results.map((game, index) => (
            <li key={game.id} onMouseEnter={() => setSelected(index)}>
              <div className={`flex items-center gap-1 rounded-lg ${index === selected ? 'bg-slate-800' : ''}`}>
                <button onClick={() => act(game, false)} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2 text-left focus:outline-none">
                  <span className="w-7 aspect-[2/3] flex-shrink-0 flex items-center justify-center overflow-hidden bg-slate-800">
                    {game.media?.coverUrl ? <img src={game.media.coverUrl} alt="" loading="lazy" className="w-full h-full object-contain" /> : <Gamepad2 className="w-3.5 h-3.5 text-slate-600" />}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-slate-100 truncate">{game.title}</span>
                  {game.isInstalled === false && <span className="text-[11px] text-slate-500 flex-shrink-0">não instalado</span>}
                </button>
                {game.isInstalled !== false && (
                  <button onClick={() => act(game, true)} aria-label={`Jogar ${game.title}`} title="Jogar" className="mr-1.5 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-400">Nenhum jogo com esse nome.</li>}
        </ul>
        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-800 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> abrir</span>
          <span>Ctrl + Enter jogar</span>
          <span>Esc fechar</span>
        </div>
      </div>
    </div>
  );
};
