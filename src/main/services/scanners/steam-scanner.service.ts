import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { basename, dirname, join, normalize } from 'path';
import { db } from '../../database/db';
import { mediaUrl } from '../metadata/media-cache.service';
import { STEAM_GRID_HOST, readSteamShortcuts } from './steam-shortcuts';
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

interface SteamAppStats {
  playtimeSeconds?: number;
  lastPlayedAt?: string;
}

const STEAMID64_BASE = 76561197960265728n;
const GRID_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

// Pastas de userdata a considerar: a conta conectada no Lazulium; senão a mais recente do cliente da Steam.
// Somar/comparar contas diferentes misturaria horas de outras pessoas que usam o PC.
async function getAccountDirs(steamPath: string): Promise<string[]> {
  const userdata = join(steamPath, 'userdata');
  const all = (await readdir(userdata).catch(() => [] as string[])).filter((d) => /^\d+$/.test(d));

  let steamId64 = db.getSettings().steamUserId;
  if (!/^7656\d{13}$/.test(steamId64 ?? '')) {
    try {
      const users = vdfGetObject(parseVdf(await readFile(join(steamPath, 'config', 'loginusers.vdf'), 'utf-8')), 'users');
      const ranked = Object.keys(users ?? {})
        .filter((id) => /^7656\d{13}$/.test(id))
        .map((id) => ({ id, entry: vdfGetObject(users, id) }))
        .sort(
          (a, b) =>
            Number(vdfGetString(b.entry, 'mostrecent') === '1') - Number(vdfGetString(a.entry, 'mostrecent') === '1') ||
            Number(vdfGetString(b.entry, 'timestamp') ?? 0) - Number(vdfGetString(a.entry, 'timestamp') ?? 0)
        );
      steamId64 = ranked[0]?.id ?? '';
    } catch {
      steamId64 = '';
    }
  }

  const active = steamId64 ? (BigInt(steamId64) - STEAMID64_BASE).toString() : undefined;
  return active && all.includes(active) ? [join(userdata, active)] : all.map((d) => join(userdata, d));
}

// Horas e última sessão de cada app em localconfig.vdf:
// UserLocalConfigStore > Software > Valve > Steam > apps > <appid> > Playtime (minutos) / LastPlayed (unix)
async function getSteamLocalPlaytimes(accountDirs: string[]): Promise<Map<string, SteamAppStats>> {
  const statsMap = new Map<string, SteamAppStats>();
  for (const accountDir of accountDirs) {
    let apps: VdfObject | undefined;
    try {
      const root = parseVdf(await readFile(join(accountDir, 'config', 'localconfig.vdf'), 'utf-8'));
      apps = ['userlocalconfigstore', 'software', 'valve', 'steam', 'apps'].reduce<VdfObject | undefined>(
        (node, key) => vdfGetObject(node, key),
        root
      );
    } catch (err) {
      console.warn(`[Scanner:Steam] Não foi possível ler ${accountDir}\config\localconfig.vdf:`, (err as Error).message);
      continue;
    }

    for (const appId of Object.keys(apps ?? {})) {
      const entry = vdfGetObject(apps, appId);
      const minutes = Number(vdfGetString(entry, 'playtime') ?? 0);
      const lastPlayedSec = Number(vdfGetString(entry, 'lastplayed') ?? 0);
      if (!(minutes > 0) && !(lastPlayedSec > 0)) continue;
      const stats: SteamAppStats = {
        playtimeSeconds: minutes > 0 ? minutes * 60 : undefined,
        lastPlayedAt: lastPlayedSec > 0 ? new Date(lastPlayedSec * 1000).toISOString() : undefined
      };
      const existing = statsMap.get(appId);
      if (!existing || (existing.playtimeSeconds ?? 0) < (stats.playtimeSeconds ?? 0)) statsMap.set(appId, stats);
    }
  }
  return statsMap;
}

function findGridArt(gridDir: string, appId: number, suffixes: string[]): string | undefined {
  for (const suffix of suffixes) {
    for (const ext of GRID_EXTENSIONS) {
      const file = `${appId}${suffix}.${ext}`;
      if (existsSync(join(gridDir, file))) return file;
    }
  }
  return undefined;
}

