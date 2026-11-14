import { existsSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { basename, dirname, join, normalize } from 'path';
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

const DRIVE_CHECK_TIMEOUT_MS = 1500;
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
      const ts = Date.parse(when);
      if (Number.isNaN(ts)) continue;
      const iso = new Date(ts).toISOString();
      if (!out.has(artifactId) || out.get(artifactId)! < iso) out.set(artifactId, iso);
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

// --- Jogos fora das pastas padrão ---
// Quem instala a Epic em outra pasta ou disco, move jogos para outro lugar ou usa um launcher que não os lista
// (instalações copiadas, launcher reinstalado) fica sem nada nas listas acima. Todo jogo da Epic tem uma pasta
// ".egstore" dentro da pasta de instalação: procurar por ela acha o jogo onde quer que esteja.

const DEEP_SCAN_DEPTH = 3;           // Pastas dentro de pastas a partir da raiz de cada disco (D:\Jogos\Epic\Jogo)
const FOLDER_SCAN_DEPTH = 3;         // O mesmo para as pastas que a pessoa adicionou nas configurações
const DEFAULT_ROOT_DEPTH = 1;        // Pastas padrão da Epic: os jogos ficam logo dentro
const DEEP_SCAN_BUDGET_MS = 5000;
const DEEP_SCAN_MAX_FOLDERS = 15_000;
const DEEP_SCAN_PARALLEL = 24;
const IGNORED_FOLDERS = new Set(['launcher', 'directxredist', 'unrealengine', 'vaultcache', 'fablibrary']);
// Pastas do sistema e de bibliotecas de outros programas: nunca têm jogo da Epic e custam tempo
const SKIPPED_WHILE_SEARCHING = new Set([
  'windows',
  'winsxs',
  '$recycle.bin',
  'system volume information',
  'programdata',
  'appdata',
  'node_modules',
  'steamapps',
  'recovery',
  'perflogs',
  'msocache',
  '.git'
]);

interface SearchRoot {
  path: string;
  depth: number;                     // Quantos níveis abaixo da raiz ainda são olhados
}

// Pastas de jogo (as que têm ".egstore" dentro) a partir das raízes, nível a nível, com limite de tempo e de pastas
export async function findEgstoreFolders(roots: SearchRoot[], deadline: number, maxFolders = DEEP_SCAN_MAX_FOLDERS): Promise<string[]> {
  const found = new Map<string, string>();
  const seen = new Set<string>();
  let visited = 0;
  let level = roots.map((root) => ({ dir: normalize(root.path), left: root.depth }));

  while (level.length > 0 && Date.now() < deadline && visited < maxFolders) {
    const next: typeof level = [];
    for (let i = 0; i < level.length && Date.now() < deadline && visited < maxFolders; i += DEEP_SCAN_PARALLEL) {
      await Promise.all(
        level.slice(i, i + DEEP_SCAN_PARALLEL).map(async ({ dir, left }) => {
          const key = dir.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          visited++;
          const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
          if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === '.egstore')) {
            found.set(key, dir);
            return;
          }
          if (left <= 0) return;
          for (const entry of entries) {
            const name = entry.name.toLowerCase();
            if (!entry.isDirectory() || SKIPPED_WHILE_SEARCHING.has(name) || IGNORED_FOLDERS.has(name)) continue;
            next.push({ dir: join(dir, entry.name), left: left - 1 });
          }
        })
      );
    }
    level = next;
  }
  return [...found.values()];
}

// .egstore/<id>.mancpn: JSON com o AppName e os ids do catálogo (existe mesmo quando o launcher não conhece o jogo)
async function readMancpn(storeDir: string): Promise<{ AppName?: string; CatalogItemId?: string; CatalogNamespace?: string } | undefined> {
  const files = (await readdir(storeDir).catch(() => [] as string[])).filter((f) => f.toLowerCase().endsWith('.mancpn'));
  for (const file of files) {
    const data = await readJson<{ AppName?: string; CatalogItemId?: string; CatalogNamespace?: string }>(join(storeDir, file));
    if (data?.AppName) return data;
  }
  return undefined;
}

