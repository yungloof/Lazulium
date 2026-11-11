import { randomUUID } from 'crypto';
import { ActivityEvent, StoredActivity, StoredActivityKind } from '@shared/types/activity';
import { Game, GameLog, GameLogStatus } from '@shared/types/game';
import { db } from '../../database/db';

// Linha do tempo do jogador. Hoje alimenta o perfil; na 2.0 é o que cada pessoa escolhe mandar para o feed dos amigos.
// Sessões e conquistas já têm data própria e são lidas na hora; mudanças do Diário não, então ficam gravadas.

const STATUS_EVENT: Partial<Record<GameLogStatus, StoredActivityKind>> = {
  playing: 'started',
  finished: 'finished',
  completed: 'completed',
  dropped: 'dropped'
};
// Editar a nota ou a resenha várias vezes seguidas vira um evento só
const MERGE_WINDOW_MS = 6 * 60 * 60 * 1000;
const MIN_PLAYED_SECONDS = 5 * 60;          // Abrir e fechar o jogo não é "jogou"
const DEFAULT_LIMIT = 30;
const localDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const MAX_LIMIT = 200;

// Compara o Diário antes e depois de salvar e grava o que mudou
export function recordLogChange(gameId: string, before: GameLog | undefined, after: GameLog | undefined, at = new Date()): void {
  const iso = at.toISOString();
  const entries: StoredActivity[] = [];
  const statusKind = after?.status && after.status !== before?.status ? STATUS_EVENT[after.status] : undefined;
  if (statusKind) entries.push({ id: randomUUID(), kind: statusKind, gameId, at: iso });
  if (after?.rating && after.rating !== before?.rating) entries.push({ id: randomUUID(), kind: 'rated', gameId, at: iso, rating: after.rating });
  if (after?.review && after.review !== before?.review) entries.push({ id: randomUUID(), kind: 'reviewed', gameId, at: iso });
  if (entries.length === 0) return;

  const merged = new Set(entries.map((e) => e.kind));
  const stale = db
    .getActivityLog()
    .filter((e) => e.gameId === gameId && merged.has(e.kind) && at.getTime() - Date.parse(e.at) < MERGE_WINDOW_MS)
    .map((e) => e.id);
  db.replaceActivity(stale, entries);
}

const gameInfo = (game: Game) => ({ gameId: game.id, gameTitle: game.title, coverUrl: game.media?.coverUrl });

// Agrupa por jogo e dia (várias sessões ou conquistas no mesmo dia viram uma linha)
function byGameAndDay<T>(items: T[], gameId: (item: T) => string, at: (item: T) => string) {
  const groups = new Map<string, { gameId: string; latest: string; items: T[] }>();
  for (const item of items) {
    const when = at(item);
    const key = `${gameId(item)}|${localDayKey(new Date(when))}`;
    const group = groups.get(key) ?? { gameId: gameId(item), latest: when, items: [] };
    group.items.push(item);
    if (when > group.latest) group.latest = when;
    groups.set(key, group);
  }
  return [...groups.entries()];
}

export function getRecentActivity(limit = DEFAULT_LIMIT): ActivityEvent[] {
  const max = Math.min(Math.max(1, Math.floor(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  const games = new Map(db.getGames().filter((g) => !g.isHidden).map((g) => [g.id, g]));
  const events: ActivityEvent[] = [];

  for (const entry of db.getActivityLog()) {
    const game = games.get(entry.gameId);
    if (game) events.push({ id: entry.id, kind: entry.kind, at: entry.at, rating: entry.rating, ...gameInfo(game) });
  }

  const sessions = [...games.keys()].flatMap((id) => db.getPlaytimeSessions(id));
  for (const [key, group] of byGameAndDay(sessions, (s) => s.gameId, (s) => s.endedAt)) {
    const seconds = group.items.reduce((sum, s) => sum + Math.max(0, s.durationSeconds - (s.idleSeconds ?? 0)), 0);
    if (seconds < MIN_PLAYED_SECONDS) continue;
    events.push({ id: `played|${key}`, kind: 'played', at: group.latest, seconds, ...gameInfo(games.get(group.gameId)!) });
  }

  for (const game of games.values()) {
    const data = db.getGameAchievements(game.id);
    // Marcos do próprio Lazulium não contam: viriam junto com as sessões
    if (!data || data.total === 0 || data.source === 'lazulium') continue;
    const unlocked = data.items.filter((a) => a.unlocked && a.unlockedAt && !Number.isNaN(Date.parse(a.unlockedAt)));
    for (const [key, group] of byGameAndDay(unlocked, () => game.id, (a) => a.unlockedAt!)) {
      events.push({ id: `achievements|${key}`, kind: 'achievements', at: group.latest, count: group.items.length, ...gameInfo(game) });
    }
    if (data.unlocked >= data.total && unlocked.length > 0) {
      const last = unlocked.reduce((a, b) => (a.unlockedAt! > b.unlockedAt! ? a : b)).unlockedAt!;
      events.push({ id: `perfect|${game.id}`, kind: 'perfect', at: last, ...gameInfo(game) });
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, max);
}
