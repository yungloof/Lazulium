import { GameSearchResult } from '@shared/types/game';
import { igdbProxyUrl } from './play-length.service';
import { normalizeKey } from '../cloudsync/save-locator.service';

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

async function searchIgdb(query: string): Promise<GameSearchResult[]> {
  const res = await fetch(`${igdbProxyUrl()}/v1/search?${new URLSearchParams({ q: query })}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return [];
  const data = (await res.json()) as IgdbSearchResponse;
  return (data.results ?? []).flatMap((item) =>
    typeof item.name === 'string'
      ? [{ source: 'igdb' as const, name: item.name, year: typeof item.year === 'number' ? item.year : undefined, coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : undefined }]
      : []
  );
}

async function searchSteam(query: string): Promise<GameSearchResult[]> {
  const res = await fetch(`https://store.steampowered.com/api/storesearch/?${new URLSearchParams({ term: query, l: 'portuguese', cc: 'BR' })}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return [];
  const data = (await res.json()) as SteamSearchResponse;
  return (data.items ?? []).flatMap((item) =>
    typeof item.id === 'number' && typeof item.name === 'string' && item.type === 'app' && !NOT_A_GAME.test(item.name)
      ? [{ source: 'steam' as const, name: item.name, coverUrl: STEAM_COVER(item.id), steamAppId: item.id, thumbUrl: typeof item.tiny_image === 'string' ? item.tiny_image : undefined }]
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
      console.warn(`[Busca de jogos] ${(outcome.reason as Error).message}`);
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
