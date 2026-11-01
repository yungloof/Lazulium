import { Game, GameMedia } from '@shared/types/game';
import { FetchAssetsOptions, GameAssetsResult, MediaAssetType, SteamGridDBGame } from '@shared/types/ipc';
import { db } from '../../database/db';
import { cacheRemoteAsset, isCachedMediaUrl } from './media-cache.service';
import {
  SteamGridDbError,
  getAssets,
  getGameById,
  getGameBySteamAppId,
  searchGames,
  testApiKey
} from './steamgriddb.service';

type GameUpdatedListener = (game: Game) => void;

const MEDIA_FIELD: Record<MediaAssetType, keyof GameMedia> = {
  cover: 'coverUrl',
  hero: 'heroUrl',
  logo: 'logoUrl',
  icon: 'iconUrl'
};
const ASSET_TYPES = Object.keys(MEDIA_FIELD) as MediaAssetType[];
const QUEUE_DELAY_MS = 300;         // Espaçamento entre jogos na busca automática
const MAX_CANDIDATES = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emptyResult(error?: string): GameAssetsResult {
  return { sgdbGame: null, candidates: [], grids: [], heroes: [], logos: [], icons: [], error };
}

class ArtworkService {
  private listener: GameUpdatedListener = () => {};
  private queue = new Set<string>();
  private draining = false;
  private checkedBrokenUrls = new Set<string>();

  setGameUpdatedListener(listener: GameUpdatedListener): void {
    this.listener = listener;
  }

  private getApiKey(): string | undefined {
    return db.getSettings().steamGridDbApiKey?.trim() || undefined;
  }

  async testKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
    if (!apiKey.trim()) return { ok: false, message: 'Informe uma chave de API.' };
    try {
      await testApiKey(apiKey.trim());
      return { ok: true, message: 'Chave válida! Conexão com o SteamGridDB funcionando.' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  // Ordem: escolha explícita > ID salvo > AppID da Steam > busca por título
  private async resolveGame(
    apiKey: string,
    game: Game,
    options: FetchAssetsOptions
  ): Promise<{ sgdbGame: SteamGridDBGame | null; candidates: SteamGridDBGame[] }> {
    if (options.sgdbGameId) return { sgdbGame: await getGameById(apiKey, options.sgdbGameId), candidates: [] };

    if (!options.searchTitle) {
      if (game.steamGridDbId) return { sgdbGame: await getGameById(apiKey, game.steamGridDbId), candidates: [] };
      if (game.platform === 'steam' && game.platformGameId) {
        const bySteam = await getGameBySteamAppId(apiKey, game.platformGameId);
        if (bySteam) return { sgdbGame: bySteam, candidates: [] };
      }
    }

    const results = await searchGames(apiKey, options.searchTitle || game.title);
    return { sgdbGame: results[0] ?? null, candidates: results.slice(0, MAX_CANDIDATES) };
  }

  async fetchAssets(gameId: string, options: FetchAssetsOptions = {}): Promise<GameAssetsResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) return emptyResult('Configure sua chave de API do SteamGridDB em Configurações.');
    const game = db.getGameById(gameId);
    if (!game) return emptyResult('Jogo não encontrado.');

    try {
      const { sgdbGame, candidates } = await this.resolveGame(apiKey, game, options);
      if (!sgdbGame) return { ...emptyResult('Nenhum jogo encontrado no SteamGridDB. Tente outro título.'), candidates };

      // Escolha manual do usuário vira o vínculo padrão do jogo
      if (options.sgdbGameId && game.steamGridDbId !== sgdbGame.id) {
        db.upsertGame({ ...game, steamGridDbId: sgdbGame.id });
      }

      const [grids, heroes, logos, icons] = await Promise.all(ASSET_TYPES.map((t) => getAssets(apiKey, sgdbGame.id, t)));
      return { sgdbGame, candidates, grids, heroes, logos, icons };
    } catch (err) {
      return emptyResult((err as Error).message);
    }
  }

