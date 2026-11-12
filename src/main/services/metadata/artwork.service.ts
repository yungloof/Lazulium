import { Game, GameMedia } from '@shared/types/game';
import { FetchAssetsOptions, GameAssetsResult, MediaAssetType, SteamGridDBGame } from '@shared/types/ipc';
import { db } from '../../database/db';
import { cacheRemoteAsset, isCachedFileMissing, isCachedMediaUrl, removeCachedFile } from './media-cache.service';
import { HttpError, describeError, httpRequest, isConnectionError, logBackgroundFailure, sleep } from './http';
import {
  SteamGridDbError,
  getAssets,
  getGameById,
  getGameBySteamAppId,
  searchGames,
  testApiKey
} from './steamgriddb.service';
import { ArtworkServerUnavailable, fetchIgdbArtwork } from './igdb-artwork.service';

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
const BROKEN_CHECK_TIMEOUT_MS = 10_000;
// Sem conta do SteamGridDB, o servidor do Lazulium (IGDB) só tem capa e fundo
const KEYLESS_TYPES: MediaAssetType[] = ['cover', 'hero'];

function emptyResult(error?: string): GameAssetsResult {
  return { sgdbGame: null, candidates: [], grids: [], heroes: [], logos: [], icons: [], error };
}

class ArtworkService {
  private listener: GameUpdatedListener = () => {};
  private queue = new Set<string>();
  private draining = false;
  private checkedBrokenUrls = new Set<string>();
  // Jogos que o IGDB não conhece: não pergunta de novo até o app reabrir
  private keylessMisses = new Set<string>();

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
      return { ok: true, message: 'Chave válida, SteamGridDB conectado.' };
    } catch (err) {
      // Aqui é uma chave digitada à mão: "expirou" não faz sentido, ela só está errada
      if (err instanceof SteamGridDbError && (err.status === 401 || err.status === 403)) {
        return { ok: false, message: 'Chave de API do SteamGridDB inválida.' };
      }
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
    if (!apiKey) {
      return emptyResult('Para escolher entre mais artes, logos e ícones, conecte o SteamGridDB em Configurações → Contas.');
    }
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
    const previous = game.media?.[MEDIA_FIELD[type]];
    const updated: Game = { ...game, media: { ...game.media, [MEDIA_FIELD[type]]: localUrl, ...(type === 'cover' ? { coverSourceUrl: remoteUrl } : {}) } };
    db.upsertGame(updated);
    // Mesma arte aplicada de novo usa o mesmo arquivo: só apaga se for outro
    if (previous && previous.split('?')[0] !== localUrl.split('?')[0]) await removeCachedFile(previous);
    return updated;
  }

  // Artes cujo arquivo sumiu (a pasta antiga era limpa pelo Chromium): libera o campo para o scan
  // devolver a arte da Steam e a fila buscar outra. Retorna os jogos afetados.
  repairMissingMedia(): string[] {
    const repaired: string[] = [];
    for (const game of db.getGames()) {
      const media = { ...game.media };
      let changed = false;
      for (const field of Object.values(MEDIA_FIELD)) {
        if (isCachedFileMissing(media[field])) {
          delete media[field];
          changed = true;
        }
      }
      if (changed) {
        db.replaceGameMedia(game.id, media);
        repaired.push(game.id);
      }
    }
    if (repaired.length > 0) console.log(`[Artwork] ${repaired.length} jogo(s) com arte perdida; buscando de novo`);
    return repaired;
  }

  // Sem `gameIds`: jogos sem capa. Com `gameIds`: jogos com qualquer arte faltando.
  enqueueMissing(gameIds?: string[]): number {
    const keyless = !this.getApiKey();
    const games = gameIds
      ? gameIds.map((id) => db.getGameById(id)).filter((g): g is Game => g !== null)
      : db.getGames().filter((g) => !g.media?.coverUrl);

    let added = 0;
    for (const game of games) {
      if (keyless && this.keylessMisses.has(game.id)) continue;
      const missing = (keyless ? KEYLESS_TYPES : ASSET_TYPES).some((t) => !game.media?.[MEDIA_FIELD[t]]);
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
          if (err instanceof ArtworkServerUnavailable) {
            // Servidor fora do ar ou limite atingido: volta no próximo scan
            logBackgroundFailure('[Artwork]', new HttpError(err.message, 'network'));
            this.queue.clear();
            break;
          }
          const offline = err instanceof SteamGridDbError && err.status === undefined;
          if (offline) logBackgroundFailure('[Artwork]', new HttpError((err as Error).message, 'network'));
          else console.warn(`[Artwork] ${gameId}: ${(err as Error).message}`);
          // Chave inválida, limite atingido ou sem conexão (status ausente): não adianta continuar a fila.
          // A fila volta a rodar no próximo scan ou quando o renderer avisa que a conexão voltou.
          if (offline || (err instanceof SteamGridDbError && [401, 403, 429].includes(err.status!))) {
            this.queue.clear();
            break;
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
    if (!game) return;
    if (!apiKey) return this.fillFromServer(game);

    const missing = ASSET_TYPES.filter((t) => !game.media?.[MEDIA_FIELD[t]]);
    if (missing.length === 0) return;

    const { sgdbGame } = await this.resolveGame(apiKey, game, {});
    if (!sgdbGame) {
      console.log(`[Artwork] ${game.title}: sem correspondência no SteamGridDB`);
      return;
    }

    const found: Partial<GameMedia> = {};
    let coverSource: string | undefined;
    // A conexão caiu no meio: guarda o que já baixou e para a fila (o erro sobe depois de salvar)
    let lostConnection: SteamGridDbError | undefined;
    for (const type of missing) {
      try {
        const [best] = await getAssets(apiKey, sgdbGame.id, type);
        if (!best) continue;
        found[MEDIA_FIELD[type]] = await cacheRemoteAsset(gameId, type, best.url);
        if (type === 'cover') coverSource = best.url;
      } catch (err) {
        if (isConnectionError(err) || (err instanceof SteamGridDbError && err.status === undefined)) {
          lostConnection = err instanceof SteamGridDbError ? err : new SteamGridDbError(describeError(err));
          break;
        }
        if (err instanceof SteamGridDbError) throw err;
        console.warn(`[Artwork] ${game.title} (${type}): ${(err as Error).message}`);
      }
    }
    if (Object.keys(found).length === 0) {
      if (lostConnection) throw lostConnection;
      return;
    }

    await this.saveFound(gameId, found, coverSource);
    console.log(`[Artwork] ${game.title}: ${Object.keys(found).join(', ')} -> "${sgdbGame.name}"`);
    if (lostConnection) throw lostConnection;
  }

  // Sem conta do SteamGridDB: capa e fundo pelo servidor do Lazulium
  private async fillFromServer(game: Game): Promise<void> {
    const missing = KEYLESS_TYPES.filter((t) => !game.media?.[MEDIA_FIELD[t]]);
    if (missing.length === 0) return;
    const art = await fetchIgdbArtwork(game);
    if (!art) {
      this.keylessMisses.add(game.id);
      console.log(`[Artwork] ${game.title}: sem correspondência no IGDB`);
      return;
    }
    const found: Partial<GameMedia> = {};
    for (const type of missing) {
      const remote = type === 'cover' ? art.cover : art.hero;
      if (!remote) continue;
      try {
        found[MEDIA_FIELD[type]] = await cacheRemoteAsset(game.id, type, remote);
      } catch (err) {
        if (isConnectionError(err)) throw new ArtworkServerUnavailable(describeError(err));
        console.warn(`[Artwork] ${game.title} (${type}): ${(err as Error).message}`);
      }
    }
    if (Object.keys(found).length === 0) return;
    await this.saveFound(game.id, found, art.cover);
    console.log(`[Artwork] ${game.title}: ${Object.keys(found).join(', ')} -> "${art.name}" (IGDB)`);
  }

  // Relê o jogo: o usuário pode ter escolhido uma arte enquanto baixávamos, e a dele fica
  private async saveFound(gameId: string, found: Partial<GameMedia>, coverSource?: string): Promise<void> {
    const current = db.getGameById(gameId);
    if (!current) {
      for (const url of Object.values(found)) if (url) await removeCachedFile(url);
      return;
    }
    const media = { ...current.media };
    for (const [field, url] of Object.entries(found) as [keyof GameMedia, string][]) {
      if (!media[field]) {
        media[field] = url;
        if (field === 'coverUrl' && coverSource) media.coverSourceUrl = coverSource;
      } else if (media[field]?.split('?')[0] !== url.split('?')[0]) await removeCachedFile(url);
    }
    const updated = { ...current, media };
    db.upsertGame(updated);
    this.listener(updated);
  }

  // A UI avisa que uma imagem remota não carregou (ex: Steam sem capa vertical).
  // Só descartamos a URL se o servidor confirmar que ela não existe (não por estar offline).
  async reportBroken(gameId: string, type: MediaAssetType): Promise<void> {
    const game = db.getGameById(gameId);
    const field = MEDIA_FIELD[type];
    const url = game?.media?.[field];
    if (!game || !url || isCachedMediaUrl(url) || this.checkedBrokenUrls.has(url) || !/^https:\/\//i.test(url)) return;

    let status: number;
    try {
      status = (await httpRequest(url, { method: 'HEAD', timeoutMs: BROKEN_CHECK_TIMEOUT_MS })).status;
    } catch {
      // Sem conexão não prova nada: a URL pode ser conferida de novo quando a internet voltar
      return;
    }
    this.checkedBrokenUrls.add(url);
    if (![403, 404, 410].includes(status)) return;

    const updated: Game = { ...game, media: { ...game.media, [field]: undefined } };
    db.upsertGame(updated);
    this.listener(updated);
    this.enqueueMissing([gameId]);
  }
}

export const artworkService = new ArtworkService();
