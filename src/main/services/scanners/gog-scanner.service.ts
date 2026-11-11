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

// Lê o histórico de tempo jogado e última sessão do banco local do GOG Galaxy 2.0 (se disponível)
async function readGalaxyPlaytimes(): Promise<Map<string, GalaxyStats>> {
  const map = new Map<string, GalaxyStats>();
  if (!existsSync(GALAXY_DB_PATH)) return map;

  const pythonScript = [
    'import sqlite3, json',
    'try:',
    `  c = sqlite3.connect(r"file:${GALAXY_DB_PATH.replace(/\\/g, '/')}?mode=ro", uri=True)`,
    '  cur = c.cursor()',
    '  times = dict(cur.execute("SELECT releaseKey, minutesInGame FROM GameTimes WHERE releaseKey LIKE \'gog_%\'").fetchall())',
    '  dates = dict(cur.execute("SELECT gameReleaseKey, lastPlayedDate FROM LastPlayedDates WHERE gameReleaseKey LIKE \'gog_%\'").fetchall())',
    '  keys = set(times.keys()) | set(dates.keys())',
    '  res = {k.replace("gog_", ""): {"minutes": times.get(k, 0), "lastPlayed": dates.get(k)} for k in keys}',
    '  print(json.dumps(res))',
    'except Exception:',
    '  print("{}")'
  ].join('\n');

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile('python', ['-c', pythonScript], { windowsHide: true, timeout: 5000 }, (err, out) => {
        if (err) reject(err);
        else resolve(out);
      });
    });

    const parsed = JSON.parse(stdout.trim()) as Record<string, { minutes: number; lastPlayed?: string | null }>;
    for (const [gameId, item] of Object.entries(parsed)) {
      const minutes = Number(item.minutes ?? 0);
      let lastPlayedAt: string | undefined;
      if (item.lastPlayed) {
        const parsedDate = new Date(item.lastPlayed);
        if (!isNaN(parsedDate.getTime())) {
          lastPlayedAt = parsedDate.toISOString();
        }
      }
      map.set(gameId, {
        playtimeSeconds: minutes * 60,
        lastPlayedAt
      });
    }
  } catch (err) {
    // Python ausente ou arquivo bloqueado: segue sem histórico do Galaxy sem quebrar
    console.log('[Scanner:GOG] Banco do Galaxy 2.0 não consultado:', (err as Error).message);
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