export async function gameFromEgstoreFolder(gameDir: string): Promise<DetectedGame | null> {
  const storeDir = join(gameDir, '.egstore');
  const manifestInStore = (await findItemManifestInFolder(storeDir)) || (await findItemManifestInFolder(gameDir));
  const cpn = await readMancpn(storeDir);
  const launchExe = await findLaunchExe(gameDir);

  let appName = manifestInStore?.AppName || cpn?.AppName;
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
  const folderName = basename(gameDir);
  if (!appName) appName = folderName;
  if (appName.endsWith('ReleaseBuilds')) appName = appName.replace(/ReleaseBuilds$/, '') || appName;

  let title = manifestInStore?.DisplayName || folderName;
  if (title.endsWith('ReleaseBuilds') && folderName && !folderName.endsWith('ReleaseBuilds')) title = folderName;

  const installPath = normalize(gameDir);
  const executablePath = launchExe || (manifestInStore?.LaunchExecutable ? join(installPath, manifestInStore.LaunchExecutable) : '');
  return {
    id: `epic-${appName}`,
    title,
    platform: 'epic',
    platformGameId: appName,
    executablePath,
    launchArguments: manifestInStore?.LaunchCommand?.trim() || undefined,
    // Sem o launcher conhecendo a instalação, o endereço da Epic não abre o jogo: com o executável na mão, abre direto
    launchUri: executablePath && existsSync(executablePath) ? undefined : buildLaunchUri(manifestInStore?.CatalogNamespace || cpn?.CatalogNamespace, manifestInStore?.CatalogItemId || cpn?.CatalogItemId, appName),
    workingDirectory: installPath,
    installPath
  };
}

