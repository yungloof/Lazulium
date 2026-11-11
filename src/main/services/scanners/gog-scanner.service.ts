import { existsSync } from 'fs';
import { join, normalize } from 'path';
import { execFile } from 'child_process';
import { readRegistrySubkeyValues } from './registry';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

const GOG_REGISTRY_KEYS = ['HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', 'HKLM\\SOFTWARE\\GOG.com\\Games'];
const GALAXY_DB_PATH = join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'GOG.com', 'Galaxy', 'storage', 'galaxy-2.0.db');

interface GalaxyStats {
  playtimeSeconds: number;
  lastPlayedAt?: string;
}

type RawGalaxyRow = { minutes?: number; lastPlayed?: string | null };

// C# P/Invoke sobre winsqlite3.dll nativa do Windows 10/11 (zero dependências externas)
const GALAXY_POWERSHELL_SCRIPT = `
$ProgressPreference = 'SilentlyContinue'
$dbPath = $env:LAZULIUM_GALAXY_DB
$sysRoot = if ($env:SystemRoot) { $env:SystemRoot } else { 'C:\\Windows' }
$dllPath = Join-Path $sysRoot 'System32\\winsqlite3.dll'
if (-not $dbPath -or -not (Test-Path -LiteralPath $dbPath) -or -not (Test-Path -LiteralPath $dllPath)) {
  Write-Output '{}'
  exit 0
}
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class GalaxySqliteReader {
  [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int sqlite3_open_v2(byte[] filename, out IntPtr ppDb, int flags, IntPtr zVfs);

  [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int sqlite3_close_v2(IntPtr db);

  [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int sqlite3_busy_timeout(IntPtr db, int ms);

  [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int sqlite3_prepare_v2(IntPtr db, byte[] zSql, int nByte, out IntPtr ppStmt, IntPtr pzTail);

  [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int sqlite3_step(IntPtr stmt);

  [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int sqlite3_finalize(IntPtr stmt);

  [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern IntPtr sqlite3_column_text(IntPtr stmt, int iCol);

  [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern long sqlite3_column_int64(IntPtr stmt, int iCol);

  private static byte[] ToUtf8(string s) {
    var b = Encoding.UTF8.GetBytes(s);
    var res = new byte[b.Length + 1];
    Buffer.BlockCopy(b, 0, res, 0, b.Length);
    return res;
  }

  private static string ReadUtf8(IntPtr ptr) {
    if (ptr == IntPtr.Zero) return null;
    int len = 0;
    while (Marshal.ReadByte(ptr, len) != 0) len++;
    if (len == 0) return "";
    var buf = new byte[len];
    Marshal.Copy(ptr, buf, 0, len);
    return Encoding.UTF8.GetString(buf);
  }

  public static Dictionary<string, object[]> Read(string dbPath) {
    var map = new Dictionary<string, object[]>();
    IntPtr db = IntPtr.Zero;
    if (sqlite3_open_v2(ToUtf8(dbPath), out db, 1, IntPtr.Zero) != 0 || db == IntPtr.Zero) {
      if (db != IntPtr.Zero) sqlite3_close_v2(db);
      return map;
    }
    try {
      sqlite3_busy_timeout(db, 1500);
      IntPtr stmt = IntPtr.Zero;
      if (sqlite3_prepare_v2(db, ToUtf8("SELECT substr(releaseKey, 5), MAX(minutesInGame) FROM GameTimes WHERE releaseKey LIKE 'gog!_%' ESCAPE '!' GROUP BY releaseKey"), -1, out stmt, IntPtr.Zero) == 0) {
        try {
          while (sqlite3_step(stmt) == 100) {
            string id = ReadUtf8(sqlite3_column_text(stmt, 0));
            long mins = sqlite3_column_int64(stmt, 1);
            if (!string.IsNullOrEmpty(id)) map[id] = new object[] { mins, null };
          }
        } finally { sqlite3_finalize(stmt); }
      }
      stmt = IntPtr.Zero;
      if (sqlite3_prepare_v2(db, ToUtf8("SELECT substr(gameReleaseKey, 5), MAX(lastPlayedDate) FROM LastPlayedDates WHERE gameReleaseKey LIKE 'gog!_%' ESCAPE '!' GROUP BY gameReleaseKey"), -1, out stmt, IntPtr.Zero) == 0) {
        try {
          while (sqlite3_step(stmt) == 100) {
            string id = ReadUtf8(sqlite3_column_text(stmt, 0));
            string dt = ReadUtf8(sqlite3_column_text(stmt, 1));
            if (string.IsNullOrEmpty(id)) continue;
            if (!map.ContainsKey(id)) map[id] = new object[] { 0L, dt };
            else map[id][1] = dt;
          }
        } finally { sqlite3_finalize(stmt); }
      }
    } finally {
      sqlite3_close_v2(db);
    }
    return map;
  }
}
"@
$data = [GalaxySqliteReader]::Read($dbPath)
$out = @{}
foreach ($kv in $data.GetEnumerator()) {
  $out[$kv.Key] = @{ minutes = $kv.Value[0]; lastPlayed = $kv.Value[1] }
}
$out | ConvertTo-Json -Compress
`;

