import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { DEFAULT_EMULATOR_PROFILES } from '@shared/constants/emulators';
import { EmulatorConfig, EmulatorProfile, Game, GamePlatform } from '@shared/types/game';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';
import { normalizeKey } from '../cloudsync/save-locator.service';

const MAX_DEPTH = 5;
const GENERIC_ROM_NAMES = /^(game|rom|main|image|default|disc\s*\d*)$/i;

// Extensões que, sozinhas, geram ruído (ex: centenas de .nca dentro de um dump)
const NOISY_EXTENSIONS: Partial<Record<EmulatorConfig['emulatorId'], string[]>> = {
  ryujinx: ['.nca']
};

// Switch: atualização e DLC em .nsp não são jogos (o ID de atualização termina em 800)
const SWITCH_EMULATORS = ['ryujinx', 'eden'];
const SWITCH_ADDON = /(^|[^a-z])(update|upd|dlc|patch)([^a-z]|$)|\[0100[0-9a-f]{9}800\]/i;
// Mesmo jogo com outro nome de lançamento: "Skyward Sword" e "Skyward Sword HD"
const SAME_GAME_SUFFIX = /^(hd|dx|remaster(ed)?|definitive|deluxe|edition|complete)*$/;
const MIN_TITLE_KEY_LENGTH = 10;

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
    .replace(/[\s+\-]+$/, '')
    .trim();
  return cleaned;
}

interface SfoInfo {
  title?: string;
  category?: string;
  titleId?: string;
}

// Leitor de SFO (Sony Format Optimizer) do PS3: extrai título, categoria e ID do PARAM.SFO
function readSfoInfo(ebootPath: string): SfoInfo | null {
  const dir = dirname(ebootPath);
  const candidates = [
    join(dirname(dir), 'PARAM.SFO'),
    join(dirname(dirname(dir)), 'PARAM.SFO'),
    join(dirname(dir), 'param.sfo')
  ];
  for (const sfoPath of candidates) {
    if (!existsSync(sfoPath)) continue;
    try {
      const buf = readFileSync(sfoPath);
      if (buf.toString('ascii', 0, 4) !== '\0PSF') continue;
      const keyTableStart = buf.readUInt32LE(0x08);
      const dataTableStart = buf.readUInt32LE(0x0c);
      const numEntries = buf.readUInt32LE(0x10);
      const result: SfoInfo = {};
      for (let i = 0; i < numEntries; i++) {
        const entryOffset = 0x14 + i * 16;
        const keyOffset = keyTableStart + buf.readUInt16LE(entryOffset);
        const dataLen = buf.readUInt32LE(entryOffset + 4);
        const dataOffset = dataTableStart + buf.readUInt32LE(entryOffset + 12);
        let keyEnd = keyOffset;
        while (keyEnd < buf.length && buf[keyEnd] !== 0) keyEnd++;
        const key = buf.toString('utf8', keyOffset, keyEnd);
        let valEnd = dataOffset;
        while (valEnd < dataOffset + dataLen && buf[valEnd] !== 0) valEnd++;
        const val = buf.toString('utf8', dataOffset, valEnd).trim();
        if (key === 'TITLE') result.title = val.replace(/[™®]/g, '').trim();
        else if (key === 'CATEGORY') result.category = val;
        else if (key === 'TITLE_ID') result.titleId = val;
      }
      return result;
    } catch {
      // Falha de leitura do SFO não trava o scanner
    }
  }
  return null;
}

function deriveTitle(profile: EmulatorProfile, romPath: string): string {
  // RPCS3: tenta ler o título oficial do PARAM.SFO; se não tiver, usa a pasta do jogo
  if (profile.id === 'rpcs3') {
    const sfo = readSfoInfo(romPath);
    if (sfo?.title) return cleanRomTitle(sfo.title);
    let gameDir = dirname(dirname(romPath));
    if (basename(gameDir).toUpperCase() === 'PS3_GAME') gameDir = dirname(gameDir);
    return cleanRomTitle(basename(gameDir));
  }
  // Cemu (formato descompactado): <JOGO>/code/<arquivo>.rpx
  if (profile.id === 'cemu' && extname(romPath).toLowerCase() === '.rpx') {
    return cleanRomTitle(basename(dirname(dirname(romPath))));
  }
  // Arquivos com nome genérico (ex: <JOGO>/game.iso) herdam o nome da pasta
  // Arquivo só com ID ("[01002DA013484000][v0].xci") sobe até a primeira pasta com nome de verdade
  const title = cleanRomTitle(basename(romPath));
  if (title && !GENERIC_ROM_NAMES.test(title)) return title;
  for (let dir = dirname(romPath); dirname(dir) !== dir; dir = dirname(dir)) {
    const name = cleanRomTitle(basename(dir));
    if (name) return name;
  }
  return basename(romPath);
}