  async applyAsset(gameId: string, type: MediaAssetType, remoteUrl: string): Promise<Game> {
    const localUrl = await cacheRemoteAsset(gameId, type, remoteUrl);
    const game = db.getGameById(gameId);
    if (!game) throw new Error('Jogo não encontrado.');
    const updated: Game = { ...game, media: { ...game.media, [MEDIA_FIELD[type]]: localUrl } };
    db.upsertGame(updated);
    return updated;
  }

  // Sem `gameIds`: jogos sem capa. Com `gameIds`: jogos com qualquer arte faltando.
  enqueueMissing(gameIds?: string[]): number {
    if (!this.getApiKey()) return 0;
    const games = gameIds
      ? gameIds.map((id) => db.getGameById(id)).filter((g): g is Game => g !== null)
      : db.getGames().filter((g) => !g.media?.coverUrl);

    let added = 0;
    for (const game of games) {
      const missing = ASSET_TYPES.some((t) => !game.media?.[MEDIA_FIELD[t]]);
      if (missing && !this.queue.has(game.id)) {
        this.queue.add(game.id);
        added++;
      }
    }
    if (added > 0) void this.drain();
    return added;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    console.log(`[Artwork] Buscando artes para ${this.queue.size} jogo(s)...`);
    try {
      while (this.queue.size > 0) {
        const [gameId] = this.queue;
        this.queue.delete(gameId);
        try {
          await this.fillMissing(gameId);
        } catch (err) {
          console.warn(`[Artwork] ${gameId}: ${(err as Error).message}`);
          // Chave inválida ou limite atingido: não adianta continuar a fila
          if (err instanceof SteamGridDbError && [401, 403, 429].includes(err.status ?? 0)) {
            this.queue.clear();
          }
        }
        await sleep(QUEUE_DELAY_MS);
      }
    } finally {
      this.draining = false;
    }
  }

  private async fillMissing(gameId: string): Promise<void> {
    const apiKey = this.getApiKey();
    const game = db.getGameById(gameId);
    if (!apiKey || !game) return;

    const missing = ASSET_TYPES.filter((t) => !game.media?.[MEDIA_FIELD[t]]);
    if (missing.length === 0) return;

    const { sgdbGame } = await this.resolveGame(apiKey, game, {});
    if (!sgdbGame) {
      console.log(`[Artwork] ${game.title}: sem correspondência no SteamGridDB`);
      return;
    }

    const found: Partial<GameMedia> = {};
    for (const type of missing) {
      const [best] = await getAssets(apiKey, sgdbGame.id, type);
      if (!best) continue;
      try {
        found[MEDIA_FIELD[type]] = await cacheRemoteAsset(gameId, type, best.url);
      } catch (err) {
        console.warn(`[Artwork] ${game.title} (${type}): ${(err as Error).message}`);
      }
    }
    if (Object.keys(found).length === 0) return;

    // Relê o jogo: o usuário pode ter escolhido uma arte enquanto baixávamos
    const current = db.getGameById(gameId);
    if (!current) return;
    const media = { ...current.media };
    for (const [field, url] of Object.entries(found) as [keyof GameMedia, string][]) {
      if (!media[field]) media[field] = url;
    }
    const updated = { ...current, media };
    db.upsertGame(updated);
    console.log(`[Artwork] ${game.title}: ${Object.keys(found).join(', ')} -> "${sgdbGame.name}"`);
    this.listener(updated);
  }

  // A UI avisa que uma imagem remota não carregou (ex: Steam sem capa vertical).
  // Só descartamos a URL se o servidor confirmar que ela não existe (não por estar offline).
  async reportBroken(gameId: string, type: MediaAssetType): Promise<void> {
    const game = db.getGameById(gameId);
    const field = MEDIA_FIELD[type];
    const url = game?.media?.[field];
    if (!game || !url || isCachedMediaUrl(url) || this.checkedBrokenUrls.has(url)) return;
    this.checkedBrokenUrls.add(url);

    let status: number;
    try {
      status = (await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) })).status;
    } catch {
      return;
    }
    if (![403, 404, 410].includes(status)) return;

    const updated: Game = { ...game, media: { ...game.media, [field]: undefined } };
    db.upsertGame(updated);
    this.listener(updated);
    this.enqueueMissing([gameId]);
  }
}

export const artworkService = new ArtworkService();
