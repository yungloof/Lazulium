import { MediaAssetType, SteamGridDBAsset, SteamGridDBGame } from '@shared/types/ipc';
import { describeError, httpRequest } from './http';

const API_BASE = 'https://www.steamgriddb.com/api/v2';
const REQUEST_TIMEOUT_MS = 15_000;
const INVALID_RESPONSE = 'O SteamGridDB mandou uma resposta que o Lazulium não entendeu.';

// Filtros comuns: só imagens estáticas e sem conteúdo NSFW/humor
const SAFE_FILTERS = { types: 'static', nsfw: 'false', humor: 'false' };

// Endpoint e filtros por tipo de arte do Lazulium
const ASSET_ENDPOINTS: Record<MediaAssetType, { path: string; query: Record<string, string> }> = {
  cover: { path: 'grids', query: { ...SAFE_FILTERS, dimensions: '600x900,342x482,660x930' } },
  hero: { path: 'heroes', query: SAFE_FILTERS },
  logo: { path: 'logos', query: SAFE_FILTERS },
  icon: { path: 'icons', query: SAFE_FILTERS }
};

// status ausente = sem conexão: a fila de artes para e volta quando a internet voltar
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
    // Uma nova tentativa em falha passageira (5xx, 429 curto); 429 longo cai no erro abaixo e pausa a fila
    res = await httpRequest(url, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: REQUEST_TIMEOUT_MS, retries: 1, service: 'o SteamGridDB' });
  } catch (err) {
    throw new SteamGridDbError(describeError(err));
  }

  if (res.status === 401 || res.status === 403) {
    throw new SteamGridDbError('A conexão com o SteamGridDB expirou ou foi revogada. Entre de novo em Configurações → Contas.', res.status);
  }
  if (res.status === 404) throw new SteamGridDbError('Não encontrado no SteamGridDB.', 404);
  if (res.status === 429) {
    throw new SteamGridDbError('O SteamGridDB recebeu pedidos demais. As artes que faltam são buscadas mais tarde.', 429);
  }
  if (!res.ok) throw new SteamGridDbError(`O SteamGridDB está com problemas agora (erro ${res.status}).`, res.status);

  let body: ApiResponse<T> | null;
  try {
    body = (await res.json()) as ApiResponse<T> | null;
  } catch {
    throw new SteamGridDbError(INVALID_RESPONSE, res.status);
  }
  if (!body?.success || body.data === undefined || body.data === null) {
    throw new SteamGridDbError(Array.isArray(body?.errors) && body.errors.length ? body.errors.join(', ') : INVALID_RESPONSE, res.status);
  }
  return body.data;
}

const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const isHttpsUrl = (value: unknown): value is string => typeof value === 'string' && value.startsWith('https://');

// A resposta é dado de fora: entrada sem os campos que a tela usa fica de fora em vez de quebrá-la
function toGame(game: ApiGame | null): SteamGridDBGame | null {
  if (!game || !isPositiveInt(game.id) || typeof game.name !== 'string') return null;
  return {
    id: game.id,
    name: game.name,
    releaseYear: typeof game.release_date === 'number' && game.release_date > 0 ? new Date(game.release_date * 1000).getUTCFullYear() : undefined,
    verified: typeof game.verified === 'boolean' ? game.verified : undefined
  };
}

function toAsset(asset: ApiAsset | null): SteamGridDBAsset | null {
  if (!asset || !isPositiveInt(asset.id) || !isHttpsUrl(asset.url) || !isHttpsUrl(asset.thumb)) return null;
  return {
    id: asset.id,
    url: asset.url,
    thumb: asset.thumb,
    width: Number(asset.width) || 0,
    height: Number(asset.height) || 0,
    style: typeof asset.style === 'string' ? asset.style : undefined,
    author: typeof asset.author?.name === 'string' ? { name: asset.author.name } : undefined
  };
}

const listOf = <T, R>(data: unknown, map: (item: T | null) => R | null): R[] =>
  Array.isArray(data) ? data.flatMap((item) => map(item as T | null) ?? []) : [];

function requireGame(game: ApiGame | null): SteamGridDBGame {
  const parsed = toGame(game);
  if (!parsed) throw new SteamGridDbError(INVALID_RESPONSE, 200);
  return parsed;
}

// Remove símbolos que atrapalham a busca ("DOOM™ Eternal" -> "DOOM Eternal")
export function cleanSearchTitle(title: string): string {
  return title.replace(/[™®©]/g, '').replace(/\s{2,}/g, ' ').trim();
}

export async function searchGames(apiKey: string, term: string): Promise<SteamGridDBGame[]> {
  const cleaned = cleanSearchTitle(term);
  if (!cleaned) return [];
  return listOf(await request<unknown>(apiKey, `/search/autocomplete/${encodeURIComponent(cleaned)}`), toGame);
}

export async function getGameById(apiKey: string, id: number): Promise<SteamGridDBGame> {
  return requireGame(await request<ApiGame>(apiKey, `/games/id/${encodeURIComponent(String(id))}`));
}

export async function getGameBySteamAppId(apiKey: string, appId: string): Promise<SteamGridDBGame | null> {
  try {
    return requireGame(await request<ApiGame>(apiKey, `/games/steam/${encodeURIComponent(appId)}`));
  } catch (err) {
    if (err instanceof SteamGridDbError && err.status === 404) return null;
    throw err;
  }
}

export async function getAssets(apiKey: string, sgdbGameId: number, type: MediaAssetType): Promise<SteamGridDBAsset[]> {
  const endpoint = ASSET_ENDPOINTS[type];
  try {
    return listOf(await request<unknown>(apiKey, `/${endpoint.path}/game/${sgdbGameId}`, endpoint.query), toAsset);
  } catch (err) {
    // Jogo sem artes desse tipo: lista vazia em vez de erro
    if (err instanceof SteamGridDbError && err.status === 404) return [];
    throw err;
  }
}

// Valida a chave com uma busca simples
export async function testApiKey(apiKey: string): Promise<void> {
  await request<unknown>(apiKey, '/search/autocomplete/portal');
}
