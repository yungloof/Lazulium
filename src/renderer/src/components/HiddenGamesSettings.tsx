import React, { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Notice } from './ui';
import { SettingsGroup } from './settings/controls';
import { GameCover } from './journal/CoverCard';

export const HiddenGamesSettings: React.FC = () => {
  const games = useLibraryStore((s) => s.games);
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [error, setError] = useState<string | null>(null);
  const hidden = useMemo(() => games.filter((g) => g.isHidden).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), [games]);

  const show = async (id: string) => {
    setError(null);
    try {
      const updated = await window.electronAPI?.updateGame(id, { isHidden: false });
      if (updated) upsertGameLocal(updated);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  return (
    <SettingsGroup title={`Jogos ocultos (${hidden.length})`} description="Horas e registro de quem está oculto continuam guardados.">
      {hidden.length === 0 ? (
        <p className="px-4 py-4 text-xs leading-relaxed text-slate-500">
          Nenhum. Para esconder programas e jogos que não quer ver, clique com o botão direito neles (ou abra o menu ⋯ na página do jogo) e escolha Ocultar.
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto divide-y divide-slate-800/70">
          {hidden.map((game) => (
            <li key={game.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-7 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-sm bg-slate-800">
                <GameCover src={game.media?.coverUrl} title={game.title} compact />
              </span>
              <span className="flex-1 min-w-0 text-sm text-slate-200 truncate">{game.title}</span>
              <Button variant="ghost" icon={<Eye className="w-3.5 h-3.5" />} onClick={() => void show(game.id)}>
                Mostrar
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="px-4 py-2.5">
          <Notice>{error}</Notice>
        </div>
      )}
    </SettingsGroup>
  );
};
