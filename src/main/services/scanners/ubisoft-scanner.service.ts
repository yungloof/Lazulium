import { existsSync, readdirSync } from 'fs';
import { join, normalize, basename } from 'path';
import { listRegistrySubkeys, readRegistryKeyValues, readRegistryValue } from './registry';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
];

const UBISOFT_INSTALLS_KEYS = [
  'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs',
  'HKLM\\SOFTWARE\\Ubisoft\\Launcher\\Installs'
];

function cleanTitle(raw: string): string {
  return raw.replace(/\s*(?:™|®|\(TM\)|\(R\))\s*/gi, '').trim();
}

function findMainExecutable(installDir: string, hintIcon?: string): string {
  if (hintIcon) {
    const cleanIcon = hintIcon.replace(/^"|"$/g, '').split(',')[0].trim();
    if (cleanIcon.toLowerCase().endsWith('.exe') && existsSync(cleanIcon)) {
      return normalize(cleanIcon);
    }
  }

  const candidateDirs = [installDir, join(installDir, 'bin'), join(installDir, 'bin64')];
  for (const dir of candidateDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile()) continue;
        const name = f.name.toLowerCase();
        if (name.endsWith('.exe') && !name.includes('crash') && !name.includes('update') && !name.includes('setup') && !name.includes('unins') && !name.includes('uplay') && !name.includes('support')) {
          return normalize(join(dir, f.name));
        }
      }
    } catch {}
  }
  return '';
}

export const ubisoftScanner: PlatformScanner = {
  platform: 'ubisoft',

  async scan(): Promise<PlatformScanResult> {
    const games = new Map<string, DetectedGame>();
    const warnings: string[] = [];

    // Mapeamento id -> nome/icone vindos do registro de desinstalação
    const uninstallInfo = new Map<string, { title: string; exe?: string; installDir?: string }>();

    // 1. Coleta dados de desinstalação
    for (const root of UNINSTALL_KEYS) {
      try {
        const subkeys = await listRegistrySubkeys(root);
        for (const subkey of subkeys) {
          try {
            const keyName = subkey.split('\\').pop() || '';
            const values = await readRegistryKeyValues(subkey);
            const pub = (values.publisher || '').toLowerCase();
            const disp = (values.displayname || '').trim();

            const isUbi = pub.includes('ubisoft') || keyName.startsWith('Uplay Install ') || (values.uninstallstring || '').includes('Ubisoft Game Launcher');
            if (!isUbi) continue;

            // Ignora o launcher do Ubisoft Connect
            if (/^(?:ubisoft connect|uplay)$/i.test(disp)) continue;

            const uplayIdMatch = keyName.match(/Uplay Install (\d+)/i) || (values.uninstallstring || '').match(/-uninstall\s+(\d+)/i);
            const uplayId = uplayIdMatch ? uplayIdMatch[1] : undefined;

            const installLocation = values.installlocation ? normalize(values.installlocation) : '';
            const title = cleanTitle(disp);

            if (uplayId) {
              uninstallInfo.set(uplayId, { title, exe: values.displayicon, installDir: installLocation });
            }

            if (installLocation && existsSync(installLocation)) {
              const id = `ubi-${uplayId || title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
              if (!games.has(id)) {
                const exe = findMainExecutable(installLocation, values.displayicon);
                games.set(id, {
                  id,
                  title,
                  platform: 'ubisoft',
                  platformGameId: uplayId || id,
                  executablePath: exe || installLocation,
                  workingDirectory: installLocation,
                  installPath: installLocation,
                  launchUri: uplayId ? `uplay://launch/${uplayId}/0` : undefined,
                  opensViaLauncher: true,
                  media: {}
                });
              }
            }
          } catch {}
        }
      } catch {}
    }

    // 2. Varredura via chaves Installs da Ubisoft (Launcher\Installs\<id>)
    for (const root of UBISOFT_INSTALLS_KEYS) {
      try {
        const subkeys = await listRegistrySubkeys(root);
        for (const subkey of subkeys) {
          try {
            const uplayId = subkey.split('\\').pop() || '';
            if (!/^\d+$/.test(uplayId)) continue;

            const installDir = await readRegistryValue(subkey, 'InstallDir');
            if (!installDir || !existsSync(installDir)) continue;

            const normDir = normalize(installDir);
            const info = uninstallInfo.get(uplayId);
            const title = info?.title || cleanTitle(basename(normDir));
            const id = `ubi-${uplayId}`;

            if (!games.has(id)) {
              const exe = findMainExecutable(normDir, info?.exe);
              games.set(id, {
                id,
                title,
                platform: 'ubisoft',
                platformGameId: uplayId,
                executablePath: exe || normDir,
                workingDirectory: normDir,
                installPath: normDir,
                launchUri: `uplay://launch/${uplayId}/0`,
                opensViaLauncher: true,
                media: {}
              });
            }
          } catch {}
        }
      } catch {}
    }

    console.log(games.size === 0 ? '[Scanner:Ubisoft] Nenhum jogo do Ubisoft Connect encontrado' : `[Scanner:Ubisoft] ${games.size} jogos`);
    return { games: [...games.values()], warnings };
  }
};
