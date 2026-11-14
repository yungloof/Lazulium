import { Game } from '../types/game';

// Jogo não instalado que a loja instala em um clique: Steam (steam://install) e Epic (pelo endereço do launcher dela)
export function canInstallFromStore(game: Pick<Game, 'platform' | 'launchUri' | 'isInstalled' | 'manualEntry'>): boolean {
  if (game.isInstalled !== false || game.manualEntry) return false;
  if (game.platform === 'steam') return true;
  return game.platform === 'epic' && !!game.launchUri?.startsWith('com.epicgames.launcher://');
}
