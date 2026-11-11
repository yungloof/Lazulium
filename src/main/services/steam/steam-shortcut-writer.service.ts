import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, extname, join } from 'path';
import { Game } from '@shared/types/game';
import { findSteamPath, getAccountDirs } from '../scanners/steam-scanner.service';
import { parseBinaryVdf } from '../scanners/steam-shortcuts';
import { cachedFilePath } from '../metadata/media-cache.service';

export { parseBinaryVdf };

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(str: string): number {
  const buf = Buffer.from(str, 'utf8');
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// O algoritmo de appId para atalhos não-Steam da Steam usa CRC32 de exe + appname com bit mais alto ativo
export function generateShortcutAppId(exe: string, appName: string): number {
  return (crc32(exe + appName) | 0x80000000) >>> 0;
}

// Serializador do formato VDF binário usado pelo Steam shortcuts.vdf
export function serializeBinaryVdf(root: Record<string, unknown>): Buffer {
  const chunks: Buffer[] = [];

  function writeString(str: string) {
    chunks.push(Buffer.from(str, 'utf8'), Buffer.from([0]));
  }

  function writeObject(obj: Record<string, unknown>) {
    for (const [key, val] of Object.entries(obj)) {
      if (val === undefined || val === null) continue;
      if (typeof val === 'object' && !Buffer.isBuffer(val)) {
        chunks.push(Buffer.from([0x00]));
        writeString(key);
        writeObject(val as Record<string, unknown>);
        chunks.push(Buffer.from([0x08]));
      } else if (typeof val === 'string') {
        chunks.push(Buffer.from([0x01]));
        writeString(key);
        writeString(val);
      } else if (typeof val === 'number') {
        chunks.push(Buffer.from([0x02]));
        writeString(key);
        const b = Buffer.alloc(4);
        b.writeUInt32LE(val >>> 0, 0);
        chunks.push(b);
      }
    }
  }

  writeObject(root);
  chunks.push(Buffer.from([0x08]));
  return Buffer.concat(chunks);
}

function quote(str: string): string {
  const trimmed = str.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed;
  return `"${trimmed}"`;
}

interface RawShortcut {
  appid: number;
  appname: string;
  exe: string;
  startdir: string;
  icon: string;
  shortcutpath?: string;
  launchoptions: string;
  ishidden: number;
  allowdesktopconfig?: number;
  allowoverlay?: number;
  openvr?: number;
  devkit?: number;
  devkitgameid?: string;
  devkitoverrideappid?: number;
  lastplaytime?: number;
  flatpakappid?: string;
  tags?: Record<string, string>;
  [key: string]: unknown;
}

async function writeFileAtomic(filePath: string, data: Buffer): Promise<void> {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tmpPath, data);
    await rename(tmpPath, filePath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}

export async function addGameToSteam(game: Game): Promise<{ ok: boolean; appId?: number; error?: string }> {
  try {
    const steamPath = await findSteamPath();
    if (!steamPath) {
      return { ok: false, error: 'A pasta de instalação da Steam não foi encontrada neste computador.' };
    }

    const accountDirs = await getAccountDirs(steamPath);
    if (!accountDirs.length) {
      return { ok: false, error: 'Nenhuma conta de usuário foi localizada na pasta userdata da Steam.' };
    }

    const targetAccountDir = accountDirs[0];
    const configDir = join(targetAccountDir, 'config');
    const shortcutsPath = join(configDir, 'shortcuts.vdf');
    const gridDir = join(configDir, 'grid');

    await mkdir(configDir, { recursive: true });
    await mkdir(gridDir, { recursive: true });

    // Determina o executável e argumentos
    const rawExe = game.executablePath || '';
    if (!rawExe) {
      return { ok: false, error: 'O jogo não possui um executável configurado para iniciar.' };
    }

    const exe = quote(rawExe);
    const startDir = quote(game.workingDirectory || dirname(rawExe));
    const launchOptions = (game.customLaunchArguments ?? game.launchArguments)?.trim() || '';
    const appName = game.title.trim();
    const appId = generateShortcutAppId(exe, appName);
    const legacyAppId = generateShortcutAppId(rawExe, appName);

    // Lê os atalhos existentes para não sobrescrever a lista
    let root: Record<string, unknown> = {};
    if (existsSync(shortcutsPath)) {
      try {
        root = parseBinaryVdf(await readFile(shortcutsPath));
      } catch (err) {
        console.warn('[Steam:Shortcuts] Erro ao ler shortcuts.vdf existente, criando novo:', err);
        root = {};
      }
    }

    let shortcutsMap = (root.shortcuts ?? {}) as Record<string, RawShortcut>;
    if (typeof shortcutsMap !== 'object' || Array.isArray(shortcutsMap)) {
      shortcutsMap = {};
    }

    // Procura se já existe um atalho deste jogo (pelo appId ou pelo par exe + appname)
    let foundIndex: string | null = null;
    const entries = Object.entries(shortcutsMap);
    for (const [idx, item] of entries) {
      if (
        item.appid === appId ||
        item.appid === legacyAppId ||
        (item.appname === appName && (item.exe === exe || item.exe === rawExe))
      ) {
        foundIndex = idx;
        break;
      }
    }

    const shortcutIndex = foundIndex ?? String(entries.length);
    const existing = foundIndex ? { ...shortcutsMap[foundIndex] } : {};
    delete (existing as Record<string, unknown>).ShortcutPath;

    const newShortcut: RawShortcut = {
      ...existing,
      appid: appId,
      appname: appName,
      exe: exe,
      startdir: startDir,
      icon: rawExe,
      shortcutpath: '',
      launchoptions: launchOptions,
      ishidden: 0,
      allowdesktopconfig: 1,
      allowoverlay: 1,
      openvr: 0,
      devkit: 0,
      devkitgameid: '',
      devkitoverrideappid: 0,
      lastplaytime: Math.floor(Date.now() / 1000),
      flatpakappid: '',
      tags: { '0': 'Lazulium' }
    };

    shortcutsMap[shortcutIndex] = newShortcut;
    root.shortcuts = shortcutsMap;

    // Salva o novo shortcuts.vdf de forma atômica
    const serialized = serializeBinaryVdf(root);
    await writeFileAtomic(shortcutsPath, serialized);
    console.log(`[Steam:Shortcuts] Atalho "${appName}" (appId ${appId}) gravado em ${shortcutsPath}`);

    // Copia as artes em cache para a pasta grid da Steam
    await copyArtworkToSteamGrid(game, appId, gridDir);

    return { ok: true, appId };
  } catch (err) {
    console.error('[Steam:Shortcuts] Falha ao adicionar atalho:', err);
    return { ok: false, error: (err as Error).message };
  }
}

export async function removeGameFromSteam(game: Game): Promise<{ ok: boolean; error?: string }> {
  try {
    const steamPath = await findSteamPath();
    if (!steamPath) return { ok: false, error: 'Steam não encontrada.' };

    const accountDirs = await getAccountDirs(steamPath);
    if (!accountDirs.length) return { ok: false, error: 'Conta da Steam não encontrada.' };

    const targetAccountDir = accountDirs[0];
    const shortcutsPath = join(targetAccountDir, 'config', 'shortcuts.vdf');

    if (!existsSync(shortcutsPath)) return { ok: true };

    const root = parseBinaryVdf(await readFile(shortcutsPath));
    const shortcutsMap = (root.shortcuts ?? {}) as Record<string, RawShortcut>;
    const rawExe = game.executablePath || '';
    const exe = quote(rawExe);
    const appName = game.title.trim();
    const appId = generateShortcutAppId(exe, appName);
    const legacyAppId = generateShortcutAppId(rawExe, appName);

    const remaining: RawShortcut[] = [];
    for (const item of Object.values(shortcutsMap)) {
      if (
        item.appid === appId ||
        item.appid === legacyAppId ||
        (item.appname === appName && rawExe && (item.exe === exe || item.exe === rawExe || item.exe.includes(rawExe)))
      ) {
        continue;
      }
      remaining.push(item);
    }

    const reindexed: Record<string, RawShortcut> = {};
    remaining.forEach((item, i) => {
      reindexed[String(i)] = item;
    });

    root.shortcuts = reindexed;
    await writeFileAtomic(shortcutsPath, serializeBinaryVdf(root));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function copyArtworkToSteamGrid(game: Game, appId: number, gridDir: string): Promise<void> {
  // Mapeamento das artes do Lazulium para o formato de grid da Steam:
  // - coverUrl -> <appId>p.ext (Grid vertical 600x900)
  // - heroUrl -> <appId>_hero.ext (Banner horizontal) e <appId>.ext (Grid horizontal clássico)
  // - logoUrl -> <appId>_logo.ext (Logo transparente)
  // - iconUrl -> <appId>_icon.ext (Ícone)
  const targets: { url?: string; names: string[] }[] = [
    { url: game.media?.coverUrl, names: [`${appId}p`] },
    { url: game.media?.heroUrl, names: [`${appId}_hero`, `${appId}`] },
    { url: game.media?.logoUrl, names: [`${appId}_logo`] },
    { url: game.media?.iconUrl, names: [`${appId}_icon`] }
  ];

  for (const target of targets) {
    if (!target.url) continue;
    const localPath = cachedFilePath(target.url);
    if (!localPath || !existsSync(localPath)) continue;

    const ext = extname(localPath) || '.png';
    for (const name of target.names) {
      try {
        const dest = join(gridDir, `${name}${ext}`);
        await copyFile(localPath, dest);
      } catch (err) {
        console.warn(`[Steam:Shortcuts] Falha ao copiar arte para ${name}${ext}:`, (err as Error).message);
      }
    }
  }
}
