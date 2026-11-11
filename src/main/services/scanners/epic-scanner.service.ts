import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { basename, join, normalize } from 'path';
import { readRegistryValue } from './registry';
import { readEpicManifest } from './epic-manifest';
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
  ArtifactId?: string;
  AppVersion?: string;
}

const programData = process.env['PROGRAMDATA'] || 'C:\\ProgramData';

// --- Launcher novo da Epic (com.epicgames.eglv2, 2026) ---
// installations.jsonl: 1ª linha é um cabeçalho; cada linha seguinte é um estado de uma instalação (a última vale).
// O nome e as artes vêm do cache do catálogo; o executável, do manifesto binário em <pasta>/.egstore.

interface EglV2Installation {
  installationId?: string;
  complete?: boolean;
  dir?: string;
  namespace?: string;
  itemId?: string;
  artifactId?: string;
  removed?: boolean;
  deleted?: boolean;
  uninstalled?: boolean;
}

interface EglV2CatalogItem {
  title?: string;
  categories?: { path?: string }[];
  mainGameItem?: unknown;
  keyImages?: { type?: string; url?: string }[];
}

const eglV2Dir = () => join(process.env['LOCALAPPDATA'] || join(process.env['USERPROFILE'] || '', 'AppData', 'Local'), 'com.epicgames.eglv2');

async function readJson<T>(path: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse((await readFile(path, 'utf-8')).replace(/^﻿/, '')) as T;
  } catch {
    return undefined;
  }
}

// A conta logada fica como chave: junta todas, ficando com a data mais recente de cada jogo
async function readLastPlayed(dir: string): Promise<Map<string, string>> {
  const data = (await readJson<Record<string, Record<string, string>>>(join(dir, 'last-played.json'))) ?? {};
  const out = new Map<string, string>();
  for (const perAccount of Object.values(data)) {
    for (const [artifactId, when] of Object.entries(perAccount ?? {})) {
      const iso = new Date(when).toISOString();
      if (!Number.isNaN(Date.parse(when)) && (!out.has(artifactId) || out.get(artifactId)! < iso)) out.set(artifactId, iso);
    }
  }
  return out;
}

