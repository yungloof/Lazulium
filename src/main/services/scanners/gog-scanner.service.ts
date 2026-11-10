import { normalize } from 'path';
import { readRegistrySubkeyValues } from './registry';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

const GOG_REGISTRY_KEYS = ['HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', 'HKLM\\SOFTWARE\\GOG.com\\Games'];

// Cada jogo instalado pelo GOG (Galaxy ou instalador avulso) tem uma subchave com nome, pasta e executável
function registryToGame(subkey: string, values: Record<string, string>): DetectedGame | null {
  const gameId = values['gameid'] || values['productid'] || subkey.split('\\').pop() || '';
  const gameName = values['gamename'];
  if (!gameId || !gameName) return null;

  const installPath = values['path'] ? normalize(values['path']) : undefined;
  return {
    id: `gog-${gameId}`,
    title: gameName,
    platform: 'gog',
    platformGameId: gameId,
    executablePath: values['exe'] ? normalize(values['exe']) : '',
    launchArguments: values['launchparam']?.trim() || undefined,
    launchUri: `goggalaxy://openGameView/${gameId}`,
    workingDirectory: values['workingdir'] ? normalize(values['workingdir']) : installPath,
    installPath
  };
}

export const gogScanner: PlatformScanner = {
  platform: 'gog',

  async scan(): Promise<PlatformScanResult> {
    const warnings: string[] = [];
    const games = new Map<string, DetectedGame>();

    for (const rootKey of GOG_REGISTRY_KEYS) {
      for (const [subkey, values] of await readRegistrySubkeyValues(rootKey)) {
        try {
          const game = registryToGame(subkey, values);
          if (game && !games.has(game.id)) games.set(game.id, game);
        } catch (err) {
          warnings.push(`GOG: não consegui ler um jogo do registro (${subkey.split('\\').pop()}).`);
          console.warn(`[Scanner:GOG] ${subkey}:`, (err as Error).message);
        }
      }
    }

    console.log(games.size === 0 ? '[Scanner:GOG] Nenhum jogo instalado pelo GOG encontrado' : `[Scanner:GOG] ${games.size} jogos`);
    return { games: [...games.values()], warnings };
  }
};
