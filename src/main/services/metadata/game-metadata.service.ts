import { normalizeIgdbGenres } from '@shared/utils/genres';
import { Game } from '@shared/types/game';
import { db } from '../../database/db';
import { HttpError, fetchJson, isTransientError, logBackgroundFailure, sleep } from './http';
import { igdbProxyUrl } from './play-length.service';

const QUEUE_DELAY_MS = 1_150;       // Worker limita a 60 pedidos por minuto por IP
const MISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_TITLE_LENGTH = 120;

type GameUpdatedListener = (game: Game) => void;

interface WorkerMetadataResponse {
  found?: boolean;
  gameId?: number | null;
  name?: string | null;
  year?: number | null;
  genres?: unknown;
  themes?: unknown;
  series?: unknown;
}

const hasMetadata = (game: Game): boolean =>
  Boolean((game.genres && game.genres.length > 0) || game.releaseYear !== undefined || game.series);

const needsLookup = (game: Game, now = Date.now()): boolean => {
  if (!game.metadataCheckedAt) return true;
  if (hasMetadata(game)) return false;
  return now - game.metadataCheckedAt > MISS_TTL_MS;
};

// Remove parênteses de região/versão e caracteres inválidos antes de consultar o proxy
export function cleanQueryTitle(value: string): string {
  const sanitize = (raw: string) =>
    raw
      .replace(/[™®©]/g, '')
      .replace(/["\\;*]/g, ' ')
      .replace(/\p{C}/gu, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, MAX_TITLE_LENGTH)
      .trim();

  const stripped = sanitize(value.replace(/[([][^)\]]*[)\]]/g, ' '));
  return stripped.length >= 2 ? stripped : sanitize(value);
}

export async function fetchGameMetadataRemote(game: Pick<Game, 'platform' | 'platformGameId' | 'title'> & { id?: string }): Promise<{
  genres: string[];
  releaseYear?: number;
  series?: string;
} | null> {
  const params = new URLSearchParams();
  const isSteamShortcut = Boolean(game.id?.startsWith('steam-shortcut-'));
  const appId = game.platform === 'steam' && !isSteamShortcut ? game.platformGameId : undefined;
  const cleanTitle = cleanQueryTitle(game.title);
  if (appId && /^\d{1,10}$/.test(appId)) params.set('steamAppId', appId);
  if (cleanTitle.length >= 2) params.set('title', cleanTitle);
  if (!params.has('steamAppId') && !params.has('title')) return null;

  const res = await fetchJson<WorkerMetadataResponse>(`${igdbProxyUrl()}/v1/metadata?${params}`, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    service: 'o servidor do catálogo'
  });

  if (!res || res.found !== true) return { genres: [] };

  const genres = normalizeIgdbGenres(res.genres, res.themes);
  const releaseYear =
    typeof res.year === 'number' && Number.isInteger(res.year) && res.year >= 1950 && res.year <= 2100 ? res.year : undefined;
  const series = typeof res.series === 'string' && res.series.trim() ? res.series.trim() : undefined;
  return { genres, releaseYear, series };
}

class GameMetadataService {
  private queue = new Set<string>();
  private draining = false;
  private inflight = new Map<string, Promise<Game | null>>();
  private listener: GameUpdatedListener = () => undefined;

  setGameUpdatedListener(listener: GameUpdatedListener): void {
    this.listener = listener;
  }

  enqueueMissing(gameIds?: string[]): number {
    const now = Date.now();
    const candidates = gameIds
      ? gameIds.map((id) => db.getGameById(id)).filter((g): g is Game => g !== null)
      : db
          .getGames()
          .filter((g) => !g.isHidden && !g.isSoftware && needsLookup(g, now))
          // Prioriza o que o jogador mais joga ou favoritou para aparecer primeiro na interface
          .sort(
            (a, b) =>
              Number(b.isFavorite) - Number(a.isFavorite) ||
              Number(b.isInstalled !== false) - Number(a.isInstalled !== false) ||
              (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0)
          );

    let added = 0;
    for (const game of candidates) {
      if (game.isHidden || game.isSoftware || !needsLookup(game, now)) continue;
      if (!this.queue.has(game.id)) {
        this.queue.add(game.id);
        added++;
      }
    }
    if (added > 0) void this.drain();
    return added;
  }

  // Consulta imediata quando o usuário abre a página do jogo
  async ensure(gameId: string): Promise<Game | null> {
    const game = db.getGameById(gameId);
    if (!game) return null;
    if (!needsLookup(game)) return game;

    const active = this.inflight.get(gameId);
    if (active) return active;

    const task = this.fetchAndSave(gameId).finally(() => {
      this.inflight.delete(gameId);
    });
    this.inflight.set(gameId, task);
    return task;
  }

  forget(gameId: string): Game | null {
    const game = db.getGameById(gameId);
    if (!game) return null;
    if (!game.genres && game.releaseYear === undefined && !game.series && !game.metadataCheckedAt) return game;
    const { genres: _g, releaseYear: _y, series: _s, metadataCheckedAt: _c, ...rest } = game;
    const updated: Game = { ...rest, updatedAt: new Date().toISOString() };
    db.upsertGames([updated]);
    this.listener(updated);
    return updated;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.size > 0) {
        const [gameId] = this.queue;
        this.queue.delete(gameId);
        try {
          await this.fetchAndSaveOrThrow(gameId);
        } catch (err) {
          if (err instanceof HttpError && err.status === 400) {
            this.markCheckedOnly(gameId);
            continue;
          }
          logBackgroundFailure('[Metadata]', err);
          if (isTransientError(err)) {
            this.queue.clear();
            break;
          }
        }
        if (this.queue.size > 0) await sleep(QUEUE_DELAY_MS);
      }
    } finally {
      this.draining = false;
    }
  }

  private async fetchAndSave(gameId: string): Promise<Game | null> {
    try {
      return await this.fetchAndSaveOrThrow(gameId);
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) {
        this.markCheckedOnly(gameId);
      } else {
        logBackgroundFailure('[Metadata]', err);
      }
      return db.getGameById(gameId);
    }
  }

  private markCheckedOnly(gameId: string): void {
    const current = db.getGameById(gameId);
    if (!current) return;
    const updated = db.upsertGame({ ...current, metadataCheckedAt: Date.now() });
    this.listener(updated);
  }

  private async fetchAndSaveOrThrow(gameId: string): Promise<Game | null> {
    const snapshot = db.getGameById(gameId);
    if (!snapshot) return null;
    if (!needsLookup(snapshot)) return snapshot;

    const fetched = await fetchGameMetadataRemote(snapshot);
    const current = db.getGameById(gameId);
    if (!current) return null;

    if (!fetched) {
      const marked = db.upsertGame({ ...current, metadataCheckedAt: Date.now() });
      this.listener(marked);
      return marked;
    }

    const updated = db.upsertGame({
      ...current,
      genres: fetched.genres.length > 0 ? fetched.genres : current.genres,
      releaseYear: fetched.releaseYear ?? current.releaseYear,
      series: fetched.series ?? current.series,
      metadataCheckedAt: Date.now()
    });
    this.listener(updated);
    return updated;
  }
}

export const gameMetadataService = new GameMetadataService();
