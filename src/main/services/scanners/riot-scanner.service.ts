import { existsSync } from 'fs';
import { normalize } from 'path';
import { listRegistrySubkeys, readRegistryKeyValues } from './registry';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

// Jogos da Riot (League of Legends, Teamfight Tactics, VALORANT...) se registram em
// Uninstall\"Riot Game <produto>.<patchline>", com o Riot Client como desinstalador.
const UNINSTALL_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
];
const RIOT_KEY_PATTERN = /\\Riot Game ([^\\]+)$/i;
const UNINSTALL_PATTERN = /^"([^"]+RiotClientServices\.exe)"\s+--uninstall-product=(\S+)\s+--uninstall-patchline=(\S*)/i;

export const riotScanner: PlatformScanner = {
  platform: 'riot',

  async scan(): Promise<PlatformScanResult> {
    const games = new Map<string, DetectedGame>();
    const warnings: string[] = [];

    for (const root of UNINSTALL_KEYS) {
      for (const key of (await listRegistrySubkeys(root)).filter((k) => RIOT_KEY_PATTERN.test(k))) {
        const values = await readRegistryKeyValues(key);
        const match = values.uninstallstring?.match(UNINSTALL_PATTERN);
        if (!match) continue;
        const [, clientExe, product, patchline] = match;
        // O próprio Riot Client também aparece aqui, mas não é um jogo
        if (/^riot_client$/i.test(product) || !patchline) continue;

        const installPath = values.installlocation ? normalize(values.installlocation) : undefined;
        // Desinstalações da Riot costumam deixar a chave para trás: só ignora (não é um erro do usuário)
        if (!existsSync(clientExe) || (installPath && !existsSync(installPath))) {
          console.log(`[Scanner:Riot] ${values.displayname ?? product}: registro antigo sem pasta, ignorado`);
          continue;
        }

        const id = `riot-${product}-${patchline}`.toLowerCase();
        games.set(id, {
          id,
          title: (values.displayname || product).trim(),
          platform: 'riot',
          platformGameId: `${product}.${patchline}`,
          executablePath: clientExe,
          launchArguments: `--launch-product=${product} --launch-patchline=${patchline}`,
          workingDirectory: installPath,
          installPath,
          opensViaLauncher: true,
          media: {}
        });
      }
    }

    console.log(`[Scanner:Riot] ${games.size} jogo(s)`);
    return { games: [...games.values()], warnings };
  }
};
