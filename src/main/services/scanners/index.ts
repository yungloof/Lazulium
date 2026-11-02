import { Game, GamePlatform } from '@shared/types/game';
import { ScanResult } from '@shared/types/ipc';
import { db } from '../../database/db';
import { steamScanner } from './steam-scanner.service';
import { epicScanner } from './epic-scanner.service';
import { gogScanner } from './gog-scanner.service';
import { createEmulatorScanner } from './emulator-scanner.service';
import { createStandaloneScanner } from './standalone-scanner.service';
import { DetectedGame, PlatformScanner } from './scanner.types';

const SCANNERS: PlatformScanner[] = [
  steamScanner,
  epicScanner,
  gogScanner,
  createEmulatorScanner(() => db.getEmulatorConfigs()),
  createStandaloneScanner(() => db.getStandaloneDirectories())
];

// Combina o que o scanner detectou com o que já existe no banco, preservando
// favoritos, playtime, tags e artes escolhidas pelo usuário.
function mergeGame(detected: DetectedGame, existing: Game | null): Game {
  const now = new Date().toISOString();
  if (!existing) {
    return {
      ...detected,
      media: detected.media ?? {},
      isFavorite: false,
      isHidden: false,
      tags: [],
      totalPlaytimeSeconds: detected.initialPlaytimeSeconds ?? 0,
      lastPlayedAt: detected.lastPlayedAt,
      createdAt: now,
      updatedAt: now
    };
  }
  return {
    ...existing,
    ...detected,
    totalPlaytimeSeconds:
      existing.totalPlaytimeSeconds && existing.totalPlaytimeSeconds > 0
        ? Math.max(existing.totalPlaytimeSeconds, detected.initialPlaytimeSeconds ?? 0)
        : (detected.initialPlaytimeSeconds ?? existing.totalPlaytimeSeconds ?? 0),
    lastPlayedAt: existing.lastPlayedAt ?? detected.lastPlayedAt,
    media: { ...detected.media, ...existing.media },
    updatedAt: existing.updatedAt
  };
}

export async function scanLibraries(platforms?: GamePlatform[]): Promise<ScanResult> {
  const scanners = platforms ? SCANNERS.filter((s) => platforms.includes(s.platform)) : SCANNERS;
  const warnings: string[] = [];
  const merged: Game[] = [];
  let added = 0;
  let updated = 0;

  for (const scanner of scanners) {
    try {
      const result = await scanner.scan();
      warnings.push(...result.warnings);

      for (const detected of result.games) {
        const existing = db.getGameById(detected.id);
        const game = mergeGame(detected, existing);
        if (!existing) added++;
        else if (JSON.stringify(existing) !== JSON.stringify(game)) updated++;
        merged.push(game);
      }
    } catch (err) {
      const message = `${scanner.platform}: falha no scanner (${(err as Error).message})`;
      console.warn(`[Scanner] ${message}`);
      warnings.push(message);
    }
  }

  db.upsertGames(merged);
  for (const w of warnings) console.warn(`[Scanner] ${w}`);

  const games = db.getGames();
  return { added, updated, total: games.length, games, warnings };
}
