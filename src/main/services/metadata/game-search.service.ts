import { GameSearchResult } from '@shared/types/game';
import { igdbProxyUrl } from './play-length.service';
import { normalizeKey } from '../cloudsync/save-locator.service';
import { HttpError, fetchJson, logBackgroundFailure } from './http';

// Catálogo para registrar jogos: IGDB tem console e clássicos; a loja da Steam responde mesmo se o nosso servidor cair.
const TIMEOUT_MS = 6_000;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 15;
const STEAM_COVER = (appId: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
const NOT_A_GAME = /\b(soundtrack|upgrade|dlc|season pass|artbook|demo|bundle)\b/i;

interface IgdbSearchResponse {
  results?: { name?: unknown; year?: unknown; coverUrl?: unknown }[];
}

interface SteamSearchResponse {
  items?: { id?: unknown; name?: unknown; type?: unknown; tiny_image?: unknown }[];
}

// Capas só de endereços conhecidos: a tela carrega a imagem direto da URL
const IGDB_COVER = /^https:\/\/images\.igdb\.com\//;
const STEAM_THUMB = /^https:\/\/[a-z0-9.-]+\.(steamstatic|steampowered)\.com\//;

async function searchIgdb(query: string): Promise<GameSearchResult[]> {
  const data = await fetchJson<IgdbSearchResponse | null>(`${igdbProxyUrl()}/v1/search?${new URLSearchParams({ q: query })}`, { timeoutMs: TIMEOUT_MS, service: 'o servidor do Lazulium' });
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.flatMap((item) =>
    item && typeof item.name === 'string'
      ? [{ source: 'igdb' as const, name: item.name, year: typeof item.year === 'number' ? item.year : undefined, coverUrl: typeof item.coverUrl === 'string' && IGDB_COVER.test(item.coverUrl) ? item.coverUrl : undefined }]
      : []
  );
}

async function searchSteam(query: string): Promise<GameSearchResult[]> {
  const data = await fetchJson<SteamSearchResponse | null>(`https://store.steampowered.com/api/storesearch/?${new URLSearchParams({ term: query, l: 'portuguese', cc: 'BR' })}`, {
    timeoutMs: TIMEOUT_MS,
    service: 'a loja da Steam'
  });
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.flatMap((item) =>
    item && typeof item.id === 'number' && Number.isInteger(item.id) && item.id > 0 && typeof item.name === 'string' && item.type === 'app' && !NOT_A_GAME.test(item.name)
      ? [{ source: 'steam' as const, name: item.name, coverUrl: STEAM_COVER(item.id), steamAppId: item.id, thumbUrl: typeof item.tiny_image === 'string' && STEAM_THUMB.test(item.tiny_image) ? item.tiny_image : undefined }]
      : []
  );
}

// Fontes isoladas: uma fora do ar só deixa a lista menor
export async function searchGameCatalog(query: string): Promise<GameSearchResult[]> {
  const term = query.trim().slice(0, 120);
  if (term.length < MIN_QUERY_LENGTH) return [];
  const settled = await Promise.allSettled([searchIgdb(term), searchSteam(term)]);
  // O mesmo jogo nas duas fontes vira uma entrada só, com o que cada uma sabe (capa e ano do IGDB, ID da Steam)
  const seen = new Map<string, GameSearchResult>();
  const results: GameSearchResult[] = [];
  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      // Recusa do servidor (ex: busca curta demais) só deixa a lista menor; sem internet, avisa uma vez
      const reason = outcome.reason;
      if (!(reason instanceof HttpError) || reason.kind !== 'status') logBackgroundFailure('[Busca de jogos]', reason);
      continue;
    }
    for (const item of outcome.value) {
      const key = normalizeKey(item.name);
      const known = seen.get(key);
      if (known) {
        known.steamAppId ??= item.steamAppId;
        known.thumbUrl ??= item.thumbUrl;
        continue;
      }
      seen.set(key, item);
      results.push(item);
    }
  }
  return results.slice(0, MAX_RESULTS);
}
