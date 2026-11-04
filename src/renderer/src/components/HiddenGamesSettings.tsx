import React, { useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export const HiddenGamesSettings: React.FC = () => {
  const games = useLibraryStore((s) => s.games);
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const hidden = useMemo(() => games.filter((g) => g.isHidden).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), [games]);

  const show = async (id: string) => {
    const updated = await window.electronAPI?.updateGame(id, { isHidden: false });
    if (updated) upsertGameLocal(updated);
  };

  return (
    <section className="space-y-3 pb-5 border-b border-slate-800/80">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
        <EyeOff className="w-3.5 h-3.5 text-indigo-400" /> Jogos ocultos ({hidden.length})
      </h3>
      {hidden.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhum. Para esconder programas e jogos que não quer ver, clique com o botão direito neles e escolha Ocultar. Horas e registro continuam guardados.</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto space-y-1">
          {hidden.map((game) => (
            <li key={game.id} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-slate-900/60">
              <span className="min-w-0 text-xs text-slate-200 truncate">{game.title}</span>
              <button onClick={() => show(game.id)} className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                <Eye className="w-3 h-3" /> Mostrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