// Atalhos não-Steam ("Adicionar jogo" na Steam): emuladores, ports e jogos avulsos.
// Abrem pela Steam (mantém Steam Input/overlay); artes personalizadas da pasta config/grid.
// No localconfig.vdf a Steam grava as horas deles com o appid como int32 com sinal
// (ex: 2712533781 vira "-1582433515").
async function scanShortcuts(accountDirs: string[], localStats: Map<string, SteamAppStats>): Promise<DetectedGame[]> {
  const games = new Map<string, DetectedGame>();
  for (const accountDir of accountDirs) {
    const account = basename(accountDir);
    const gridDir = join(accountDir, 'config', 'grid');
    const gridUrl = (file?: string) => (file ? mediaUrl(STEAM_GRID_HOST, `${account}/config/grid/${file}`) : undefined);

    for (const s of await readSteamShortcuts(accountDir)) {
      const id = `steam-shortcut-${s.appId}`;
      if (s.hidden || games.has(id)) continue;
      const installPath = s.startDir || (s.exe ? dirname(s.exe) : undefined);
      const stats = localStats.get(String(s.appId | 0)) ?? localStats.get(String(s.appId));
      games.set(id, {
        id,
        title: s.name,
        platform: 'standalone',
        platformGameId: s.gameId,
        executablePath: s.exe,
        launchArguments: [s.exeArgs, s.launchOptions].filter(Boolean).join(' ') || undefined,
        workingDirectory: installPath,
        installPath,
        launchUri: `steam://rungameid/${s.gameId}`,
        initialPlaytimeSeconds: stats?.playtimeSeconds,
        lastPlayedAt: [s.lastPlayedAt, stats?.lastPlayedAt].filter(Boolean).sort().pop(),
        media: {
          coverUrl: gridUrl(findGridArt(gridDir, s.appId, ['p', '_p'])),
          heroUrl: gridUrl(findGridArt(gridDir, s.appId, ['_hero'])),
          logoUrl: gridUrl(findGridArt(gridDir, s.appId, ['_logo'])),
          iconUrl: gridUrl(findGridArt(gridDir, s.appId, ['_icon']))
        }
      });
    }
  }
  return [...games.values()];
}

function manifestToGame(manifest: VdfObject, libraryPath: string, steamExe: string): DetectedGame | null {
  const appState = vdfGetObject(manifest, 'AppState');
  const appId = vdfGetString(appState, 'appid');
  const name = vdfGetString(appState, 'name');
  const installDir = vdfGetString(appState, 'installdir');
  const stateFlags = Number(vdfGetString(appState, 'StateFlags') ?? '0');
  const lastPlayedSec = Number(vdfGetString(appState, 'LastPlayed') ?? '0');

  if (!appId || !name) return null;
  if (IGNORED_APP_IDS.has(appId) || IGNORED_NAME_PATTERN.test(name)) return null;
  if ((stateFlags & STATE_FULLY_INSTALLED) === 0) return null;

  const installPath = installDir ? join(libraryPath, 'steamapps', 'common', installDir) : undefined;
  const lastPlayedAt = lastPlayedSec > 0 ? new Date(lastPlayedSec * 1000).toISOString() : undefined;

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
    lastPlayedAt,
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
    const accountDirs = await getAccountDirs(steamPath);
    const localStats = await getSteamLocalPlaytimes(accountDirs);
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
          if (game) {
            const stats = game.platformGameId ? localStats.get(game.platformGameId) : undefined;
            if (stats) {
              game.initialPlaytimeSeconds = stats.playtimeSeconds;
              if (stats.lastPlayedAt) game.lastPlayedAt = stats.lastPlayedAt;
            }
            games.set(game.id, game);
          }
        } catch (err) {
          warnings.push(`Steam: falha ao ler ${file} (${(err as Error).message})`);
        }
      }
    }

    let shortcuts: DetectedGame[] = [];
    try {
      shortcuts = await scanShortcuts(accountDirs, localStats);
    } catch (err) {
      warnings.push(`Steam: falha ao ler atalhos não-Steam (${(err as Error).message})`);
    }
    for (const game of shortcuts) games.set(game.id, game);

    console.log(`[Scanner:Steam] ${games.size - shortcuts.length} jogos em ${libraries.length} biblioteca(s) + ${shortcuts.length} atalho(s) não-Steam`);
    return { games: [...games.values()], warnings };
  }
};
