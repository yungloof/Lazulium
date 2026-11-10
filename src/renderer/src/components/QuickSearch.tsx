import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Gamepad2, Play, Search } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { formatPlaytimeShort } from '../utils/format';
import { platformBadge } from '../utils/platform';
import { launchGame, openGame } from '../utils/gameActions';
import { focusRing } from './ui';

interface QuickSearchProps {
  onOpenGame?: (game: Game) => void;    // Padrão: abre a página do jogo
  onLaunchGame?: (game: Game) => void;  // Padrão: inicia o jogo
  onClose: () => void;
}

const MAX_RESULTS = 8;

// Ordem: começo do nome, depois qualquer parte, e as iniciais ("totk", "gta") por último
function matchScore(title: string, query: string): number {
  const lower = title.toLowerCase();
  if (lower.startsWith(query)) return 0;
  if (lower.includes(query)) return 1;
  const initials = lower
    .split(/[\s:\-_]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
  return initials.includes(query) ? 2 : -1;
}

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-sans text-slate-300">{children}</kbd>
);

// Ctrl+K: abrir ou iniciar qualquer jogo sem sair do que está fazendo
export const QuickSearch: React.FC<QuickSearchProps> = ({ onOpenGame = openGame, onLaunchGame = (g) => void launchGame(g), onClose }) => {
  const games = useLibraryStore((s) => s.games);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Ao fechar, o foco volta para onde estava
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous && previous !== document.body && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

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
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
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
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] bg-black/60 backdrop-blur-[2px] p-6 animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar jogo"
        className="w-full max-w-xl rounded-lg bg-steam-panel border border-slate-700 shadow-2xl shadow-black/60 overflow-hidden animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-slate-800">
          <Search className="w-4 h-4 text-indigo-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar jogo: nome ou iniciais (totk)"
            aria-label="Nome do jogo"
            aria-controls="quick-search-results"
            spellCheck={false}
            className="w-full pl-11 pr-4 py-4 text-[15px] bg-transparent text-white placeholder-slate-500 focus:outline-none"
          />
        </div>
        <ul id="quick-search-results" ref={listRef} role="listbox" aria-label="Resultados" className="max-h-96 overflow-y-auto p-1.5">
          {!query.trim() && results.length > 0 && <li className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Jogados por último</li>}
          {results.map((game, index) => (
            <li key={game.id} data-index={index} role="option" aria-selected={index === selected} onMouseEnter={() => setSelected(index)}>
              <div className={`flex items-center gap-1 rounded-lg transition-colors ${index === selected ? 'bg-indigo-500/15 ring-1 ring-indigo-400/40' : ''}`}>
                <button onClick={() => act(game, false)} className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2 rounded-lg text-left ${focusRing}`}>
                  <span className="w-8 aspect-[2/3] flex-shrink-0 flex items-center justify-center overflow-hidden rounded bg-slate-800">
                    {game.media?.coverUrl ? <img src={game.media.coverUrl} alt="" loading="lazy" className="w-full h-full object-contain" /> : <Gamepad2 className="w-3.5 h-3.5 text-slate-500" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-100 truncate">{game.title}</span>
                    <span className="block text-[11px] text-slate-400 truncate">
                      {platformBadge(game)} · {game.isInstalled === false ? 'não instalado' : formatPlaytimeShort(game.totalPlaytimeSeconds)}
                    </span>
                  </span>
                </button>
                {game.isInstalled !== false && (
                  <button
                    onClick={() => act(game, true)}
                    aria-label={`Jogar ${game.title}`}
                    title="Jogar (Ctrl+Enter)"
                    className={`mr-1.5 p-2 rounded-md text-slate-400 hover:text-emerald-950 hover:bg-emerald-500 transition-colors ${focusRing}`}
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-slate-400">{query.trim() ? 'Nenhum jogo com esse nome.' : 'Digite o nome de um jogo.'}</li>
          )}
        </ul>
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-800 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft className="w-3 h-3 inline" />
            </Kbd>
            abrir
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> jogar
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
};