// Quem já adicionou o executável de um jogo da Epic à mão mostra onde ele está: a pasta de instalação é a de cima que tem ".egstore"
export function egstoreAncestor(path: string, maxLevels = 8): string | undefined {
  let dir = dirname(normalize(path));
  for (let level = 0; level < maxLevels; level++) {
    if (existsSync(join(dir, '.egstore'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

// Varre pastas de bibliotecas e discos em busca de jogos instalados (.egstore)
async function scanLibraryRoots(knownGames: Map<string, DetectedGame>, extraFolders: string[], knownExecutables: string[]): Promise<DetectedGame[]> {
  const roots = new Map<string, SearchRoot>();
  const addRoot = (p: string | undefined, depth: number) => {
    if (!p || !existsSync(p)) return;
    const key = normalize(p).toLowerCase();
    const known = roots.get(key);
    if (!known || known.depth < depth) roots.set(key, { path: normalize(p), depth });
  };

  // 1. Configurações do launcher antigo (GameUserSettings.ini)
  const localAppData = process.env['LOCALAPPDATA'] || join(process.env['USERPROFILE'] || '', 'AppData', 'Local');
  const iniPath = join(localAppData, 'EpicGamesLauncher', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini');
  if (existsSync(iniPath)) {
    try {
      const content = await readFile(iniPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:DefaultAppInstallLocation|CreatedProjectPaths|AppInstallPaths|InstallLocation)\s*=\s*(.+)$/i);
        if (match) addRoot(match[1].trim().replace(/^["']|["']$/g, ''), DEFAULT_ROOT_DEPTH);
      }
    } catch {
      // segue
    }
  }

  // 2. Pasta ao lado do executável do launcher (do registro EOS)
  try {
    const modSdkCommand = await readRegistryValue('HKCU\\Software\\Epic Games\\EOS', 'ModSdkCommand');
    if (modSdkCommand) {
      const parts = normalize(modSdkCommand).split(/[\\/]/);
      const epicGamesIdx = parts.findIndex((p) => p.toLowerCase() === 'epic games');
      if (epicGamesIdx !== -1) addRoot(parts.slice(0, epicGamesIdx + 1).join('\\'), DEFAULT_ROOT_DEPTH);
    }
  } catch {
    // segue
  }

  // 3. Pastas padrão do sistema
  addRoot(join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Epic Games'), DEFAULT_ROOT_DEPTH);
  addRoot(join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Epic Games'), DEFAULT_ROOT_DEPTH);
  addRoot(join(process.env['USERPROFILE'] || '', 'Epic Games'), DEFAULT_ROOT_DEPTH);
  addRoot('C:\\Epic Games', DEFAULT_ROOT_DEPTH);
  addRoot('C:\\EpicGames', DEFAULT_ROOT_DEPTH);

  // 4. Pastas de jogos que a pessoa adicionou (Configurações > Biblioteca) e as comuns "Games"/"Jogos": dentro delas vale ir mais fundo
  for (const folder of extraFolders) addRoot(folder, FOLDER_SCAN_DEPTH);
  for (const exe of knownExecutables) addRoot(egstoreAncestor(exe), 0);

  // 5. Os discos: checagem assíncrona com limite de tempo (uma unidade de rede desconectada ou um leitor de cartão vazio
  // não pode travar o app) e busca limitada em profundidade, tempo e número de pastas
  const existsSoon = (p: string) =>
    Promise.race([stat(p).then(() => true, () => false), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DRIVE_CHECK_TIMEOUT_MS))]);
  const driveLetters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const drives = (await Promise.all(driveLetters.map(async (letter) => ((await existsSoon(`${letter}:\\`)) ? letter : null)))).filter((l): l is string => l !== null);
  const driveFolders = drives.flatMap((letter) => [`${letter}:\\Epic Games`, `${letter}:\\EpicGames`, `${letter}:\\Games\\Epic Games`, `${letter}:\\Jogos\\Epic Games`]);
  const folderExists = await Promise.all(driveFolders.map(existsSoon));
  driveFolders.forEach((folder, i) => folderExists[i] && addRoot(folder, DEFAULT_ROOT_DEPTH));
  const searchRoots = [...roots.values(), ...drives.map((letter) => ({ path: `${letter}:\\`, depth: DEEP_SCAN_DEPTH }))];

  const knownPaths = new Set([...knownGames.values()].map((g) => (g.installPath ? normalize(g.installPath).toLowerCase() : '')));
  const folders = await findEgstoreFolders(searchRoots, Date.now() + DEEP_SCAN_BUDGET_MS);

  const foundGames: DetectedGame[] = [];
  for (const gameDir of folders) {
    try {
      if (knownPaths.has(normalize(gameDir).toLowerCase())) continue;
      const game = await gameFromEgstoreFolder(gameDir);
      if (!game || knownGames.has(game.id) || foundGames.some((g) => g.id === game.id)) continue;
      foundGames.push(game);
    } catch (err) {
      console.warn(`[Scanner:Epic] pasta ${gameDir}:`, (err as Error).message);
    }
  }
  if (foundGames.length) console.log(`[Scanner:Epic] ${foundGames.length} jogos achados pela pasta .egstore fora das listas do launcher`);
  return foundGames;
}

// extraFolders: pastas de jogos que a pessoa adicionou (e as comuns, como D:\Games), onde a busca por .egstore vai mais fundo
// knownExecutables: executáveis de jogos que a pessoa já tem (adicionados à mão, por exemplo): se algum for da Epic, a pasta dele entra
export function createEpicScanner(extraFolders: () => string[], knownExecutables: () => string[] = () => []): PlatformScanner {
  return {
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
        const libraryGames = await scanLibraryRoots(games, extraFolders(), knownExecutables());
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
}

export const epicScanner: PlatformScanner = createEpicScanner(() => []);
