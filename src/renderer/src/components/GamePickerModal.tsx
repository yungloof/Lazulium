import React, { useMemo, useState } from 'react';
import { Check, Gamepad2, NotebookPen, Search } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Modal, Notice, focusRing, inputClass } from './ui';

interface GamePickerModalProps {
  title: string;
  hint?: string;
  excludeIds?: string[];            // Já escolhidos: aparecem marcados e não respondem
  closeOnPick?: boolean;            // false: continua aberto para escolher vários
  onPick: (game: Game) => void;
  onClose: () => void;
}

const MAX_RESULTS = 60;

// Qualquer jogo do app, instalado ou não; o que não existe pode ser registrado aqui mesmo.
// Abre por cima de outras janelas (camada 70): o Esc fecha só esta.
export const GamePickerModal: React.FC<GamePickerModalProps> = ({ title, hint, excludeIds = [], closeOnPick = true, onPick, onClose }) => {
  const games = useLibraryStore((s) => s.games);
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    <Modal
      title={title}
      subtitle={hint}
      size="md"
      tall
      layer={70}
      onClose={onClose}
      bodyClassName="p-2"
      toolbar={
        <div className="p-3 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jogo" aria-label="Buscar jogo" className={`${inputClass} !py-2 pl-8 text-[13px]`} />
          </div>
          <Notice>{error}</Notice>
        </div>
      }
    >
      <ul className="space-y-0.5">
        {trimmed && !exactMatch && (
          <li>
            <button onClick={registerNew} className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left text-sm text-indigo-200 hover:bg-slate-800 transition-colors ${focusRing}`}>
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
                className={`w-full flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-left hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent transition-colors ${focusRing}`}
              >
                <span className="w-8 aspect-[2/3] flex-shrink-0 rounded bg-slate-800 flex items-center justify-center overflow-hidden">
                  {game.media?.coverUrl ? <img src={game.media.coverUrl} alt="" loading="lazy" className="w-full h-full object-contain" /> : <Gamepad2 className="w-4 h-4 text-slate-500" />}
                </span>
                <span className="flex-1 min-w-0 text-sm text-slate-100 truncate">{game.title}</span>
                {already && <Check className="w-4 h-4 flex-shrink-0 text-indigo-300" />}
              </button>
            </li>
          );
        })}
        {results.length === 0 && !trimmed && <li className="px-3 py-8 text-center text-sm text-slate-400">Nenhum jogo na biblioteca.</li>}
      </ul>
    </Modal>
  );
};
