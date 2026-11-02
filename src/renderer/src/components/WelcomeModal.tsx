import React, { useMemo } from 'react';
import { Gamepad2 } from 'lucide-react';
import { Game, GamePlatform } from '@shared/types/game';
import { AccountsSettings } from './AccountsSettings';

interface WelcomeModalProps {
  games: Game[];
  isScanning: boolean;
  onFinish: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const PLATFORM_LABEL: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG',
  riot: 'Riot',
  xbox: 'Xbox',
  emulator: 'emuladores',
  standalone: 'outros jogos de PC'
};

// Primeira execução: mostra o que foi encontrado e oferece conectar as contas antes de começar
export const WelcomeModal: React.FC<WelcomeModalProps> = ({ games, isScanning, onFinish }) => {
  const summary = useMemo(() => {
    const counts = new Map<GamePlatform, number>();
    for (const g of games) counts.set(g.platform, (counts.get(g.platform) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${n} ${PLATFORM_LABEL[p]}`);
  }, [games]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-md bg-steam-bg border border-black/40 shadow-lg">
        <div className="px-6 pt-6 pb-4 border-b border-black/30">
          <h2 className="flex items-center gap-2.5 text-xl text-white">
            <span className="w-8 h-8 rounded-sm bg-indigo-800 flex items-center justify-center">
              <Gamepad2 className="w-4 h-4 text-indigo-400" />
            </span>
            Bem-vindo ao Lazulium
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {isScanning && games.length === 0
              ? 'Procurando os jogos instalados neste PC...'
              : games.length > 0
                ? `Encontramos ${games.length} jogos neste PC: ${summary.join(', ')}.`
                : 'Nenhum jogo encontrado ainda. Você pode adicionar jogos e pastas a qualquer momento.'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Conecte suas contas para ver conquistas, capas para todos os jogos e backup dos saves na nuvem. Tudo opcional.
          </p>
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          <AccountsSettings />
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-black/30">
          <span className="text-[11px] text-slate-500">Dá para mudar isso depois em Configurações.</span>
          <button
            onClick={onFinish}
            className={`px-6 py-2 rounded-sm bg-gradient-to-r from-[#75b022] to-[#588a1b] hover:from-[#8ed629] hover:to-[#6aa621] text-white text-sm font-semibold ${focusRing}`}
          >
            Começar
          </button>
        </div>
      </div>
    </div>
  );
};
