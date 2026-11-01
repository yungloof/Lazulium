import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { basename, join, normalize } from 'path';
import { readRegistryValue } from './registry';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

interface EpicManifest {
  DisplayName?: string;
  AppName?: string;
  MainGameAppName?: string;
  InstallLocation?: string;
  LaunchExecutable?: string;
  LaunchCommand?: string;
  CatalogNamespace?: string;
  CatalogItemId?: string;
  AppCategories?: string[];
  bIsIncompleteInstall?: boolean;
}

interface LauncherInstalledEntry {
  InstallLocation?: string;
  NamespaceId?: string;
  ItemId?: string;
  AppName?: string;
}

const programData = process.env['PROGRAMDATA'] || 'C:\\ProgramData';

async function findManifestsDir(): Promise<string | undefined> {
  const appDataPath = await readRegistryValue('HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher', 'AppDataPath');
  const candidates = [
    appDataPath ? join(appDataPath, 'Manifests') : undefined,
    await readRegistryValue('HKCU\\Software\\Epic Games\\EOS', 'ModSdkMetadataDir'),
    join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return normalize(candidate);
  }
  return undefined;
}

function buildLaunchUri(namespace?: string, itemId?: string, appName?: string): string | undefined {
  if (!namespace || !itemId || !appName) return undefined;
  return `com.epicgames.launcher://apps/${namespace}%3A${itemId}%3A${appName}?action=launch&silent=true`;
}

function manifestToGame(manifest: EpicManifest): DetectedGame | null {
  const { AppName, DisplayName, InstallLocation } = manifest;
  if (!AppName || !DisplayName || !InstallLocation) return null;
  if (manifest.bIsIncompleteInstall) return null;
  // DLCs têm MainGameAppName apontando para o jogo base
  if (manifest.MainGameAppName && manifest.MainGameAppName !== AppName) return null;
  if (manifest.AppCategories && !manifest.AppCategories.includes('games')) return null;

  const installPath = normalize(InstallLocation);
  return {
    id: `epic-${AppName}`,
    title: DisplayName,
    platform: 'epic',
    platformGameId: AppName,
    executablePath: manifest.LaunchExecutable ? join(installPath, manifest.LaunchExecutable) : '',
    launchArguments: manifest.LaunchCommand?.trim() || undefined,
    launchUri: buildLaunchUri(manifest.CatalogNamespace, manifest.CatalogItemId, AppName),
    workingDirectory: installPath,
    installPath
  };
}

// LauncherInstalled.dat lista instalações mesmo quando o .item foi perdido
async function readLauncherInstalled(): Promise<LauncherInstalledEntry[]> {
  const datPath = join(programData, 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');
  if (!existsSync(datPath)) return [];
  const parsed = JSON.parse(await readFile(datPath, 'utf-8')) as { InstallationList?: LauncherInstalledEntry[] };
  return parsed.InstallationList ?? [];
}

export const epicScanner: PlatformScanner = {
  platform: 'epic',

  async scan(): Promise<PlatformScanResult> {
    const warnings: string[] = [];
    const games = new Map<string, DetectedGame>();
    const manifestsDir = await findManifestsDir();

    if (manifestsDir) {
      for (const file of await readdir(manifestsDir)) {
        if (!file.toLowerCase().endsWith('.item')) continue;
        try {
          const manifest = JSON.parse(await readFile(join(manifestsDir, file), 'utf-8')) as EpicManifest;
          const game = manifestToGame(manifest);
          if (game) games.set(game.id, game);
        } catch (err) {
          warnings.push(`Epic: falha ao ler ${file} (${(err as Error).message})`);
        }
      }
    }

    try {
      for (const entry of await readLauncherInstalled()) {
        if (!entry.AppName || !entry.InstallLocation) continue;
        const id = `epic-${entry.AppName}`;
        if (games.has(id) || entry.AppName.startsWith('UE_')) continue;
        if (!existsSync(entry.InstallLocation)) continue;
        const installPath = normalize(entry.InstallLocation);
        games.set(id, {
          id,
          title: basename(installPath),
          platform: 'epic',
          platformGameId: entry.AppName,
          executablePath: '',
          launchUri: buildLaunchUri(entry.NamespaceId, entry.ItemId, entry.AppName),
          workingDirectory: installPath,
          installPath
        });
      }
    } catch (err) {
      warnings.push(`Epic: falha ao ler LauncherInstalled.dat (${(err as Error).message})`);
    }

    if (!manifestsDir && games.size === 0) {
      console.log('[Scanner:Epic] Nenhum jogo instalado pela Epic encontrado');
    } else {
      console.log(`[Scanner:Epic] ${games.size} jogos`);
    }
    return { games: [...games.values()], warnings };
  }
};
