import { existsSync, readFileSync, statSync } from 'fs';
import { readdir } from 'fs/promises';
import { basename, dirname, join, normalize } from 'path';
import { homedir } from 'os';
import { DEFAULT_EMULATOR_PROFILES } from '@shared/constants/emulators';
import { EmulatorConfig, EmulatorType } from '@shared/types/game';
import { db } from '../../database/db';

const DISK_SEARCH_SETTING = 'emulatorsDiskSearchAt';
const DISK_SEARCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_SEARCH_DEPTH = 3;
const MAX_DIRS_PER_ROOT = 4000;
const SKIP_DIRS = new Set(['steamapps', 'node_modules', 'windows', 'windowsapps', 'common files', 'microsoft', 'windows defender']);
const ROOT_FOLDER_NAMES = ['Emulators', 'Emuladores', 'Emulation', 'Emulacao', 'Games', 'Jogos'];

const appData = () => process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
const documents = () => join(homedir(), 'Documents');

const matches = (text: string, regex: RegExp) => [...text.matchAll(regex)].map((m) => m[1].trim());
const QT_GAME_DIRS = /^Paths\\gamedirs\\\d+\\path=(.+)$/gm;
const QT_SPECIAL_DIRS = /^(SDMC|UserNAND|SysNAND|INSTALLED|SYSTEM)$/i;

interface GameListSource {
  files: (exeDir: string) => string[];   // Portátil primeiro: é o que aquele executável realmente usa
  parse: (text: string) => string[];
}

// Onde cada emulador guarda a própria lista de pastas de jogos. mGBA, melonDS e BizHawk não têm lista.
const GAME_LIST_SOURCES: Partial<Record<EmulatorType, GameListSource>> = {
  dolphin: {
    files: (dir) => [join(dir, 'User/Config/Dolphin.ini'), join(documents(), 'Dolphin Emulator/Config/Dolphin.ini'), join(appData(), 'Dolphin Emulator/Config/Dolphin.ini')],
    parse: (text) => matches(text, /^ISOPath\d+\s*=\s*(.+)$/gm)
  },
  ryujinx: {
    files: (dir) => [join(dir, 'portable/Config.json'), join(appData(), 'Ryujinx/Config.json')],
    parse: (text) => {
      const dirs = (JSON.parse(text.replace(/^﻿/, '')) as { game_dirs?: unknown }).game_dirs;
      return Array.isArray(dirs) ? dirs.filter((d): d is string => typeof d === 'string') : [];
    }
  },
  cemu: {
    files: (dir) => [join(dir, 'settings.xml'), join(appData(), 'Cemu/settings.xml')],
    parse: (text) => matches(/<GamePaths>([\s\S]*?)<\/GamePaths>/.exec(text)?.[1] ?? '', /<Entry>(.*?)<\/Entry>/g).map((d) => d.replace(/&amp;/g, '&'))
  },
  pcsx2: {
    files: (dir) => [join(dir, 'inis/PCSX2.ini'), join(documents(), 'PCSX2/inis/PCSX2.ini')],
    parse: (text) => matches(text, /^(?:Recursive)?Paths\s*=\s*(.+)$/gm)
  },
  duckstation: {
    files: (dir) => [join(dir, 'settings.ini'), join(documents(), 'DuckStation/settings.ini')],
    parse: (text) => matches(text, /^(?:Recursive)?Paths\s*=\s*(.+)$/gm)
  },
  rpcs3: {
    files: (dir) => [join(dir, 'config/games.yml'), join(dir, 'games.yml')],
    parse: (text) => matches(text, /^\S+:\s*"?(.+?)"?\s*$/gm)
  },
  eden: {
    files: (dir) => [join(dir, 'user/config/qt-config.ini'), ...['eden', 'yuzu', 'suyu', 'citron', 'sudachi'].map((n) => join(appData(), n, 'config/qt-config.ini'))],
    parse: (text) => matches(text, QT_GAME_DIRS).filter((d) => !QT_SPECIAL_DIRS.test(d))
  },
  azahar: {
    files: (dir) => [join(dir, 'user/config/qt-config.ini'), ...['Azahar', 'Lime3DS', 'Citra'].map((n) => join(appData(), n, 'config/qt-config.ini'))],
    parse: (text) => matches(text, QT_GAME_DIRS).filter((d) => !QT_SPECIAL_DIRS.test(d))
  },
  ppsspp: {
    files: (dir) => [join(dir, 'memstick/PSP/SYSTEM/ppsspp.ini'), join(documents(), 'PPSSPP/PSP/SYSTEM/ppsspp.ini')],
    parse: (text) => matches(text, /^CurrentDirectory\s*=\s*(.+)$/gm)
  }
};