async function findLaunchExe(installPath: string, installationId?: string): Promise<string> {
  const store = join(installPath, '.egstore');
  if (!existsSync(store)) return '';
  const files = (await readdir(store).catch(() => [] as string[])).filter((f) => f.toLowerCase().endsWith('.manifest'));
  const ordered = installationId ? [...files.filter((f) => f.toUpperCase().startsWith(installationId.toUpperCase())), ...files] : files;
  for (const file of ordered) {
    try {
      const meta = await readEpicManifest(join(store, file));
      if (meta?.launchExe) return join(installPath, meta.launchExe.replace(/\//g, '\\'));
    } catch (err) {
      console.warn(`[Scanner:Epic] manifesto ${file}:`, (err as Error).message);
    }
  }
  return '';
}

async function findItemManifestInFolder(folder: string): Promise<EpicManifest | null> {
  if (!existsSync(folder)) return null;
  const files = (await readdir(folder).catch(() => [] as string[])).filter((f) => f.toLowerCase().endsWith('.item'));
  for (const file of files) {
    const manifest = await readJson<EpicManifest>(join(folder, file));
    if (manifest) return manifest;
  }
  return null;
}

async function scanLauncherV2(): Promise<DetectedGame[]> {
  const dir = eglV2Dir();
  const jsonlPath = join(dir, 'installations.jsonl');
  if (!existsSync(jsonlPath)) return [];

  const latest = new Map<string, EglV2Installation>();
  const everComplete = new Set<string>(); // Já terminou de instalar alguma vez: atualização pendente não esconde o jogo
  for (const line of (await readFile(jsonlPath, 'utf-8')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry: EglV2Installation;
    try {
      entry = JSON.parse(line) as EglV2Installation;
    } catch {
      continue; // linha cortada no meio (launcher gravando agora): as outras valem
    }
    if (!entry.installationId) continue;
    latest.set(entry.installationId, entry);
    if (entry.complete) everComplete.add(entry.installationId);
  }

  const catalog = (await readJson<{ items?: Record<string, { item?: EglV2CatalogItem }> }>(join(dir, 'cache', 'prod', 'catalog-cache.json')))?.items ?? {};
  const lastPlayed = await readLastPlayed(dir);
  const games: DetectedGame[] = [];

  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  for (const entry of latest.values()) {
    if (entry.removed || entry.deleted || entry.uninstalled) {
      skip('desinstalado');
      continue;
    }
    if (!entry.complete && !everComplete.has(entry.installationId!)) {
      skip('instalação não terminada');
      continue;
    }
    if (!entry.dir || !entry.artifactId) {
      skip('sem pasta');
      continue;
    }
    if (!existsSync(entry.dir)) {
      skip('pasta não existe mais');
      continue;
    }
    const item = entry.itemId ? catalog[entry.itemId]?.item : undefined;
    if (item?.mainGameItem) {
      skip('DLC');
      continue;
    }
    const categories = item?.categories?.map((c) => c.path) ?? [];
    if (categories.length > 0 && !categories.includes('games')) {
      skip('não é jogo');
      continue;
    }

    const installPath = normalize(entry.dir);
    const image = (type: string) => item?.keyImages?.find((k) => k.type === type)?.url;
    const cover = image('DieselGameBoxTall');
    const hero = image('DieselGameBox');
    games.push({
      id: `epic-${entry.artifactId}`,
      title: item?.title?.trim() || basename(installPath),
      platform: 'epic',
      platformGameId: entry.artifactId,
      executablePath: await findLaunchExe(installPath, entry.installationId),
      launchUri: buildLaunchUri(entry.namespace, entry.itemId, entry.artifactId),
      workingDirectory: installPath,
      installPath,
      ...(cover || hero ? { media: { ...(cover ? { coverUrl: cover } : {}), ...(hero ? { heroUrl: hero } : {}) } } : {}),
      ...(lastPlayed.has(entry.artifactId) ? { lastPlayedAt: lastPlayed.get(entry.artifactId) } : {})
    });
  }
  console.log(`[Scanner:Epic] launcher novo: ${latest.size} instalações, ${games.length} jogos${Object.keys(skipped).length ? ` (ignorados: ${Object.entries(skipped).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}${Object.keys(catalog).length ? '' : '; sem cache do catálogo, nomes pelas pastas'}`);
  return games;
}

// Jogos do launcher antigo que o novo copiou para import-scan ao se instalar (e removeu o antigo).
// Os "not-imported" continuam no disco mas o launcher novo não os lista: sem isto sumiriam do Lazulium.
async function scanV2ImportedItems(): Promise<DetectedGame[]> {
  const base = join(eglV2Dir(), 'import-scan', 'v1-items');
  if (!existsSync(base)) return [];
  const games: DetectedGame[] = [];
  for (const sub of ['', 'imported', 'not-imported']) {
    const folder = join(base, sub);
    if (!existsSync(folder)) continue;
    for (const file of await readdir(folder).catch(() => [] as string[])) {
      if (!file.toLowerCase().endsWith('.item')) continue;
      const manifest = await readJson<EpicManifest>(join(folder, file));
      if (!manifest?.InstallLocation || !existsSync(manifest.InstallLocation)) continue;
      const game = await manifestToGame(manifest);
      if (game) games.push(game);
    }
  }
  if (games.length) console.log(`[Scanner:Epic] ${games.length} jogos do launcher antigo ainda no disco (import-scan)`);
  return games;
}

async function findManifestDirs(): Promise<string[]> {
  const dirs = new Set<string>();
  const add = (p?: string) => {
    if (p && existsSync(p)) dirs.add(normalize(p));
  };

  // 1. Registro (32 e 64-bit, HKLM e HKCU)
  const regKeys = [
    'HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher',
    'HKLM\\SOFTWARE\\Epic Games\\EpicGamesLauncher',
    'HKCU\\Software\\Epic Games\\EpicGamesLauncher'
  ];
  for (const key of regKeys) {
    const appData = await readRegistryValue(key, 'AppDataPath');
    if (appData) {
      add(join(appData, 'Manifests'));
      add(join(appData, 'Data', 'Manifests'));
      add(appData);
    }
  }

  const eosManifestDir = await readRegistryValue('HKCU\\Software\\Epic Games\\EOS', 'ModSdkMetadataDir');
  if (eosManifestDir) add(eosManifestDir);

  // 2. ProgramData
  add(join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'));
  add(join(programData, 'Epic', 'EpicGamesLauncher', 'Manifests'));
  add(join(programData, 'Epic', 'Manifests'));

  // 3. LocalAppData e AppData
  const localAppData = process.env['LOCALAPPDATA'] || join(process.env['USERPROFILE'] || '', 'AppData', 'Local');
  add(join(localAppData, 'EpicGamesLauncher', 'Saved', 'Manifests'));
  add(join(localAppData, 'EpicGamesLauncher', 'Data', 'Manifests'));
  const appData = process.env['APPDATA'] || join(process.env['USERPROFILE'] || '', 'AppData', 'Roaming');
  add(join(appData, 'EpicGamesLauncher', 'Data', 'Manifests'));

  return [...dirs];
}

function buildLaunchUri(namespace?: string, itemId?: string, appName?: string): string | undefined {
  if (namespace && itemId && appName) {
    return `com.epicgames.launcher://apps/${namespace}%3A${itemId}%3A${appName}?action=launch&silent=true`;
  }
  if (appName) {
    return `com.epicgames.launcher://apps/${appName}?action=launch&silent=true`;
  }
  return undefined;
}

async function manifestToGame(manifest: EpicManifest): Promise<DetectedGame | null> {
  const { AppName, DisplayName, InstallLocation } = manifest;
  if (!AppName || !DisplayName || !InstallLocation) return null;
  if (!existsSync(InstallLocation)) return null;

  const installPath = normalize(InstallLocation);
  let executablePath = manifest.LaunchExecutable ? join(installPath, manifest.LaunchExecutable) : '';

  // Se tiver atualização pendente (bIsIncompleteInstall), não descarta se o executável ou arquivos já existirem
  if (manifest.bIsIncompleteInstall && (!executablePath || !existsSync(executablePath))) {
    const fallbackExe = await findLaunchExe(installPath);
    if (!fallbackExe) return null;
    executablePath = fallbackExe;
  }

  // DLCs têm MainGameAppName apontando para o jogo base
  if (manifest.MainGameAppName && manifest.MainGameAppName !== AppName) return null;
  if (manifest.AppCategories && manifest.AppCategories.length > 0 && !manifest.AppCategories.some((c) => c.toLowerCase() === 'games')) {
    return null;
  }

  if (!executablePath || !existsSync(executablePath)) {
    const fallbackExe = await findLaunchExe(installPath);
    if (fallbackExe) executablePath = fallbackExe;
  }

  return {
    id: `epic-${AppName}`,
    title: DisplayName,
    platform: 'epic',
    platformGameId: AppName,
    executablePath,
    launchArguments: manifest.LaunchCommand?.trim() || undefined,
    launchUri: buildLaunchUri(manifest.CatalogNamespace, manifest.CatalogItemId, AppName),
    workingDirectory: installPath,
    installPath
  };
}

// LauncherInstalled.dat lista instalações mesmo quando o .item foi perdido
async function readLauncherInstalled(): Promise<LauncherInstalledEntry[]> {
  const localAppData = process.env['LOCALAPPDATA'] || join(process.env['USERPROFILE'] || '', 'AppData', 'Local');
  const candidates = [
    join(programData, 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
    join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'LauncherInstalled.dat'),
    join(programData, 'Epic', 'EpicGamesLauncher', 'LauncherInstalled.dat'),
    join(localAppData, 'EpicGamesLauncher', 'Saved', 'LauncherInstalled.dat')
  ];
  const list: LauncherInstalledEntry[] = [];
  for (const datPath of candidates) {
    if (!existsSync(datPath)) continue;
    try {
      const parsed = JSON.parse((await readFile(datPath, 'utf-8')).replace(/^﻿/, '')) as { InstallationList?: LauncherInstalledEntry[] };
      if (Array.isArray(parsed.InstallationList)) {
        list.push(...parsed.InstallationList);
      }
    } catch {
      // Ignora arquivo corrompido
    }
  }
  return list;
}

// Varre pastas de bibliotecas e discos em busca de jogos instalados (.egstore)
async function scanLibraryRoots(knownGames: Map<string, DetectedGame>): Promise<DetectedGame[]> {
  const candidateRoots = new Set<string>();
  const addRoot = (p?: string) => {
    if (p && existsSync(p)) candidateRoots.add(normalize(p));
  };

  // 1. Configurações do launcher antigo (GameUserSettings.ini)
  const localAppData = process.env['LOCALAPPDATA'] || join(process.env['USERPROFILE'] || '', 'AppData', 'Local');
  const iniPath = join(localAppData, 'EpicGamesLauncher', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini');
  if (existsSync(iniPath)) {
    try {
      const content = await readFile(iniPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:DefaultAppInstallLocation|CreatedProjectPaths|AppInstallPaths|InstallLocation)\s*=\s*(.+)$/i);
        if (match) {
          const val = match[1].trim().replace(/^["']|["']$/g, '');
          addRoot(val);
        }
      }
    } catch {
      // segue
    }
  }

  // 2. Pasta ao lado do executável do launcher (do registro EOS)
  try {
    const modSdkCommand = await readRegistryValue('HKCU\\Software\\Epic Games\\EOS', 'ModSdkCommand');
    if (modSdkCommand) {
      const normalized = normalize(modSdkCommand);
      const parts = normalized.split(/[\\/]/);
      const epicGamesIdx = parts.findIndex((p) => p.toLowerCase() === 'epic games');
      if (epicGamesIdx !== -1) {
        addRoot(parts.slice(0, epicGamesIdx + 1).join('\\'));
      }
    }
  } catch {
    // segue
  }

  // 3. Pastas padrão do sistema
  addRoot(join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Epic Games'));
  addRoot(join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Epic Games'));
  addRoot(join(process.env['USERPROFILE'] || '', 'Epic Games'));
  addRoot('C:\\Epic Games');
  addRoot('C:\\EpicGames');

  // 4. Varredura rápida em unidades existentes
  const driveLetters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (const letter of driveLetters) {
    const driveRoot = `${letter}:\\`;
    if (!existsSync(driveRoot)) continue;
    addRoot(`${letter}:\\Epic Games`);
    addRoot(`${letter}:\\EpicGames`);
    addRoot(`${letter}:\\Games\\Epic Games`);
    addRoot(`${letter}:\\Jogos\\Epic Games`);
  }

  const foundGames: DetectedGame[] = [];
  const ignoredFolders = new Set(['launcher', 'directxredist', 'unrealengine', 'vaultcache', 'fablibrary']);
  const knownPaths = new Set([...knownGames.values()].map((g) => (g.installPath ? normalize(g.installPath).toLowerCase() : '')));

  for (const root of candidateRoots) {
    try {
      const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (ignoredFolders.has(entry.name.toLowerCase())) continue;

        const gameDir = join(root, entry.name);
        const normDir = normalize(gameDir).toLowerCase();
        if (knownPaths.has(normDir) || foundGames.some((g) => g.installPath && normalize(g.installPath).toLowerCase() === normDir)) continue;

        const storeDir = join(gameDir, '.egstore');
        if (!existsSync(storeDir)) continue;

        const manifestInStore = (await findItemManifestInFolder(storeDir)) || (await findItemManifestInFolder(gameDir));
        const launchExe = await findLaunchExe(gameDir);

        let appName = manifestInStore?.AppName;
        if (!appName) {
          const manifestFiles = (await readdir(storeDir).catch(() => [] as string[])).filter((f) => f.toLowerCase().endsWith('.manifest'));
          for (const mf of manifestFiles) {
            try {
              const meta = await readEpicManifest(join(storeDir, mf));
              if (meta?.appName) {
                appName = meta.appName;
                break;
              }
            } catch {
              // segue
            }
          }
        }
        if (!appName) appName = entry.name;
        if (appName.endsWith('ReleaseBuilds')) {
          appName = appName.replace(/ReleaseBuilds$/, '') || appName;
        }

        const id = `epic-${appName}`;
        if (knownGames.has(id) || foundGames.some((g) => g.id === id)) continue;

        let title = manifestInStore?.DisplayName || entry.name;
        if (title.endsWith('ReleaseBuilds') && entry.name && !entry.name.endsWith('ReleaseBuilds')) {
          title = entry.name;
        }

        const installPath = normalize(gameDir);
        foundGames.push({
          id,
          title,
          platform: 'epic',
          platformGameId: appName,
          executablePath: launchExe || (manifestInStore?.LaunchExecutable ? join(installPath, manifestInStore.LaunchExecutable) : ''),
          launchArguments: manifestInStore?.LaunchCommand?.trim() || undefined,
          launchUri: buildLaunchUri(manifestInStore?.CatalogNamespace, manifestInStore?.CatalogItemId, appName),
          workingDirectory: installPath,
          installPath
        });
      }
    } catch {
      // segue
    }
  }

  return foundGames;
}

export const epicScanner: PlatformScanner = {
  platform: 'epic',

  async scan(): Promise<PlatformScanResult> {
    const warnings: string[] = [];
    const games = new Map<string, DetectedGame>();

    // 1. Launcher novo (2026, com.epicgames.eglv2): instalações em JSONL, nomes no cache do catálogo
    try {
      for (const game of await scanLauncherV2()) if (!games.has(game.id)) games.set(game.id, game);
      for (const game of await scanV2ImportedItems()) if (!games.has(game.id)) games.set(game.id, game);
    } catch (err) {
      warnings.push('Epic: não consegui ler a lista de jogos do launcher novo da Epic Games.');
      console.warn('[Scanner:Epic] launcher novo:', (err as Error).message);
    }

    // 2. Launcher clássico: pastas de manifestos (.item)
    const manifestDirs = await findManifestDirs();
    const knownPaths = new Set([...games.values()].filter((g) => !!g.installPath).map((g) => normalize(g.installPath!).toLowerCase()));
    for (const manifestsDir of manifestDirs) {
      try {
        const files = await readdir(manifestsDir).catch(() => [] as string[]);
        for (const file of files) {
          if (!file.toLowerCase().endsWith('.item')) continue;
          try {
            const manifest = JSON.parse((await readFile(join(manifestsDir, file), 'utf-8')).replace(/^﻿/, '')) as EpicManifest;
            const game = await manifestToGame(manifest);
            const pathKey = game?.installPath ? normalize(game.installPath).toLowerCase() : undefined;
            if (game && !games.has(game.id) && (!pathKey || !knownPaths.has(pathKey))) {
              games.set(game.id, game);
              if (pathKey) knownPaths.add(pathKey);
            }
          } catch (err) {
            warnings.push(`Epic: um manifesto de jogo está danificado (${file}).`);
            console.warn(`[Scanner:Epic] ${file}:`, (err as Error).message);
          }
        }
      } catch (err) {
        console.warn(`[Scanner:Epic] pasta ${manifestsDir}:`, (err as Error).message);
      }
    }

    // 3. LauncherInstalled.dat (detecta mesmo quando .item foi perdido)
    try {
      const knownPaths = new Set([...games.values()].filter((g) => !!g.installPath).map((g) => normalize(g.installPath!).toLowerCase()));
      for (const entry of await readLauncherInstalled()) {
        let appName = entry.AppName || entry.ArtifactId || entry.ItemId;
        if (!appName || !entry.InstallLocation) continue;
        if (appName.startsWith('UE_')) continue;
        if (!existsSync(entry.InstallLocation)) continue;

        const installPath = normalize(entry.InstallLocation);
        if (knownPaths.has(installPath.toLowerCase())) continue;

        if (appName.endsWith('ReleaseBuilds')) {
          appName = appName.replace(/ReleaseBuilds$/, '') || appName;
        }
        const id = `epic-${appName}`;
        if (games.has(id)) continue;
        const exe = await findLaunchExe(installPath, appName);
        const storeDir = join(installPath, '.egstore');
        const manifestInStore = (await findItemManifestInFolder(storeDir)) || (await findItemManifestInFolder(installPath));

        let title = manifestInStore?.DisplayName || basename(installPath);
        if (title.endsWith('ReleaseBuilds') && basename(installPath) && !basename(installPath).endsWith('ReleaseBuilds')) {
          title = basename(installPath);
        }

        games.set(id, {
          id,
          title,
          platform: 'epic',
          platformGameId: appName,
          executablePath: exe || (manifestInStore?.LaunchExecutable ? join(installPath, manifestInStore.LaunchExecutable) : ''),
          launchArguments: manifestInStore?.LaunchCommand?.trim() || undefined,
          launchUri: buildLaunchUri(manifestInStore?.CatalogNamespace || entry.NamespaceId, manifestInStore?.CatalogItemId || entry.ItemId, appName),
          workingDirectory: installPath,
          installPath
        });
      }
    } catch (err) {
      warnings.push('Epic: a lista de jogos instalados da Epic Games (LauncherInstalled.dat) está danificada.');
      console.warn('[Scanner:Epic] LauncherInstalled.dat:', (err as Error).message);
    }

    // 4. Varredura de bibliotecas conhecidas e unidades por pastas com .egstore
    try {
      const libraryGames = await scanLibraryRoots(games);
      for (const game of libraryGames) {
        if (!games.has(game.id)) games.set(game.id, game);
      }
    } catch (err) {
      console.warn('[Scanner:Epic] varredura de bibliotecas:', (err as Error).message);
    }

    if (games.size === 0) {
      const v2 = existsSync(join(eglV2Dir(), 'installations.jsonl')) ? 'lista do launcher novo existe' : 'sem launcher novo';
      const v1 = manifestDirs.length > 0 ? `${manifestDirs.length} pasta(s) de manifestos verificada(s)` : 'sem launcher antigo';
      console.log(`[Scanner:Epic] Nenhum jogo instalado pela Epic encontrado (${v1}; ${v2})`);
    } else {
      console.log(`[Scanner:Epic] ${games.size} jogos`);
    }

    return { games: [...games.values()], warnings };
  }
};