function runExecFile(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env, windowsHide: true, timeout: 6000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

// Lê o histórico de tempo jogado e última sessão do banco local do GOG Galaxy 2.0 (se disponível)
async function readGalaxyPlaytimes(): Promise<Map<string, GalaxyStats>> {
  const map = new Map<string, GalaxyStats>();
  if (!existsSync(GALAXY_DB_PATH)) return map;

  const childEnv = { ...process.env, LAZULIUM_GALAXY_DB: GALAXY_DB_PATH };
  let parsed: Record<string, RawGalaxyRow> | null = null;

  // 1. Tenta winsqlite3.dll nativa via PowerShell (não depende de Python instalado)
  if (process.platform === 'win32') {
    try {
      const encoded = Buffer.from(GALAXY_POWERSHELL_SCRIPT, 'utf16le').toString('base64');
      const stdout = await runExecFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], childEnv);
      const trimmed = stdout.trim();
      if (trimmed) {
        parsed = JSON.parse(trimmed) as Record<string, RawGalaxyRow>;
      }
    } catch {
      // Segue para o fallback via Python se PowerShell/winsqlite3 falhar
    }
  }

  // 2. Fallback via Python (quando disponível)
  if (!parsed) {
    const pythonScript = [
      'import os, sqlite3, json',
      'try:',
      '  path = os.environ["LAZULIUM_GALAXY_DB"].replace("\\\\", "/")',
      '  c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)',
      '  cur = c.cursor()',
      '  times = dict(cur.execute("SELECT substr(releaseKey, 5), MAX(minutesInGame) FROM GameTimes WHERE releaseKey LIKE \'gog!_%\' ESCAPE \'!\' GROUP BY releaseKey").fetchall())',
      '  dates = dict(cur.execute("SELECT substr(gameReleaseKey, 5), MAX(lastPlayedDate) FROM LastPlayedDates WHERE gameReleaseKey LIKE \'gog!_%\' ESCAPE \'!\' GROUP BY gameReleaseKey").fetchall())',
      '  keys = set(times.keys()) | set(dates.keys())',
      '  res = {k: {"minutes": times.get(k, 0), "lastPlayed": dates.get(k)} for k in keys}',
      '  print(json.dumps(res))',
      'except Exception:',
      '  print("{}")'
    ].join('\n');

    try {
      const stdout = await runExecFile('python', ['-c', pythonScript], childEnv);
      const trimmed = stdout.trim();
      if (trimmed) {
        parsed = JSON.parse(trimmed) as Record<string, RawGalaxyRow>;
      }
    } catch (err) {
      console.log('[Scanner:GOG] Banco do Galaxy 2.0 não consultado:', (err as Error).message);
    }
  }

  if (!parsed) return map;

  for (const [gameId, item] of Object.entries(parsed)) {
    const minutes = Math.max(0, Number(item.minutes ?? 0));
    let lastPlayedAt: string | undefined;
    if (item.lastPlayed) {
      const ts = Date.parse(item.lastPlayed);
      if (!Number.isNaN(ts)) {
        lastPlayedAt = new Date(ts).toISOString();
      }
    }
    map.set(gameId, {
      playtimeSeconds: Math.round(minutes * 60),
      lastPlayedAt
    });
  }

  return map;
}

// Cada jogo instalado pelo GOG (Galaxy ou instalador avulso) tem uma subchave com nome, pasta e executável
function registryToGame(subkey: string, values: Record<string, string>): DetectedGame | null {
  const gameId = values['gameid'] || values['productid'] || subkey.split('\\').pop() || '';
  const gameName = values['gamename'];
  if (!gameId || !gameName) return null;

  const installPath = values['path'] ? normalize(values['path']) : undefined;
  return {
    id: `gog-${gameId}`,
    title: gameName,
    platform: 'gog',
    platformGameId: gameId,
    executablePath: values['exe'] ? normalize(values['exe']) : '',
    launchArguments: values['launchparam']?.trim() || undefined,
    launchUri: `goggalaxy://openGameView/${gameId}`,
    workingDirectory: values['workingdir'] ? normalize(values['workingdir']) : installPath,
    installPath
  };
}

export const gogScanner: PlatformScanner = {
  platform: 'gog',

  async scan(): Promise<PlatformScanResult> {
    const warnings: string[] = [];
    const games = new Map<string, DetectedGame>();

    for (const rootKey of GOG_REGISTRY_KEYS) {
      for (const [subkey, values] of await readRegistrySubkeyValues(rootKey)) {
        try {
          const game = registryToGame(subkey, values);
          if (game && !games.has(game.id)) games.set(game.id, game);
        } catch (err) {
          warnings.push(`GOG: não consegui ler um jogo do registro (${subkey.split('\\').pop()}).`);
          console.warn(`[Scanner:GOG] ${subkey}:`, (err as Error).message);
        }
      }
    }

    const galaxyStats = await readGalaxyPlaytimes();
    for (const game of games.values()) {
      if (!game.platformGameId) continue;
      const stats = galaxyStats.get(game.platformGameId);
      if (stats) {
        if (stats.playtimeSeconds > 0) game.initialPlaytimeSeconds = stats.playtimeSeconds;
        if (stats.lastPlayedAt) game.lastPlayedAt = stats.lastPlayedAt;
      }
    }

    console.log(games.size === 0 ? '[Scanner:GOG] Nenhum jogo instalado pelo GOG encontrado' : `[Scanner:GOG] ${games.size} jogos`);
    return { games: [...games.values()], warnings };
  }
};
