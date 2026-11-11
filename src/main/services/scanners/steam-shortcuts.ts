import { readFile } from 'fs/promises';
import { join } from 'path';

// Jogos não-Steam adicionados à Steam ("Adicionar jogo" → atalhos), lidos de userdata/<conta>/config/shortcuts.vdf

export interface SteamShortcut {
  appId: number;                    // appid de 32 bits do atalho (nome das artes em config/grid)
  gameId: string;                   // gameid de 64 bits: (appid << 32) | 0x02000000 (steam://rungameid, capturas)
  name: string;
  exe: string;                      // Caminho do executável, sem aspas
  exeArgs: string;                  // Argumentos que vieram colados no campo exe ("C:\x.exe" --fullscreen)
  startDir: string;
  launchOptions: string;
  hidden: boolean;
  tags: string[];
  lastPlayedAt?: string;
}

const SHORTCUT_GAMEID_FLAG = 0x02000000n;

// Host do lazulium-media:// que serve userdata/<conta>/config/grid (artes personalizadas da Steam)
export const STEAM_GRID_HOST = 'steam-grid';

// VDF binário: 0x00 = objeto, 0x01 = texto, 0x02 = int32, 0x08 = fim do objeto
export function parseBinaryVdf(buf: Buffer): Record<string, unknown> {
  let i = 0;
  const readString = () => {
    const start = i;
    while (i < buf.length && buf[i] !== 0) i++;
    return buf.toString('utf8', start, i++);
  };
  const readObject = (): Record<string, unknown> => {
    const obj: Record<string, unknown> = {};
    while (i < buf.length) {
      const type = buf[i++];
      if (type === 0x08) return obj;
      const key = readString().toLowerCase();
      if (type === 0x00) obj[key] = readObject();
      else if (type === 0x01) obj[key] = readString();
      else if (type === 0x02) {
        obj[key] = buf.readUInt32LE(i);
        i += 4;
      } else throw new Error(`Tipo VDF binário desconhecido: ${type}`);
    }
    return obj;
  };
  return readObject();
}

const unquote = (value: string) => value.trim().replace(/^"(.*)"$/, '$1');

// "C:\Jogo\x.exe" --fullscreen -> { path: C:\Jogo\x.exe, args: --fullscreen }
function splitExe(raw: string): { path: string; args: string } {
  const value = raw.trim();
  if (value.startsWith('"')) {
    const end = value.indexOf('"', 1);
    if (end > 0) return { path: value.slice(1, end), args: value.slice(end + 1).trim() };
  }
  return { path: value, args: '' };
}

export async function readSteamShortcuts(accountDir: string): Promise<SteamShortcut[]> {
  let root: Record<string, unknown>;
  try {
    root = parseBinaryVdf(await readFile(join(accountDir, 'config', 'shortcuts.vdf')));
  } catch {
    return [];
  }
  const list = Object.values((root.shortcuts as Record<string, Record<string, unknown>>) ?? {});
  return list
    .filter((s) => typeof s.appid === 'number' && typeof s.appname === 'string' && s.appname.trim())
    .map((s) => {
      const appId = s.appid as number;
      const { path, args } = splitExe(String(s.exe ?? ''));
      const lastPlayed = Number(s.lastplaytime ?? 0);
      const rawTags = s.tags && typeof s.tags === 'object' ? Object.values(s.tags as Record<string, unknown>) : [];
      const tags = rawTags.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
      return {
        appId,
        gameId: ((BigInt(appId) << 32n) | SHORTCUT_GAMEID_FLAG).toString(),
        name: String(s.appname).trim(),
        exe: path,
        exeArgs: args,
        startDir: unquote(String(s.startdir ?? '')),
        launchOptions: String(s.launchoptions ?? '').trim(),
        hidden: Number(s.ishidden ?? 0) === 1,
        tags,
        lastPlayedAt: lastPlayed > 0 ? new Date(lastPlayed * 1000).toISOString() : undefined
      };
    });
}