function isUsableDirectory(path: string): boolean {
  try {
    // A raiz do disco inteiro ficaria lenta demais para varrer
    return dirname(path) !== path && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readGameDirectories(id: EmulatorType, executablePath: string): string[] {
  const source = GAME_LIST_SOURCES[id];
  const file = source?.files(dirname(executablePath)).find((f) => existsSync(f));
  if (!source || !file) return [];
  try {
    const dirs = source.parse(readFileSync(file, 'utf-8')).map((d) => normalize(d).replace(/[\\/]+$/, ''));
    return [...new Set(dirs)].filter(isUsableDirectory);
  } catch (err) {
    console.warn(`[Emuladores] Não foi possível ler ${file}: ${(err as Error).message}`);
    return [];
  }
}

function buildExecutableIndex(): Map<string, EmulatorType> {
  const index = new Map<string, EmulatorType>();
  for (const profile of Object.values(DEFAULT_EMULATOR_PROFILES)) {
    for (const name of profile.defaultExecutableNames) index.set(name.toLowerCase(), profile.id);
  }
  return index;
}

function searchRoots(): string[] {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], join(homedir(), 'AppData/Local/Programs'), join(homedir(), 'scoop/apps')];
  for (let code = 67; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`;
    if (existsSync(drive)) roots.push(...ROOT_FOLDER_NAMES.map((name) => join(drive, name)));
  }
  return roots.filter((r): r is string => !!r && existsSync(r));
}

// Busca só o nome dos arquivos, em profundidade e quantidade limitadas: nunca varre o disco inteiro
async function searchRoot(root: string, index: Map<string, EmulatorType>, found: Map<EmulatorType, string>): Promise<void> {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < MAX_DIRS_PER_ROOT) {
    const { dir, depth } = queue.shift()!;
    visited++;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isFile()) {
        const id = index.get(entry.name.toLowerCase());
        if (id && !found.has(id)) found.set(id, join(dir, entry.name));
      } else if (entry.isDirectory() && depth < MAX_SEARCH_DEPTH && !entry.name.startsWith('.') && !entry.name.startsWith('$') && !SKIP_DIRS.has(entry.name.toLowerCase())) {
        queue.push({ dir: join(dir, entry.name), depth: depth + 1 });
      }
    }
  }
}

async function findExecutables(force: boolean): Promise<Map<EmulatorType, string>> {
  const index = buildExecutableIndex();
  const found = new Map<EmulatorType, string>();

  // Quem já abre um jogo pela biblioteca (atalhos da Steam) é o executável que o usuário de fato usa
  for (const game of db.getGames()) {
    if (!game.executablePath) continue;
    const id = index.get(basename(game.executablePath).toLowerCase());
    if (id && !found.has(id) && existsSync(game.executablePath)) found.set(id, game.executablePath);
  }

  const last = Number(db.getSettings()[DISK_SEARCH_SETTING] ?? 0);
  if (force || Date.now() - last > DISK_SEARCH_INTERVAL_MS) {
    for (const root of searchRoots()) await searchRoot(root, index, found);
    db.setSetting(DISK_SEARCH_SETTING, String(Date.now()));
  }
  return found;
}

// Preenche só o que falta: escolhas feitas à mão e emuladores desativados continuam como estão
export async function detectEmulators(force = false): Promise<void> {
  const found = await findExecutables(force);

  for (const config of db.getEmulatorConfigs()) {
    const profile = DEFAULT_EMULATOR_PROFILES[config.emulatorId];
    if (!profile) continue;
    const next: EmulatorConfig = { ...config };

    const candidate = found.get(config.emulatorId);
    if (candidate && (!config.executablePath || !existsSync(config.executablePath))) {
      next.executablePath = candidate;
      next.autoDetected = true;
      // RetroArch sem core não abre nada: fica desligado até escolherem um
      if (!config.executablePath) next.enabled = !profile.commandTemplate.includes('{core}');
    }

    if (next.executablePath && existsSync(next.executablePath)) {
      const dismissed = new Set(config.dismissedRomDirectories ?? []);
      const added = readGameDirectories(config.emulatorId, next.executablePath).filter((d) => !dismissed.has(d) && !config.romDirectories.includes(d));
      if (added.length > 0) next.romDirectories = [...config.romDirectories, ...added];
    }

    if (JSON.stringify(next) !== JSON.stringify(config)) {
      db.saveEmulatorConfig(next);
      console.log(`[Emuladores] ${profile.name}: ${next.executablePath} (${next.romDirectories.length} pastas de jogos)`);
    }
  }
}
