import { Game, GamePlatform, isJournalEntry } from '@shared/types/game';
import { ScanResult } from '@shared/types/ipc';
import { db } from '../../database/db';
import { steamScanner } from './steam-scanner.service';
import { epicScanner } from './epic-scanner.service';
import { gogScanner } from './gog-scanner.service';
import { riotScanner } from './riot-scanner.service';
import { xboxScanner } from './xbox-scanner.service';
import { battlenetScanner } from './battlenet-scanner.service';
import { eaScanner } from './ea-scanner.service';
import { ubisoftScanner } from './ubisoft-scanner.service';
import { createEmulatorScanner } from './emulator-scanner.service';
import { detectEmulators } from './emulator-detect.service';
import { commonGameFolders, createStandaloneScanner } from './standalone-scanner.service';
import { DetectedGame, PlatformScanner } from './scanner.types';
import { normalizeKey } from '../cloudsync/save-locator.service';
import { isSteamPlaceholderTitle, steamNamesService } from './steam-names.service';
import { existsSync } from 'fs';
import { dirname } from 'path';

const SCANNERS: PlatformScanner[] = [
  steamScanner,
  epicScanner,
  gogScanner,
  riotScanner,
  xboxScanner,
  battlenetScanner,
  eaScanner,
  ubisoftScanner,
  createEmulatorScanner(
    () => db.getEmulatorConfigs(),
    () => db.getGames().filter((g) => !g.id.startsWith('emu-')),
    () => detectEmulators(true)
  ),
  createStandaloneScanner(() => [...db.getStandaloneDirectories(), ...commonGameFolders()])
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
    title: existing.customTitle ?? (isSteamPlaceholderTitle(detected.title) ? existing.title : detected.title),
    detectedTitle: existing.customTitle && !isSteamPlaceholderTitle(detected.title) ? detected.title : existing.detectedTitle,
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

const normalizeFolder = (path: string) => path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

// Pasta que já tem jogo de outra origem (atalho da Steam, Epic, GOG) não vira uma segunda entrada
function dropCoveredFolders(detected: DetectedGame[]): DetectedGame[] {
  const isLoose = (game: Pick<Game, 'id'>) => game.id.startsWith('standalone-') || game.id.startsWith('custom-');
  const owned = [...detected, ...db.getGames()]
    .filter((game) => !isLoose(game) && game.isInstalled !== false)
    .flatMap((game) => [game.installPath, game.platform === 'steam' || !game.executablePath ? undefined : dirname(game.executablePath)])
    .filter((path): path is string => !!path)
    .map(normalizeFolder);
  return detected.filter((game) => {
    if (!game.id.startsWith('standalone-') || !game.installPath) return true;
    const folder = normalizeFolder(game.installPath);
    return !owned.some((path) => path === folder || path.startsWith(`${folder}\\`));
  });
}

// Só herda o histórico quem saiu mesmo do PC e não tem dono próprio: registro do Diário, jogo adicionado à mão e
// jogo de loja (a conta continua tendo) nunca somem porque apareceu outro jogo com o mesmo nome.
function canHandOverHistory(game: Game, detected: DetectedGame): boolean {
  if (game.manualEntry || game.id.startsWith('custom-')) return false;
  if (scannerOwner(game) === detected.platform) return true;
  const isLocalCopy = /^(standalone-|emu-|steam-shortcut-)/.test(game.id);
  return isLocalCopy && (game.isInstalled === false || !game.executablePath || !existsSync(game.executablePath));
}

function hasNoPlayerData(game: Game): boolean {
  return !game.totalPlaytimeSeconds && !game.isFavorite && !game.tags?.length && !isJournalEntry(game) && !db.getGameAchievements(game.id)?.unlocked && !db.getPlaytimeSessions(game.id).length;
}

const PLATFORM_LABELS: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG',
  riot: 'Riot',
  xbox: 'Xbox',
  battlenet: 'Battle.net',
  ea: 'EA App',
  ubisoft: 'Ubisoft Connect',
  emulator: 'Emuladores',
  standalone: 'Jogos soltos'
};

type ScanOutcome = { platform: GamePlatform; ms: number } & ({ games: DetectedGame[]; warnings: string[] } | { error: Error });

// Cada scanner isolado: um que quebre vira um aviso e os outros seguem
async function runScanner(scanner: PlatformScanner): Promise<ScanOutcome> {
  const startedAt = Date.now();
  try {
    const result = await scanner.scan();
    return { platform: scanner.platform, ms: Date.now() - startedAt, games: result.games, warnings: result.warnings };
  } catch (err) {
    return { platform: scanner.platform, ms: Date.now() - startedAt, error: err as Error };
  }
}

export interface ScanWithChanges {
  result: ScanResult;
  changed: Game[];                  // Jogos criados ou alterados por este scan (para avisar a interface)
}

// Scans rodam em fila: o da abertura do app e o do botão "Escanear" (ou o da primeira execução)
// não gravam o banco ao mesmo tempo nem juntam resultados de leituras diferentes
let scanQueue: Promise<unknown> = Promise.resolve();

