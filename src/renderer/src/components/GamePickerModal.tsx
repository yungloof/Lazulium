import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Gamepad2, NotebookPen, Search, X } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface GamePickerModalProps {
  title: string;
  hint?: string;
  excludeIds?: string[];            // Já escolhidos: aparecem marcados e não respondem
  closeOnPick?: boolean;            // false: continua aberto para escolher vários
  onPick: (game: Game) => void;
  onClose: () => void;
}

const MAX_RESULTS = 60;
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

// Qualquer jogo do app, instalado ou não; o que não existe pode ser registrado aqui mesmo
export const GamePickerModal: React.FC<GamePickerModalProps> = ({ title, hint, excludeIds = [], closeOnPick = true, onPick, onClose }) => {
  const games = useLibraryStore((s) => s.games);
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const trimmed = query.trim();
  const results = useMemo(() => {
    const q = trimmed.toLowerCase();
    return games
      .filter((g) => !g.isHidden && (!q || g.title.toLowerCase().includes(q)))
      .sort((a, b) => (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0) || a.title.localeCompare(b.title, 'pt-BR'))
      .slice(0, MAX_RESULTS);
  }, [games, trimmed]);
  const exactMatch = games.some((g) => g.title.toLowerCase() === trimmed.toLowerCase());

  const pick = (game: Game) => {
    onPick(game);
    if (closeOnPick) onClose();
  };

  const registerNew = async () => {
    setError(null);
    try {
      const game = await window.electronAPI?.addJournalEntry({ title: trimmed, totalPlaytimeSeconds: 0, log: {} });
      if (!game) return;
      upsertGameLocal(game);
      setQuery('');
      pick(game);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="w-full max-w-lg h-[70vh] flex flex-col rounded-lg bg-steam-panel border border-slate-800 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base text-white">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
          </div>
          <button onClick={onClose} aria-label="Fechar" className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-800 flex-shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar jogo"
              className={`w-full pl-8 pr-3 py-2 text-[13px] bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-200 placeholder-slate-500 ${focusRing}`}
            />
          </div>
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </p>
          )}
        </div>

        <ul className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
          {trimmed && !exactMatch && (
            <li>
              <button onClick={registerNew} className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left text-sm text-indigo-200 hover:bg-slate-800 ${focusRing}`}>
                <NotebookPen className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Registrar “{trimmed}” no Diário</span>
              </button>
            </li>
          )}
          {results.map((game) => {
            const already = excludeIds.includes(game.id);
            return (
              <li key={game.id}>
                <button
                  onClick={() => pick(game)}
                  disabled={already}
                  className={`w-full flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-left hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent ${focusRing}`}
                >
                  <span className="w-8 aspect-[2/3] flex-shrink-0 bg-slate-800 flex items-center justify-center overflow-hidden">
                    {game.media?.coverUrl ? <img src={game.media.coverUrl} alt="" loading="lazy" className="w-full h-full object-contain" /> : <Gamepad2 className="w-4 h-4 text-slate-600" />}
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-slate-100 truncate">{game.title}</span>
                  {already && <Check className="w-4 h-4 flex-shrink-0 text-indigo-300" />}
                </button>
              </li>
            );
          })}
          {results.length === 0 && !trimmed && <li className="px-3 py-8 text-center text-sm text-slate-400">Nenhum jogo na biblioteca.</li>}
        </ul>
      </div>
    </div>
  );
};
