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
      const game = manifestToGame(manifest);
      if (game) games.push(game);
    }
  }
  if (games.length) console.log(`[Scanner:Epic] ${games.length} jogos do launcher antigo ainda no disco (import-scan)`);
  return games;
}

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
  const parsed = JSON.parse((await readFile(datPath, 'utf-8')).replace(/^﻿/, '')) as { InstallationList?: LauncherInstalledEntry[] };
  return parsed.InstallationList ?? [];
}

export const epicScanner: PlatformScanner = {
  platform: 'epic',

  async scan(): Promise<PlatformScanResult> {
    const warnings: string[] = [];
    const games = new Map<string, DetectedGame>();
    const manifestsDir = await findManifestsDir();

    // Pasta sem permissão de leitura não impede o LauncherInstalled.dat logo abaixo
    const files = manifestsDir
      ? await readdir(manifestsDir).catch((err) => {
          warnings.push('Epic: não consegui abrir a pasta de manifestos da Epic Games.');
          console.warn(`[Scanner:Epic] ${manifestsDir}:`, (err as Error).message);
          return [] as string[];
        })
      : [];
    for (const file of files) {
      if (!file.toLowerCase().endsWith('.item')) continue;
      try {
        const manifest = JSON.parse((await readFile(join(manifestsDir!, file), 'utf-8')).replace(/^﻿/, '')) as EpicManifest;
        const game = manifestToGame(manifest);
        if (game) games.set(game.id, game);
      } catch (err) {
        warnings.push(`Epic: um manifesto de jogo está danificado (${file}). Abra a Epic Games para ela refazê-lo.`);
        console.warn(`[Scanner:Epic] ${file}:`, (err as Error).message);
      }
    }

    // Launcher novo (2026, com.epicgames.eglv2): instalações em JSONL, nomes no cache do catálogo
    try {
      for (const game of await scanLauncherV2()) if (!games.has(game.id)) games.set(game.id, game);
      for (const game of await scanV2ImportedItems()) if (!games.has(game.id)) games.set(game.id, game);
    } catch (err) {
      warnings.push('Epic: não consegui ler a lista de jogos do launcher novo da Epic Games.');
      console.warn('[Scanner:Epic] launcher novo:', (err as Error).message);
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
      warnings.push('Epic: a lista de jogos instalados da Epic Games (LauncherInstalled.dat) está danificada.');
      console.warn('[Scanner:Epic] LauncherInstalled.dat:', (err as Error).message);
    }

    if (games.size === 0) {
      const v2 = existsSync(join(eglV2Dir(), 'installations.jsonl')) ? 'lista do launcher novo existe' : 'sem launcher novo';
      console.log(`[Scanner:Epic] Nenhum jogo instalado pela Epic encontrado (${manifestsDir ? 'pasta de manifestos antiga existe' : 'sem launcher antigo'}; ${v2})`);
    } else {
      console.log(`[Scanner:Epic] ${games.size} jogos`);
    }
    return { games: [...games.values()], warnings };
  }
};