export function scanLibrariesWithChanges(platforms?: GamePlatform[]): Promise<ScanWithChanges> {
  const run = scanQueue.catch(() => undefined).then(() => runScan(platforms));
  scanQueue = run;
  return run;
}

export async function scanLibraries(platforms?: GamePlatform[]): Promise<ScanResult> {
  return (await scanLibrariesWithChanges(platforms)).result;
}

async function runScan(platforms?: GamePlatform[]): Promise<ScanWithChanges> {
  const scanners = platforms ? SCANNERS.filter((s) => platforms.includes(s.platform)) : SCANNERS;
  const warnings: string[] = [];
  let detectedGames: DetectedGame[] = [];
  const completedPlatforms = new Set<GamePlatform>();
  const changed: Game[] = [];
  let added = 0;
  let updated = 0;
  const scanStartedAt = Date.now();

  // Os scanners leem fontes independentes (registro, pastas, PowerShell do Xbox): rodam ao mesmo tempo e
  // o tempo total vira o do mais lento. O resultado é juntado na ordem fixa da lista, como antes.
  const outcomes = await Promise.all(scanners.map(runScanner));
  for (const outcome of outcomes) {
    if ('error' in outcome) {
      console.warn(`[Scanner] ${outcome.platform} falhou:`, outcome.error);
      warnings.push(`${PLATFORM_LABELS[outcome.platform]}: a busca falhou desta vez. Os jogos já listados continuam como estavam.`);
      continue;
    }
    warnings.push(...outcome.warnings);
    detectedGames.push(...outcome.games);
    // Lista vazia com aviso (ex: Steam não encontrada) não prova que os jogos saíram do PC
    if (outcome.games.length > 0 || outcome.warnings.length === 0) completedPlatforms.add(outcome.platform);
  }
  const timings = outcomes.map((o) => `${o.platform} ${o.ms} ms`).join(', ');

  detectedGames = dropCoveredFolders(detectedGames);

  // Junta com o banco só depois de todos os scanners (alguns levam segundos): assim artes trocadas,
  // favoritos e sessões registradas durante o scan não são sobrescritos por uma leitura antiga.
  // Daqui até o upsert não há await, então nada muda no meio.
  const merged: Game[] = [];
  const detectedIds = new Set(detectedGames.map((d) => d.id));
  for (const detected of detectedGames) {
    let existing = db.getGameById(detected.id);
    const key = normalizeKey(detected.title);

    // Procura registro anterior do mesmo jogo (ex: trocou de port standalone para emulador,
    // atalho da Steam ou reinstalou em outra pasta): migra histórico, tempo de jogo, registro e artes.
    const previous = db
      .getGames()
      .find(
        (g) => g.id !== detected.id && !detectedIds.has(g.id) && normalizeKey(g.detectedTitle ?? g.title) === key && canHandOverHistory(g, detected)
      );

    if (previous && detected.isInstalled !== false) {
      db.moveGameData(previous.id, detected.id);
      if (existing) {
        existing.log = existing.log || previous.log;
        existing.manualPlatform = existing.manualPlatform || previous.manualPlatform;
        existing.totalPlaytimeSeconds = Math.max(existing.totalPlaytimeSeconds || 0, previous.totalPlaytimeSeconds || 0);
        existing.lastPlayedAt = [existing.lastPlayedAt, previous.lastPlayedAt].filter(Boolean).sort().pop();
        existing.isFavorite = existing.isFavorite || previous.isFavorite;
        existing.media = { ...previous.media, ...existing.media };
      } else {
        existing = { ...previous, id: detected.id };
      }
      console.log(`[Scanner] ${detected.title}: histórico e dados levados para a nova instalação (${previous.platform} -> ${detected.platform})`);
    }

    const game = mergeGame(detected, existing);
    if (!existing) {
      added++;
      changed.push(game);
    } else if (JSON.stringify(existing) !== JSON.stringify(game)) {
      updated++;
      changed.push(game);
    }
    merged.push(game);
  }

  // Desinstalados nunca são apagados: horas, conquistas e registro continuam guardados
  for (const game of db.getGames()) {
    if (detectedIds.has(game.id) || game.manualEntry) continue;
    // A não ser a ROM achada na pasta que saiu do PC sem nada do jogador: não há histórico a guardar
    if (game.id.startsWith('emu-') && completedPlatforms.has('emulator') && hasNoPlayerData(game)) {
      db.deleteGame(game.id);
      updated++;
      continue;
    }
    const owner = scannerOwner(game);
    const stillThere = owner ? !completedPlatforms.has(owner) : !game.executablePath || existsSync(game.executablePath);
    const installed = game.isInstalled !== false && stillThere;
    if (installed !== (game.isInstalled !== false)) {
      const flipped = { ...game, isInstalled: installed };
      merged.push(flipped);
      changed.push(flipped);
      updated++;
    }
  }

  db.upsertGames(merged);
  void steamNamesService.resolveMissing();
  for (const w of warnings) console.warn(`[Scanner] ${w}`);
  console.log(`[Scanner] Concluído em ${Date.now() - scanStartedAt} ms (${timings})`);

  const games = db.getGames();
  return { result: { added, updated, total: games.length, games, warnings }, changed };
}
