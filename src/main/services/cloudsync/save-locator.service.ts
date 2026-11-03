import { app } from 'electron';
import { existsSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { basename, dirname, extname, join, normalize, relative, resolve, sep } from 'path';
import { Game } from '@shared/types/game';
import { SaveLocation, SaveLocationSuggestion } from '@shared/types/cloudsync';
import { db } from '../../database/db';
import { findSteamPath } from '../scanners/steam-scanner.service';

export interface SaveFile {
  absPath: string;
  relPath: string;                  // Relativo à pasta da SaveLocation, sempre com '/'
  size: number;
  mtimeMs: number;
}

const PREFIX_MAX_DEPTH = 2;         // RetroArch pode separar saves em subpastas por core
const HEURISTIC_MIN_KEY_LENGTH = 4;
export const MAX_SAVE_FILES = 20_000;
export const MAX_SAVE_BYTES = 1024 * 1024 * 1024;

export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

// Arquivos da pasta (recursivo). Com filePrefix: só arquivos com esse nome, até PREFIX_MAX_DEPTH níveis.
export async function collectSaveFiles(location: SaveLocation): Promise<SaveFile[]> {
  const root = resolve(location.path);
  const prefix = location.filePrefix?.toLowerCase();
  const files: SaveFile[] = [];

  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_SAVE_FILES) return;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!prefix || depth < PREFIX_MAX_DEPTH) await walk(abs, depth + 1);
      } else if (entry.isFile() && (!prefix || entry.name.toLowerCase().startsWith(prefix))) {
        const info = await stat(abs).catch(() => null);
        if (!info) continue;
        files.push({ absPath: abs, relPath: relative(root, abs).split(sep).join('/'), size: info.size, mtimeMs: info.mtimeMs });
      }
    }
  };

  await walk(root, 0);
  return files;
}

async function toSuggestion(
  location: SaveLocation,
  meta: Pick<SaveLocationSuggestion, 'source' | 'confidence' | 'label'>
): Promise<SaveLocationSuggestion | null> {
  if (!existsSync(location.path)) return null;
  const files = await collectSaveFiles(location);
  if (files.length === 0) return null;
  return { ...location, ...meta, fileCount: files.length, sizeBytes: files.reduce((sum, f) => sum + f.size, 0) };
}

// Steam Cloud local: <Steam>/userdata/<conta>/<appid>/remote
async function detectSteamCloud(game: Game): Promise<SaveLocationSuggestion[]> {
  if (game.platform !== 'steam' || !game.platformGameId) return [];
  const steamPath = await findSteamPath();
  if (!steamPath) return [];

  const results: SaveLocationSuggestion[] = [];
  for (const account of await listDirs(join(steamPath, 'userdata'))) {
    if (!/^\d+$/.test(account)) continue;
    const suggestion = await toSuggestion(
      { path: join(steamPath, 'userdata', account, game.platformGameId, 'remote') },
      { source: 'steam-cloud', confidence: 'high', label: `Steam Cloud (conta ${account})` }
    );
    if (suggestion) results.push(suggestion);
  }
  return results;
}

function heuristicBases(): { dir: string; label: string }[] {
  const documents = app.getPath('documents');
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return [
    { dir: documents, label: 'Documentos' },
    { dir: join(documents, 'My Games'), label: 'Documentos\\My Games' },
    { dir: join(homedir(), 'Saved Games'), label: 'Jogos Salvos' },
    { dir: app.getPath('appData'), label: 'AppData\\Roaming' },
    { dir: localAppData, label: 'AppData\\Local' },
    { dir: join(dirname(localAppData), 'LocalLow'), label: 'AppData\\LocalLow' }
  ];
}

// Pastas com o nome do jogo (ou da pasta de instalação) em locais comuns de save,
// direto na base ou um nível abaixo (pasta da publicadora).
async function detectByName(game: Game): Promise<SaveLocationSuggestion[]> {
  const keys = new Set(
    [game.title, game.installPath ? basename(game.installPath) : '']
      .map(normalizeKey)
      .filter((k) => k.length >= HEURISTIC_MIN_KEY_LENGTH)
  );
  if (keys.size === 0) return [];

  const ownData = normalize(app.getPath('userData')).toLowerCase();
  const matches = new Map<string, string>();
  for (const base of heuristicBases()) {
    for (const child of await listDirs(base.dir)) {
      const childPath = join(base.dir, child);
      if (keys.has(normalizeKey(child))) matches.set(childPath, `${base.label}\\${child}`);
      for (const grandChild of await listDirs(childPath)) {
        if (keys.has(normalizeKey(grandChild))) {
          matches.set(join(childPath, grandChild), `${base.label}\\${child}\\${grandChild}`);
        }
      }
    }
  }

  const results: SaveLocationSuggestion[] = [];
  for (const [path, label] of matches) {
    if (normalize(path).toLowerCase().startsWith(ownData)) continue;
    const suggestion = await toSuggestion({ path }, { source: 'heuristic', confidence: 'medium', label });
    if (suggestion) results.push(suggestion);
  }
  return results;
}

// Lê `chave = "valor"` do retroarch.cfg; ':' no início significa a pasta do executável
async function readRetroArchDir(exeDir: string, key: string, fallback: string): Promise<string> {
  try {
    const cfg = await readFile(join(exeDir, 'retroarch.cfg'), 'utf-8');
    const value = cfg.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];
    if (value && value !== 'default') {
      return value.startsWith(':') ? join(exeDir, value.slice(1)) : value;
    }
  } catch {
    // Sem retroarch.cfg: usa o padrão
  }
  return join(exeDir, fallback);
}

