import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join, normalize } from 'path';
import { parseVdf, vdfGetObject, vdfGetString, VdfObject } from './vdf-parser';
import { readRegistryValue } from './registry';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

const STEAM_CDN = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps';

// Ferramentas/runtimes que aparecem como "apps" mas não são jogos
const IGNORED_APP_IDS = new Set(['228980', '1070560', '1391110', '1628350', '1493710']);
const IGNORED_NAME_PATTERN = /^(Proton\b|Steam Linux Runtime|Steamworks Common Redistributables)/i;

// StateFlags bit 4 = StateFullyInstalled
const STATE_FULLY_INSTALLED = 4;

export async function findSteamPath(): Promise<string | undefined> {
  const candidates = [
    await readRegistryValue('HKCU\\Software\\Valve\\Steam', 'SteamPath'),
    await readRegistryValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'),
    await readRegistryValue('HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'),
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam'
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, 'steamapps'))) return normalize(candidate);
  }
  return undefined;
}

async function getLibraryFolders(steamPath: string): Promise<string[]> {
  const folders = new Set<string>([normalize(steamPath).toLowerCase()]);
  const result = [normalize(steamPath)];
  const vdfPath = join(steamPath, 'steamapps', 'libraryfolders.vdf');

  if (!existsSync(vdfPath)) return result;

  const root = vdfGetObject(parseVdf(await readFile(vdfPath, 'utf-8')), 'libraryfolders');
  if (!root) return result;

  for (const [key, entry] of Object.entries(root)) {
    if (!/^\d+$/.test(key)) continue;
    // Formato novo: { "path": "D:\\SteamLibrary", ... } | Formato antigo: "D:\\SteamLibrary"
    const path = typeof entry === 'string' ? entry : vdfGetString(entry, 'path');
    if (!path) continue;
    const normalized = normalize(path);
    if (!folders.has(normalized.toLowerCase())) {
      folders.add(normalized.toLowerCase());
      result.push(normalized);
    }
  }

  return result;
}

function manifestToGame(manifest: VdfObject, libraryPath: string, steamExe: string): DetectedGame | null {
  const appState = vdfGetObject(manifest, 'AppState');
  const appId = vdfGetString(appState, 'appid');
  const name = vdfGetString(appState, 'name');
  const installDir = vdfGetString(appState, 'installdir');
  const stateFlags = Number(vdfGetString(appState, 'StateFlags') ?? '0');

  if (!appId || !name) return null;
  if (IGNORED_APP_IDS.has(appId) || IGNORED_NAME_PATTERN.test(name)) return null;
  if ((stateFlags & STATE_FULLY_INSTALLED) === 0) return null;

  const installPath = installDir ? join(libraryPath, 'steamapps', 'common', installDir) : undefined;

  return {
    id: `steam-${appId}`,
    title: name,
    platform: 'steam',
    platformGameId: appId,
    executablePath: steamExe,
    launchArguments: `-applaunch ${appId}`,
    launchUri: `steam://rungameid/${appId}`,
    workingDirectory: installPath,
    installPath,
    media: {
      coverUrl: `${STEAM_CDN}/${appId}/library_600x900.jpg`,
      heroUrl: `${STEAM_CDN}/${appId}/library_hero.jpg`,
      logoUrl: `${STEAM_CDN}/${appId}/logo.png`
    }
  };
}

export const steamScanner: PlatformScanner = {
  platform: 'steam',

  async scan(): Promise<PlatformScanResult> {
    const warnings: string[] = [];
    const steamPath = await findSteamPath();
    if (!steamPath) {
      return { games: [], warnings: ['Steam: instalação não encontrada.'] };
    }

    const steamExe = join(steamPath, 'steam.exe');
    const libraries = await getLibraryFolders(steamPath);
    const games = new Map<string, DetectedGame>();

    for (const library of libraries) {
      const steamapps = join(library, 'steamapps');
      let files: string[];
      try {
        files = await readdir(steamapps);
      } catch {
        warnings.push(`Steam: biblioteca inacessível em ${library}`);
        continue;
      }

      for (const file of files) {
        if (!/^appmanifest_\d+\.acf$/i.test(file)) continue;
        try {
          const manifest = parseVdf(await readFile(join(steamapps, file), 'utf-8'));
          const game = manifestToGame(manifest, library, steamExe);
          if (game) games.set(game.id, game);
        } catch (err) {
          warnings.push(`Steam: falha ao ler ${file} (${(err as Error).message})`);
        }
      }
    }

    console.log(`[Scanner:Steam] ${games.size} jogos em ${libraries.length} biblioteca(s)`);
    return { games: [...games.values()], warnings };
  }
};
