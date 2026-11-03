import { Game, GamePlatform } from '@shared/types/game';
import { ScanResult } from '@shared/types/ipc';
import { db } from '../../database/db';
import { steamScanner } from './steam-scanner.service';
import { epicScanner } from './epic-scanner.service';
import { gogScanner } from './gog-scanner.service';
import { riotScanner } from './riot-scanner.service';
import { xboxScanner } from './xbox-scanner.service';
import { createEmulatorScanner } from './emulator-scanner.service';
import { detectEmulators } from './emulator-detect.service';
import { createStandaloneScanner } from './standalone-scanner.service';
import { DetectedGame, PlatformScanner } from './scanner.types';
import { normalizeKey } from '../cloudsync/save-locator.service';
import { isSteamPlaceholderTitle, steamNamesService } from './steam-names.service';
import { existsSync } from 'fs';

const SCANNERS: PlatformScanner[] = [
  steamScanner,
  epicScanner,
  gogScanner,
  riotScanner,
  xboxScanner,
  createEmulatorScanner(
    () => db.getEmulatorConfigs(),
    () => db.getGames().filter((g) => !g.id.startsWith('emu-')),
    () => detectEmulators()
  ),
  createStandaloneScanner(() => db.getStandaloneDirectories())
];

// Combina o que o scanner detectou com o que já existe no banco, preservando
// favoritos, playtime, tags e artes escolhidas pelo usuário.
function mergeGame(detected: DetectedGame, existing: Game | null): Game {
  const now = new Date().toISOString();
  if (!existing) {
    return {
      ...detected,
      isInstalled: detected.isInstalled ?? true,
      media: detected.media ?? {},
      isFavorite: false,
      isHidden: false,
      tags: [],
      totalPlaytimeSeconds: detected.initialPlaytimeSeconds ?? 0,
      sourcePlaytimeSeconds: detected.initialPlaytimeSeconds,
      lastPlayedAt: detected.lastPlayedAt,
      createdAt: now,
      updatedAt: now
    };
  }
  const source = detected.initialPlaytimeSeconds ?? existing.sourcePlaytimeSeconds;
  return {
    ...existing,
    ...detected,
    title: isSteamPlaceholderTitle(detected.title) ? existing.title : detected.title,
    isInstalled: detected.isInstalled ?? true,
    sourcePlaytimeSeconds: source,
    // Launcher + ajuste manual; nunca menos do que já está contado (sessões do Lazulium, edições)
    totalPlaytimeSeconds: Math.max(existing.totalPlaytimeSeconds ?? 0, (source ?? 0) + (existing.playtimeAdjustmentSeconds ?? 0)),
    // A data mais recente entre a do Lazulium e a do launcher (jogou pela Steam sem o Lazulium aberto)
    lastPlayedAt: [existing.lastPlayedAt, detected.lastPlayedAt].filter(Boolean).sort().pop(),
    media: { ...detected.media, ...existing.media },
    updatedAt: existing.updatedAt
  };
}

// Qual scanner responde por um jogo. Registros manuais não têm dono: nunca são alterados por scan.
function scannerOwner(game: Game): GamePlatform | null {
  if (game.manualEntry || game.id.startsWith('custom-')) return null;
  return game.id.startsWith('steam-') ? 'steam' : game.platform;
}

// Scans rodam em fila: o da abertura do app e o do botão "Escanear" (ou o da primeira execução)
// não disputam o PowerShell/registro nem gravam o banco ao mesmo tempo
let scanQueue: Promise<unknown> = Promise.resolve();

export function scanLibraries(platforms?: GamePlatform[]): Promise<ScanResult> {
  const run = scanQueue.catch(() => undefined).then(() => runScan(platforms));
  scanQueue = run;
  return run;
}

async function runScan(platforms?: GamePlatform[]): Promise<ScanResult> {
  const scanners = platforms ? SCANNERS.filter((s) => platforms.includes(s.platform)) : SCANNERS;
  const warnings: string[] = [];
  const detectedGames: DetectedGame[] = [];
  const completedPlatforms = new Set<GamePlatform>();
  let added = 0;
  let updated = 0;

  for (const scanner of scanners) {
    try {
      const result = await scanner.scan();
      warnings.push(...result.warnings);
      detectedGames.push(...result.games);
      // Lista vazia com aviso (ex: Steam não encontrada) não prova que os jogos saíram do PC
      if (result.games.length > 0 || result.warnings.length === 0) completedPlatforms.add(scanner.platform);
    } catch (err) {
      const message = `${scanner.platform}: falha no scanner (${(err as Error).message})`;
      console.warn(`[Scanner] ${message}`);
      warnings.push(message);
    }
  }

  // Junta com o banco só depois de todos os scanners (alguns levam segundos): assim artes trocadas,
  // favoritos e sessões registradas durante o scan não são sobrescritos por uma leitura antiga.
  // Daqui até o upsert não há await, então nada muda no meio.
  const merged: Game[] = [];
  const detectedIds = new Set(detectedGames.map((d) => d.id));
  for (const detected of detectedGames) {
    let existing = db.getGameById(detected.id);
    if (!existing && detected.isInstalled !== false) {
      // Reinstalado ou movido para outra pasta (ID novo): continua o histórico do registro antigo
      const key = normalizeKey(detected.title);
      const previous = db
        .getGames()
        .find((g) => !detectedIds.has(g.id) && scannerOwner(g) === detected.platform && normalizeKey(g.title) === key);
      if (previous) {
        db.moveGameData(previous.id, detected.id);
        existing = { ...previous, id: detected.id };
        console.log(`[Scanner] ${detected.title}: histórico levado para a nova instalação`);
      }
    }
    const game = mergeGame(detected, existing);
    if (!existing) added++;
    else if (JSON.stringify(existing) !== JSON.stringify(game)) updated++;
    merged.push(game);
  }

  // Desinstalados nunca são apagados: horas, conquistas e registro continuam guardados
  for (const game of db.getGames()) {
    if (detectedIds.has(game.id) || game.manualEntry) continue;
    const owner = scannerOwner(game);
    const stillThere = owner ? !completedPlatforms.has(owner) : !game.executablePath || existsSync(game.executablePath);
    const installed = game.isInstalled !== false && stillThere;
    if (installed !== (game.isInstalled !== false)) {
      merged.push({ ...game, isInstalled: installed });
      updated++;
    }
  }

  db.upsertGames(merged);
  void steamNamesService.resolveMissing();
  for (const w of warnings) console.warn(`[Scanner] ${w}`);

  const games = db.getGames();
  return { added, updated, total: games.length, games, warnings };
}
