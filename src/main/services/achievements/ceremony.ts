import { Achievement, GameAchievements } from '@shared/types/achievements';
import { Game, GameLogStatus } from '@shared/types/game';
import { CeremonyEvent } from '@shared/types/ipc';

const MAX_ACHIEVEMENT_CEREMONIES = 3;
const MAX_PENDING = 20;

const baseGameInfo = (game: Game) => ({
  gameId: game.id,
  gameTitle: game.title,
  coverUrl: game.media?.coverUrl
});

/**
 * Finds achievements that transitioned from locked to unlocked when updating an existing cached list.
 * Ignores initial cache population or source changes (e.g., milestones -> Steam) to prevent alert floods.
 */
export function diffUnlockedAchievements(before: GameAchievements | null, after: GameAchievements): Achievement[] {
  if (!before || before.total === 0 || before.source !== after.source) return [];
  const prevState = new Map(before.items.map((item) => [item.id, item.unlocked]));
  return after.items
    .filter((item) => item.unlocked && prevState.get(item.id) === false)
    .sort((a, b) => (a.unlockedAt ?? '').localeCompare(b.unlockedAt ?? ''));
}

/**
 * Builds ceremony payloads from newly unlocked achievements and/or reaching 100% completion.
 */
export function ceremoniesFromAchievements(game: Game, unlocked: Achievement[], becamePerfect: boolean): CeremonyEvent[] {
  const events: CeremonyEvent[] = [];
  if (unlocked.length > 0) {
    if (unlocked.length <= MAX_ACHIEVEMENT_CEREMONIES) {
      for (const item of unlocked) {
        events.push({
          id: `ach:${game.id}:${item.id}`,
          kind: 'achievement',
          ...baseGameInfo(game),
          achievementName: item.name,
          achievementDescription: item.description,
          achievementIconUrl: item.iconUrl || undefined
        });
      }
    } else {
      const latest = unlocked[unlocked.length - 1];
      events.push({
        id: `ach:${game.id}:${latest.id}:batch:${unlocked.length}`,
        kind: 'achievement',
        ...baseGameInfo(game),
        achievementName: latest.name,
        achievementDescription: latest.description,
        achievementIconUrl: latest.iconUrl || undefined,
        extraCount: unlocked.length - 1
      });
    }
  }
  if (becamePerfect) {
    events.push({
      id: `perfect:${game.id}`,
      kind: 'perfect',
      ...baseGameInfo(game)
    });
  }
  return events;
}

/**
 * Builds a ceremony event when journal status transitions into "Zerado" or "100%".
 */
export function ceremonyFromJournalTransition(beforeStatus: GameLogStatus | undefined, afterGame: Game): CeremonyEvent | null {
  const nextStatus = afterGame.log?.status;
  if (nextStatus === 'completed' && beforeStatus !== 'completed') {
    return {
      id: `perfect:${afterGame.id}`,
      kind: 'perfect',
      ...baseGameInfo(afterGame)
    };
  }
  if (nextStatus === 'finished' && beforeStatus !== 'finished' && beforeStatus !== 'completed') {
    return {
      id: `finished:${afterGame.id}`,
      kind: 'finished',
      ...baseGameInfo(afterGame)
    };
  }
  return null;
}

/**
 * Queues ceremony events while a fullscreen/active game is running and flushes them once it closes.
 */
export class CeremonyQueue {
  private pending: CeremonyEvent[] = [];
  private seenIds = new Set<string>();

  constructor(private deliver: (event: CeremonyEvent) => void) {}

  enqueue(event: CeremonyEvent, defer: boolean): void {
    if (!defer && this.pending.length === 0) {
      this.deliver(event);
      return;
    }
    if (this.seenIds.has(event.id)) return;
    if (this.pending.length >= MAX_PENDING) {
      const dropped = this.pending.shift();
      if (dropped) this.seenIds.delete(dropped.id);
    }
    this.pending.push(event);
    this.seenIds.add(event.id);
  }

  flush(): number {
    if (this.pending.length === 0) return 0;
    const toSend = this.pending.splice(0, this.pending.length);
    this.seenIds.clear();
    for (const event of toSend) this.deliver(event);
    return toSend.length;
  }

  size(): number {
    return this.pending.length;
  }
}
