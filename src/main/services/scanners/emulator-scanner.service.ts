import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { DEFAULT_EMULATOR_PROFILES } from '@shared/constants/emulators';
import { EmulatorConfig, EmulatorProfile } from '@shared/types/game';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

const MAX_DEPTH = 5;
const GENERIC_ROM_NAMES = /^(game|rom|main|image|default|disc\s*\d*)$/i;

// Extensões que, sozinhas, geram ruído (ex: centenas de .nca dentro de um dump)
const NOISY_EXTENSIONS: Partial<Record<EmulatorConfig['emulatorId'], string[]>> = {
  ryujinx: ['.nca']
};

async function walk(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, depth + 1, out);
    else if (entry.isFile()) out.push(full);
  }
}

// "Super Mario Sunshine (USA) [!].rvz" -> "Super Mario Sunshine"
export function cleanRomTitle(fileName: string): string {
  const cleaned = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_.]+/g, ' ')
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || fileName;
}

function deriveTitle(profile: EmulatorProfile, romPath: string): string {
  // RPCS3: <JOGO>/USRDIR/EBOOT.BIN ou <JOGO>/PS3_GAME/USRDIR/EBOOT.BIN
  if (profile.id === 'rpcs3') {
    let gameDir = dirname(dirname(romPath));
    if (basename(gameDir).toUpperCase() === 'PS3_GAME') gameDir = dirname(gameDir);
    return cleanRomTitle(basename(gameDir));
  }
  // Cemu (formato descompactado): <JOGO>/code/<arquivo>.rpx
  if (profile.id === 'cemu' && extname(romPath).toLowerCase() === '.rpx') {
    return cleanRomTitle(basename(dirname(dirname(romPath))));
  }
  // Arquivos com nome genérico (ex: <JOGO>/game.iso) herdam o nome da pasta
  const title = cleanRomTitle(basename(romPath));
  if (GENERIC_ROM_NAMES.test(title)) return cleanRomTitle(basename(dirname(romPath)));
  return title;
}

function isRomCandidate(profile: EmulatorProfile, file: string, siblings: Set<string>): boolean {
  const ext = extname(file).toLowerCase();
  if (profile.id === 'rpcs3') return basename(file).toUpperCase() === 'EBOOT.BIN';
  if (!profile.supportedExtensions.includes(ext)) return false;
  if (NOISY_EXTENSIONS[profile.id]?.includes(ext)) return false;
  // Pares .cue/.bin: só o .cue deve virar entrada
  if (ext === '.bin' && siblings.has(file.slice(0, -4).toLowerCase() + '.cue')) return false;
  return true;
}

function buildArguments(profile: EmulatorProfile, config: EmulatorConfig, romPath: string): string {
  return profile.commandTemplate.replace(/\{rom\}/g, romPath).replace(/\{core\}/g, config.corePath ?? '');
}

function romId(emulatorId: string, romPath: string): string {
  const hash = createHash('sha1').update(romPath.toLowerCase()).digest('hex').slice(0, 12);
  return `emu-${emulatorId}-${hash}`;
}

async function scanEmulator(config: EmulatorConfig, warnings: string[]): Promise<DetectedGame[]> {
  const profile = DEFAULT_EMULATOR_PROFILES[config.emulatorId];
  if (!profile) {
    warnings.push(`Emuladores: perfil desconhecido "${config.emulatorId}"`);
    return [];
  }
  if (!config.executablePath || !existsSync(config.executablePath)) {
    warnings.push(`${profile.name}: executável não configurado ou inexistente.`);
    return [];
  }
  if (profile.commandTemplate.includes('{core}') && !config.corePath) {
    warnings.push(`${profile.name}: defina o core (.dll) para gerar o comando de boot.`);
    return [];
  }

  const games: DetectedGame[] = [];
  for (const romDir of config.romDirectories) {
    if (!existsSync(romDir)) {
      warnings.push(`${profile.name}: pasta de ROMs não encontrada (${romDir})`);
      continue;
    }
    const files: string[] = [];
    await walk(romDir, 0, files);
    const lowerSet = new Set(files.map((f) => f.toLowerCase()));

    for (const file of files) {
      if (!isRomCandidate(profile, file, lowerSet)) continue;
      games.push({
        id: romId(profile.id, file),
        title: deriveTitle(profile, file),
        platform: 'emulator',
        emulatorId: profile.id,
        romPath: file,
        executablePath: config.executablePath,
        launchArguments: buildArguments(profile, config, file),
        workingDirectory: dirname(config.executablePath)
      });
    }
  }

  console.log(`[Scanner:${profile.name}] ${games.length} ROMs`);
  return games;
}

export function createEmulatorScanner(getConfigs: () => EmulatorConfig[]): PlatformScanner {
  return {
    platform: 'emulator',

    async scan(): Promise<PlatformScanResult> {
      const warnings: string[] = [];
      const games: DetectedGame[] = [];

      // Cada emulador isolado: um perfil quebrado não derruba os demais
      for (const config of getConfigs().filter((c) => c.enabled)) {
        try {
          games.push(...(await scanEmulator(config, warnings)));
        } catch (err) {
          warnings.push(`${config.emulatorId}: ${(err as Error).message}`);
        }
      }
      return { games, warnings };
    }
  };
}
