import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Game } from '@shared/types/game';
import { GameAchievements } from '@shared/types/achievements';

export function makeGame(overrides: Partial<Game> & Pick<Game, 'id'>): Game {
  return {
    title: overrides.id,
    platform: 'steam',
    executablePath: '',
    media: {},
    isFavorite: false,
    isHidden: false,
    tags: [],
    totalPlaytimeSeconds: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

export function makeAchievements(gameId: string, unlocked = 1): GameAchievements {
  return {
    gameId,
    source: 'steam',
    total: 2,
    unlocked,
    items: [
      { id: 'a', name: 'Primeira', description: '', iconUrl: '', unlocked: unlocked > 0 },
      { id: 'b', name: 'Segunda', description: '', iconUrl: '', unlocked: unlocked > 1 }
    ],
    syncedAt: '2026-01-01T00:00:00.000Z'
  };
}

export const storageDir = (userData: string) => join(userData, 'storage');
export const dbFile = (userData: string) => join(storageDir(userData), 'lazulium_db.json');
export const achievementsFile = (userData: string) => join(storageDir(userData), 'lazulium_achievements.json');

export const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));

// Grava um banco direto no disco, como uma versão anterior do app teria deixado
export function writeDbFile(userData: string, data: Record<string, unknown>): void {
  mkdirSync(storageDir(userData), { recursive: true });
  writeFileSync(dbFile(userData), JSON.stringify({ games: [], settings: {}, ...data }), 'utf-8');
}

// As cifragens do dublê terminam no próximo ciclo: espera antes de conferir o que foi para o disco
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
