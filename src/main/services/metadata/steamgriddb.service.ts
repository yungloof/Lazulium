import { MediaAssetType, SteamGridDBAsset, SteamGridDBGame } from '@shared/types/ipc';

const API_BASE = 'https://www.steamgriddb.com/api/v2';
const REQUEST_TIMEOUT_MS = 15_000;

// Filtros comuns: só imagens estáticas e sem conteúdo NSFW/humor
const SAFE_FILTERS = { types: 'static', nsfw: 'false', humor: 'false' };

// Endpoint e filtros por tipo de arte do Lazulium
const ASSET_ENDPOINTS: Record<MediaAssetType, { path: string; query: Record<string, string> }> = {
  cover: { path: 'grids', query: { ...SAFE_FILTERS, dimensions: '600x900,342x482,660x930' } },
  hero: { path: 'heroes', query: SAFE_FILTERS },
  logo: { path: 'logos', query: SAFE_FILTERS },
  icon: { path: 'icons', query: SAFE_FILTERS }
};

export class SteamGridDbError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
  }
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  errors?: string[];
}

interface ApiGame {
  id: number;
  name: string;
  release_date?: number;            // Unix timestamp (segundos)
  verified?: boolean;
}

interface ApiAsset {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
  style?: string;
  author?: { name: string };
}

async function request<T>(apiKey: string, path: string, query?: Record<string, string>): Promise<T> {
  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (err) {
    throw new SteamGridDbError(`Sem conexão com o SteamGridDB (${(err as Error).message}).`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new SteamGridDbError('Chave de API do SteamGridDB inválida.', res.status);
  }
  if (res.status === 404) throw new SteamGridDbError('Não encontrado no SteamGridDB.', 404);
  if (res.status === 429) {
    throw new SteamGridDbError('Limite de requisições do SteamGridDB atingido. Tente novamente em instantes.', 429);
  }
  if (!res.ok) throw new SteamGridDbError(`SteamGridDB respondeu HTTP ${res.status}.`, res.status);

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) throw new SteamGridDbError(body.errors?.join(', ') || 'Resposta inválida do SteamGridDB.');
  return body.data;
}

function toGame(game: ApiGame): SteamGridDBGame {
  return {
    id: game.id,
    name: game.name,
    releaseYear: game.release_date ? new Date(game.release_date * 1000).getUTCFullYear() : undefined,
    verified: game.verified
  };
}

function toAsset(asset: ApiAsset): SteamGridDBAsset {
  return {
    id: asset.id,
    url: asset.url,
    thumb: asset.thumb,
    width: asset.width,
    height: asset.height,
    style: asset.style,
    author: asset.author ? { name: asset.author.name } : undefined
  };
}

// Remove símbolos que atrapalham a busca ("DOOM™ Eternal" -> "DOOM Eternal")
export function cleanSearchTitle(title: string): string {
  return title.replace(/[™®©]/g, '').replace(/\s{2,}/g, ' ').trim();
}

export async function searchGames(apiKey: string, term: string): Promise<SteamGridDBGame[]> {
  const cleaned = cleanSearchTitle(term);
  if (!cleaned) return [];
  const data = await request<ApiGame[]>(apiKey, `/search/autocomplete/${encodeURIComponent(cleaned)}`);
  return data.map(toGame);
}

export async function getGameById(apiKey: string, id: number): Promise<SteamGridDBGame> {
  return toGame(await request<ApiGame>(apiKey, `/games/id/${id}`));
}

export async function getGameBySteamAppId(apiKey: string, appId: string): Promise<SteamGridDBGame | null> {
  try {
    return toGame(await request<ApiGame>(apiKey, `/games/steam/${encodeURIComponent(appId)}`));
  } catch (err) {
    if (err instanceof SteamGridDbError && err.status === 404) return null;
    throw err;
  }
}

export async function getAssets(apiKey: string, sgdbGameId: number, type: MediaAssetType): Promise<SteamGridDBAsset[]> {
  const endpoint = ASSET_ENDPOINTS[type];
  try {
    const data = await request<ApiAsset[]>(apiKey, `/${endpoint.path}/game/${sgdbGameId}`, endpoint.query);
    return data.map(toAsset);
  } catch (err) {
    // Jogo sem artes desse tipo: lista vazia em vez de erro
    if (err instanceof SteamGridDbError && err.status === 404) return [];
    throw err;
  }
}

// Valida a chave com uma busca simples
export async function testApiKey(apiKey: string): Promise<void> {
  await request<ApiGame[]>(apiKey, '/search/autocomplete/portal');
}
