import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAchievements } from '@shared/types/achievements';
import { CeremonyEvent } from '@shared/types/ipc';
import {
  ceremoniesFromAchievements,
  CeremonyQueue,
  ceremonyFromJournalTransition,
  diffUnlockedAchievements
} from '../../src/main/services/achievements/ceremony';
import { useTempUserData } from '../helpers/electron-mock';
import { makeAchievements, makeGame } from '../helpers/fixtures';

type Db = typeof import('../../src/main/database/db')['db'];
type AchievementsService = typeof import('../../src/main/services/achievements/achievements.service')['achievementsService'];
type JournalModule = typeof import('../../src/main/services/profile/journal.service');

let db: Db;
let achievementsService: AchievementsService;
let journalService: JournalModule;

beforeEach(async () => {
  vi.resetModules();
  useTempUserData();
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  ({ achievementsService } = await import('../../src/main/services/achievements/achievements.service'));
  journalService = await import('../../src/main/services/profile/journal.service');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ceremony helpers & queue', () => {
  it('detecta apenas conquistas recém-desbloqueadas dentro da mesma fonte', () => {
    const first = makeAchievements('g1', 1);
    // Primeira sincronização (before = null) nunca dispara chuva de cerimônias
    expect(diffUnlockedAchievements(null, first)).toEqual([]);

    // Mudança de fonte (steam -> retroachievements) também não
    const retro: GameAchievements = { ...makeAchievements('g1', 2), source: 'retroachievements' };
    expect(diffUnlockedAchievements(first, retro)).toEqual([]);

    const updated = makeAchievements('g1', 2);
    updated.items[1] = { ...updated.items[1], unlockedAt: '2026-05-01T12:00:00.000Z' };
    expect(diffUnlockedAchievements(first, updated).map((i) => i.id)).toEqual(['b']);
  });

  it('agrupa quando muitas conquistas chegam juntas e inclui 100% no fim', () => {
    const game = makeGame({ id: 'g1', title: 'Celeste' });
    const four = Array.from({ length: 4 }, (_, i) => ({
      id: `a${i}`,
      name: `Passo ${i + 1}`,
      description: 'desc',
      iconUrl: '',
      unlocked: true,
      unlockedAt: `2026-05-01T0${i}:00:00.000Z`
    }));
    const events = ceremoniesFromAchievements(game, four, true);
    expect(events.map((e) => e.kind)).toEqual(['achievement', 'perfect']);
    expect(events[0]?.extraCount).toBe(3);
    expect(events[0]?.achievementName).toBe('Passo 4');
  });

  it('emite Zerado e 100% apenas na transição real do Diário', () => {
    const finished = makeGame({ id: 'g1', title: 'Hades', log: { status: 'finished' } });
    expect(ceremonyFromJournalTransition('playing', finished)?.kind).toBe('finished');
    expect(ceremonyFromJournalTransition('finished', finished)).toBeNull();
    expect(ceremonyFromJournalTransition('completed', finished)).toBeNull();

    const perfect = makeGame({ id: 'g1', title: 'Hades', log: { status: 'completed' } });
    expect(ceremonyFromJournalTransition('finished', perfect)?.kind).toBe('perfect');
  });

  it('guarda cerimônias durante jogo ativo e solta todas quando fecha', () => {
    const delivered: CeremonyEvent[] = [];
    const queue = new CeremonyQueue((ev) => delivered.push(ev));

    queue.enqueue({ id: '1', kind: 'achievement', gameId: 'g1', gameTitle: 'Game', achievementName: 'A' }, true);
    queue.enqueue({ id: '1', kind: 'achievement', gameId: 'g1', gameTitle: 'Game', achievementName: 'A' }, true);
    queue.enqueue({ id: '2', kind: 'finished', gameId: 'g1', gameTitle: 'Game' }, true);

    expect(delivered).toHaveLength(0);
    expect(queue.size()).toBe(2);

    queue.flush();
    expect(delivered.map((d) => d.id)).toEqual(['1', '2']);
    expect(queue.size()).toBe(0);
  });
});

describe('ceremony integration in achievements & journal services', () => {
  it('dispara evento ao marcar conquista, completar 100% e mudar status para Zerado', () => {
    const events: CeremonyEvent[] = [];
    achievementsService.setCeremonyListener((ev) => events.push(ev));
    journalService.setJournalCeremonyListener((ev) => events.push(ev));

    const game = makeGame({ id: 'ra-1', title: 'Chrono Trigger', platform: 'emulator', emulatorId: 'retroarch' });
    db.upsertGame(game);
    db.saveGameAchievements({
      gameId: game.id,
      source: 'retroachievements',
      total: 2,
      unlocked: 1,
      items: [
        { id: 'c1', name: 'Primeiro portal', description: '', iconUrl: '', unlocked: true, markable: true },
        { id: 'c2', name: 'Fogo no céu', description: '', iconUrl: '', unlocked: false, markable: true }
      ],
      syncedAt: '2026-01-01T00:00:00.000Z'
    });

    achievementsService.setManual(game.id, 'c2', true);
    expect(events.map((e) => e.kind)).toEqual(['achievement', 'perfect']);

    const game2 = makeGame({ id: 'pc-1', title: 'Hollow Knight' });
    db.upsertGame(game2);
    journalService.setGameLog(game2.id, { status: 'finished' });
    expect(events[2]).toMatchObject({ kind: 'finished', gameId: 'pc-1', gameTitle: 'Hollow Knight' });
  });
});
