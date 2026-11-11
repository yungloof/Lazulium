import { existsSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, normalize, basename } from 'path';
import { listRegistrySubkeys, readRegistryValue, readUninstallEntries } from './registry';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

const BLIZZARD_REG_KEYS = [
  'HKLM\\SOFTWARE\\WOW6432Node\\Blizzard Entertainment',
  'HKLM\\SOFTWARE\\Blizzard Entertainment'
];

// Mapeamento de UIDs comuns do Battle.net
const BNET_UID_MAP: Record<string, string> = {
  pro: 'Overwatch',
  prometheus: 'Overwatch',
  fenris: 'Diablo IV',
  d3: 'Diablo III',
  anbs: 'Diablo Immortal',
  wow: 'World of Warcraft',
  wow_classic: 'World of Warcraft Classic',
  s2: 'StarCraft II',
  s1: 'StarCraft',
  hero: 'Heroes of the Storm',
  wtcg: 'Hearthstone',
  odin: 'Call of Duty: Modern Warfare',
  viper: 'Call of Duty: Black Ops 4',
  zeus: 'Call of Duty: Black Ops Cold War',
  lazarus: 'Call of Duty: Modern Warfare II',
  fore: 'Call of Duty: Vanguard',
  wlby: 'Crash Bandicoot 4',
  rtro: 'Blizzard Arcade Collection'
};

function cleanTitle(raw: string): string {
  return raw.replace(/\s*(?:x64|x86|\(x64\)|\(x86\))\s*$/i, '').trim();
}

// Procura o executável principal dentro da pasta do jogo
function findMainExecutable(installDir: string, hintIcon?: string): string {
  if (hintIcon) {
    const cleanIcon = hintIcon.replace(/^"|"$/g, '').split(',')[0].trim();
    if (cleanIcon.toLowerCase().endsWith('.exe') && existsSync(cleanIcon)) {
      return normalize(cleanIcon);
    }
  }

  // Verifica na raiz e em subpastas comuns como _retail_, Bin64
  const candidateDirs = [installDir, join(installDir, '_retail_'), join(installDir, 'x64'), join(installDir, 'Bin64')];
  for (const dir of candidateDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile()) continue;
        const name = f.name.toLowerCase();
        if (name.endsWith('.exe') && !name.includes('crash') && !name.includes('update') && !name.includes('setup') && !name.includes('unins')) {
          return normalize(join(dir, f.name));
        }
      }
    } catch {}
  }

  return '';
}

export const battlenetScanner: PlatformScanner = {
  platform: 'battlenet',

  async scan(): Promise<PlatformScanResult> {
    const games = new Map<string, DetectedGame>();
    const warnings: string[] = [];

    // 1. Varredura via Registro de Desinstalação do Windows
    try {
      const uninstallEntries = await readUninstallEntries();
      for (const [subkey, values] of uninstallEntries) {
        try {
          const pub = (values.publisher || '').toLowerCase();
          const unins = (values.uninstallstring || '').toLowerCase();
          const disp = (values.displayname || '').trim();

          const isBlizzard = pub.includes('blizzard') || unins.includes('blizzard uninstaller') || unins.includes('battle.net');
          if (!isBlizzard) continue;

          // Pula o próprio inicializador do Battle.net
          if (/^battle\.net$/i.test(disp) || /^blizzard battle\.net$/i.test(disp)) continue;

          const installLocation = values.installlocation ? normalize(values.installlocation) : '';
          if (!installLocation || !existsSync(installLocation)) continue;

          // Extrai --uid= se presente no desinstalador
          const uidMatch = (values.uninstallstring || '').match(/--uid=([a-zA-Z0-9_.-]+)/i);
          const uid = uidMatch ? uidMatch[1] : undefined;

          const gameId = (uid || subkey.split('\\').pop() || disp).toLowerCase();
          const exe = findMainExecutable(installLocation, values.displayicon);
          const title = cleanTitle(disp || (uid ? BNET_UID_MAP[uid.toLowerCase()] : '') || gameId);

          const id = `bnet-${gameId}`;
          if (!games.has(id)) {
            games.set(id, {
              id,
              title,
              platform: 'battlenet',
              platformGameId: uid || gameId,
              executablePath: exe || installLocation,
              workingDirectory: installLocation,
              installPath: installLocation,
              launchUri: uid ? `battlenet://${uid}` : undefined,
              opensViaLauncher: true,
              media: {}
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[Scanner:BattleNet] Falha ao consultar chaves de desinstalação:', (err as Error).message);
    }

    // 2. Varredura via Battle.net.config em AppData
    const appData = process.env.APPDATA;
    if (appData) {
      const configPath = join(appData, 'Battle.net', 'Battle.net.config');
      if (existsSync(configPath)) {
        try {
          const raw = await readFile(configPath, 'utf8');
          const json = JSON.parse(raw);
          const gamesSection = json.Games || {};

          for (const [key, val] of Object.entries(gamesSection)) {
            if (key === 'battle_net' || key === 'battle.net') continue;
            try {
              const gameObj = val as Record<string, unknown>;
              const client = (gameObj.Client || {}) as Record<string, unknown>;
              const installPath = (client.InstallPath || gameObj.InstallPath || gameObj.Path) as string | undefined;

              if (!installPath || !existsSync(installPath)) continue;
              const normPath = normalize(installPath);
              const uid = ((gameObj.ServerUid as string) || key).toLowerCase();
              const id = `bnet-${uid}`;

              if (!games.has(id)) {
                const title = BNET_UID_MAP[uid] || cleanTitle(basename(normPath));
                const exe = findMainExecutable(normPath);
                games.set(id, {
                  id,
                  title,
                  platform: 'battlenet',
                  platformGameId: uid,
                  executablePath: exe || normPath,
                  workingDirectory: normPath,
                  installPath: normPath,
                  launchUri: `battlenet://${uid}`,
                  opensViaLauncher: true,
                  media: {}
                });
              }
            } catch {}
          }
        } catch (err) {
          console.warn('[Scanner:BattleNet] Falha ao ler Battle.net.config:', (err as Error).message);
        }
      }
    }

    // 3. Varredura via chaves Blizzard Entertainment diretas
    for (const root of BLIZZARD_REG_KEYS) {
      try {
        const subkeys = await listRegistrySubkeys(root);
        for (const sub of subkeys) {
          const name = sub.split('\\').pop() || '';
          if (/^battle\.net$/i.test(name)) continue;
          try {
            const installPath = await readRegistryValue(sub, 'InstallPath');
            if (installPath && existsSync(installPath)) {
              const norm = normalize(installPath);
              const id = `bnet-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
              if (!games.has(id)) {
                const exe = findMainExecutable(norm);
                games.set(id, {
                  id,
                  title: cleanTitle(name),
                  platform: 'battlenet',
                  platformGameId: name,
                  executablePath: exe || norm,
                  workingDirectory: norm,
                  installPath: norm,
                  opensViaLauncher: true,
                  media: {}
                });
              }
            }
          } catch {}
        }
      } catch {}
    }

    console.log(games.size === 0 ? '[Scanner:BattleNet] Nenhum jogo do Battle.net encontrado' : `[Scanner:BattleNet] ${games.size} jogos`);
    return { games: [...games.values()], warnings };
  }
};
