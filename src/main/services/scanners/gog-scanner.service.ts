import { normalize } from 'path';
import { listRegistrySubkeys, readRegistryKeyValues } from './registry';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

const GOG_REGISTRY_KEYS = [
  'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games',
  'HKLM\\SOFTWARE\\GOG.com\\Games'
];

export const gogScanner: PlatformScanner = {
  platform: 'gog',

  async scan(): Promise<PlatformScanResult> {
    const warnings: string[] = [];
    const games = new Map<string, DetectedGame>();

    for (const rootKey of GOG_REGISTRY_KEYS) {
      try {
        const subkeys = await listRegistrySubkeys(rootKey);
        for (const subkey of subkeys) {
          try {
            const values = await readRegistryKeyValues(subkey);

            // Extrai o ID do jogo da chave ou do valor 'gameid' / 'productid'
            const subkeyBasename = subkey.split('\\').pop() ?? '';
            const gameId = values['gameid'] || values['productid'] || subkeyBasename;
            const gameName = values['gamename'];

            if (!gameId || !gameName) {
              continue;
            }

            const id = `gog-${gameId}`;
            if (games.has(id)) continue;

            const exe = values['exe'];
            const path = values['path'];
            const workingDir = values['workingdir'];
            const launchParam = values['launchparam'];

            const installPath = path ? normalize(path) : undefined;
            const executablePath = exe ? normalize(exe) : '';
            const workingDirectory = workingDir ? normalize(workingDir) : installPath;

            games.set(id, {
              id,
              title: gameName,
              platform: 'gog',
              platformGameId: gameId,
              executablePath,
              launchArguments: launchParam?.trim() || undefined,
              launchUri: `goggalaxy://openGameView/${gameId}`,
              workingDirectory,
              installPath
            });
          } catch (err) {
            warnings.push(`GOG: falha ao ler subchave ${subkey} (${(err as Error).message})`);
          }
        }
      } catch (err) {
        warnings.push(`GOG: falha ao consultar registro em ${rootKey} (${(err as Error).message})`);
      }
    }

    if (games.size === 0) {
      console.log('[Scanner:GOG] Nenhum jogo instalado pelo GOG encontrado');
    } else {
      console.log(`[Scanner:GOG] ${games.size} jogos`);
    }

    return { games: [...games.values()], warnings };
  }
};