function isRomCandidate(profile: EmulatorProfile, file: string, siblings: Set<string>): boolean {
  const ext = extname(file).toLowerCase();
  if (profile.id === 'rpcs3') {
    if (basename(file).toUpperCase() !== 'EBOOT.BIN') return false;
    const sfo = readSfoInfo(file);
    // GD = Game Data (update / patch de jogo instalado em dev_hdd0/game); não é executável de jogo
    if (sfo?.category === 'GD') return false;
    // Manuais e artbooks digitais não são jogos na biblioteca
    if (sfo?.title && /[-_ ](manual|guide|artbook)(\s*\(.*\))?$/i.test(sfo.title)) return false;
    return true;
  }
  if (!profile.supportedExtensions.includes(ext)) return false;
  if (NOISY_EXTENSIONS[profile.id]?.includes(ext)) return false;
  if (ext === '.nsp' && SWITCH_EMULATORS.includes(profile.id) && SWITCH_ADDON.test(basename(file))) return false;
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

const normalizePath = (path: string) => path.replace(/\//g, '\\').toLowerCase();

function isSameGame(titleKey: string, otherKey: string): boolean {
  if (titleKey === otherKey) return true;
  const [short, long] = titleKey.length < otherKey.length ? [titleKey, otherKey] : [otherKey, titleKey];
  return short.length >= MIN_TITLE_KEY_LENGTH && long.startsWith(short) && SAME_GAME_SUFFIX.test(long.slice(short.length));
}

interface KnownGames {
  launchArguments: string;          // Argumentos dos jogos de outras origens (atalhos da Steam)
  titleKeys: string[];              // Títulos instalados de outras origens
  seenRoms: Set<string>;            // Outro emulador já pegou a mesma ROM
}

async function scanEmulator(config: EmulatorConfig, warnings: string[], known: KnownGames): Promise<DetectedGame[]> {
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
      const key = normalizePath(file);
      if (known.seenRoms.has(key) || known.launchArguments.includes(key)) continue;
      known.seenRoms.add(key);
      const title = deriveTitle(profile, file);
      const titleKey = normalizeKey(title);
      if (known.titleKeys.some((other) => isSameGame(titleKey, other))) continue;
      games.push({
        id: romId(profile.id, file),
        title,
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

export function createEmulatorScanner(getConfigs: () => EmulatorConfig[], getOtherGames: () => Game[], detect: () => Promise<void>): PlatformScanner {
  return {
    platform: 'emulator',

    async scan(): Promise<PlatformScanResult> {
      const warnings: string[] = [];
      const games: DetectedGame[] = [];

      try {
        await detect();
      } catch (err) {
        warnings.push(`Emuladores: a busca automática falhou (${(err as Error).message})`);
      }

      const allOtherGames = getOtherGames().filter((g) => g.isInstalled !== false);
      const officialStores = new Set<GamePlatform>(['steam', 'epic', 'gog']);
      const known: KnownGames = {
        launchArguments: normalizePath(allOtherGames.map((g) => `${g.launchArguments ?? ''} ${g.romPath ?? ''}`).join('\n')),
        titleKeys: allOtherGames
          // Atalho que abre emulador é o mesmo jogo, mesmo com outra ROM (Tears of the Kingdom com e sem update).
          // Port para PC instalado não conta: o jogo no emulador é outra forma de jogar.
          .filter((g) => g.platform === 'emulator' || (officialStores.has(g.platform) && !g.id.startsWith('steam-shortcut-')))
          .map((g) => normalizeKey(g.title))
          .filter(Boolean),
        seenRoms: new Set(allOtherGames.map((g) => (g.romPath ? normalizePath(g.romPath) : '')).filter(Boolean))
      };

      // Cada emulador isolado: um perfil quebrado não derruba os demais
      for (const config of getConfigs().filter((c) => c.enabled)) {
        try {
          games.push(...(await scanEmulator(config, warnings, known)));
        } catch (err) {
          warnings.push(`${config.emulatorId}: ${(err as Error).message}`);
        }
      }
      return { games, warnings };
    }
  };
}