async function detectEmulator(game: Game): Promise<SaveLocationSuggestion[]> {
  if (game.platform !== 'emulator' || !game.emulatorId) return [];
  const config = db.getEmulatorConfigs().find((c) => c.emulatorId === game.emulatorId);
  const exePath = config?.executablePath || game.executablePath;
  const exeDir = exePath ? dirname(exePath) : '';
  const documents = app.getPath('documents');
  const appData = app.getPath('appData');
  const romBase = game.romPath ? basename(game.romPath, extname(game.romPath)) : '';

  const candidates: { location: SaveLocation; label: string; high?: boolean }[] = [];
  const add = (path: string, label: string, filePrefix?: string, high = false) =>
    candidates.push({ location: { path, filePrefix }, label, high });

  switch (game.emulatorId) {
    case 'retroarch':
      if (exeDir && romBase) {
        add(await readRetroArchDir(exeDir, 'savefile_directory', 'saves'), `RetroArch saves (${romBase})`, romBase, true);
        add(await readRetroArchDir(exeDir, 'savestate_directory', 'states'), `RetroArch states (${romBase})`, romBase, true);
      }
      break;
    case 'pcsx2':
      if (exeDir) add(join(exeDir, 'memcards'), 'PCSX2 memcards (portátil)');
      add(join(documents, 'PCSX2', 'memcards'), 'PCSX2 memcards');
      break;
    case 'duckstation':
      if (exeDir) add(join(exeDir, 'memcards'), 'DuckStation memcards (portátil)');
      add(join(documents, 'DuckStation', 'memcards'), 'DuckStation memcards');
      break;
    case 'dolphin':
      if (exeDir) {
        add(join(exeDir, 'User', 'GC'), 'Dolphin GameCube (portátil)');
        add(join(exeDir, 'User', 'Wii', 'title'), 'Dolphin Wii (portátil)');
      }
      add(join(documents, 'Dolphin Emulator', 'GC'), 'Dolphin GameCube');
      add(join(documents, 'Dolphin Emulator', 'Wii', 'title'), 'Dolphin Wii');
      add(join(appData, 'Dolphin Emulator', 'GC'), 'Dolphin GameCube');
      add(join(appData, 'Dolphin Emulator', 'Wii', 'title'), 'Dolphin Wii');
      break;
    case 'ryujinx':
      if (exeDir) add(join(exeDir, 'portable', 'bis', 'user', 'save'), 'Ryujinx saves (portátil)');
      add(join(appData, 'Ryujinx', 'bis', 'user', 'save'), 'Ryujinx saves');
      break;
    case 'cemu':
      if (exeDir) add(join(exeDir, 'mlc01', 'usr', 'save'), 'Cemu saves');
      break;
    case 'rpcs3':
      if (exeDir) add(join(exeDir, 'dev_hdd0', 'home', '00000001', 'savedata'), 'RPCS3 savedata');
      break;
    case 'eden':
      if (exeDir) add(join(exeDir, 'user', 'nand', 'user', 'save'), 'Eden saves (portátil)');
      for (const name of ['eden', 'yuzu', 'suyu', 'citron', 'sudachi']) add(join(appData, name, 'nand', 'user', 'save'), `${name} saves`);
      break;
    case 'azahar':
      if (exeDir) add(join(exeDir, 'user', 'sdmc'), 'Azahar saves (portátil)');
      for (const name of ['Azahar', 'Lime3DS', 'Citra']) add(join(appData, name, 'sdmc'), `${name} saves`);
      break;
    case 'mgba':
    case 'melonds':
      // Gravam o .sav ao lado da ROM
      if (game.romPath && romBase) add(dirname(game.romPath), `Save ao lado da ROM (${romBase})`, `${romBase}.sav`, true);
      break;
    case 'bizhawk':
      // <BizHawk>/<sistema>/SaveRAM/<ROM>.SaveRAM
      if (exeDir && romBase) {
        for (const system of await listDirs(exeDir)) {
          add(join(exeDir, system, 'SaveRAM'), `BizHawk SaveRAM (${romBase})`, romBase, true);
        }
      }
      break;
  }

  const results: SaveLocationSuggestion[] = [];
  for (const c of candidates) {
    const suggestion = await toSuggestion(c.location, {
      source: 'emulator',
      confidence: c.high ? 'high' : 'medium',
      label: c.label
    });
    if (suggestion) results.push(suggestion);
  }
  return results;
}

function locationKey(location: SaveLocation): string {
  return `${normalize(location.path).toLowerCase()}|${location.filePrefix?.toLowerCase() ?? ''}`;
}

// Cada detector roda isolado: falha em um não impede os outros
export async function detectSaveLocations(game: Game): Promise<SaveLocationSuggestion[]> {
  const detectors = [detectSteamCloud, detectEmulator, detectByName];
  const seen = new Set<string>();
  const results: SaveLocationSuggestion[] = [];
  for (const detect of detectors) {
    try {
      for (const suggestion of await detect(game)) {
        const key = locationKey(suggestion);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(suggestion);
      }
    } catch (err) {
      console.warn(`[SaveLocator] ${game.title}: ${(err as Error).message}`);
    }
  }
  return results;
}

export function sameLocation(a: SaveLocation, b: SaveLocation): boolean {
  return locationKey(a) === locationKey(b);
}
