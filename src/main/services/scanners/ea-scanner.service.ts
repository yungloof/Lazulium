import { existsSync, readdirSync } from 'fs';
import { join, normalize, basename } from 'path';
import { listRegistrySubkeys, readRegistryKeyValues, readRegistryValue, readUninstallEntries } from './registry';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

const EA_REGISTRY_KEYS = [
  'HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts\\EA Games',
  'HKLM\\SOFTWARE\\Electronic Arts\\EA Games',
  'HKLM\\SOFTWARE\\WOW6432Node\\EA Games',
  'HKLM\\SOFTWARE\\EA Games'
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

  const candidateDirs = [installDir, join(installDir, 'bin'), join(installDir, 'Game')];
  for (const dir of candidateDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile()) continue;
        const name = f.name.toLowerCase();
        if (name.endsWith('.exe') && !name.includes('crash') && !name.includes('update') && !name.includes('setup') && !name.includes('unins') && !name.includes('installer') && !name.includes('activation')) {
          return normalize(join(dir, f.name));
        }
      }
    } catch {}
  }
  return '';
}

export const eaScanner: PlatformScanner = {
  platform: 'ea',

  async scan(): Promise<PlatformScanResult> {
    const games = new Map<string, DetectedGame>();
    const warnings: string[] = [];

    // 1. Varredura via chaves diretas da Electronic Arts no registro
    for (const root of EA_REGISTRY_KEYS) {
      try {
        const subkeys = await listRegistrySubkeys(root);
        for (const subkey of subkeys) {
          try {
            const rawName = subkey.split('\\').pop() || '';
            const values = await readRegistryKeyValues(subkey);
            const installDir = values['install dir'] || values['installdir'] || values['installpath'] || values['path'];
            if (!installDir || !existsSync(installDir)) continue;

            const normDir = normalize(installDir);
            const title = cleanTitle(values.displayname || rawName);
            const id = `ea-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

            if (!games.has(id)) {
              const exe = findMainExecutable(normDir);
              games.set(id, {
                id,
                title,
                platform: 'ea',
                platformGameId: rawName,
                executablePath: exe || normDir,
                workingDirectory: normDir,
                installPath: normDir,
                opensViaLauncher: true,
                media: {}
              });
            }
          } catch {}
        }
      } catch {}
    }

    // 2. Varredura via Registro de Desinstalação do Windows
    try {
      const uninstallEntries = await readUninstallEntries();
      for (const [subkey, values] of uninstallEntries) {
        try {
          const pub = (values.publisher || '').toLowerCase();
          const unins = (values.uninstallstring || '').toLowerCase();
          const disp = (values.displayname || '').trim();

          const isEA =
            pub.includes('electronic arts') ||
            pub.includes('ea games') ||
            pub.includes('ea swiss sarl') ||
            pub.includes('bioware') ||
            unins.includes('eadesktop') ||
            unins.includes('originuninstall') ||
            /[\\/]origin(?:\.exe|[\\/]|")/.test(unins);
          if (!isEA) continue;

          // Pula os inicializadores
          if (!disp || /^(?:ea\s*app|origin|ea\s*desktop|electronic\s*arts)$/i.test(disp)) continue;

          const installLocation = values.installlocation ? normalize(values.installlocation) : '';
          if (!installLocation || !existsSync(installLocation)) continue;

          const title = cleanTitle(disp);
          const id = `ea-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

          if (!games.has(id)) {
            const exe = findMainExecutable(installLocation, values.displayicon);
            games.set(id, {
              id,
              title,
              platform: 'ea',
              platformGameId: subkey.split('\\').pop() || title,
              executablePath: exe || installLocation,
              workingDirectory: installLocation,
              installPath: installLocation,
              opensViaLauncher: true,
              media: {}
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[Scanner:EA] Falha ao consultar chaves de desinstalação:', (err as Error).message);
    }

    console.log(games.size === 0 ? '[Scanner:EA] Nenhum jogo do EA App encontrado' : `[Scanner:EA] ${games.size} jogos`);
    return { games: [...games.values()], warnings };
  }
};
