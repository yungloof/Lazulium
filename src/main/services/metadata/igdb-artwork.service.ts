import { Game } from '@shared/types/game';
import { isSteamPlaceholderTitle } from '../scanners/steam-names.service';
import { HttpError, fetchJson } from './http';
import { igdbProxyUrl } from './play-length.service';

// Capa e fundo pelo servidor do Lazulium (IGDB), para quem não conectou o SteamGridDB.
// O servidor só aceita nome igual ao do jogo; logo e ícone continuam sendo do SteamGridDB.

const TIMEOUT_MS = 10_000;
const IGDB_IMAGE = /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_[a-z0-9_]+\/[a-z0-9]+\.jpg$/i;

export interface IgdbArtwork {
  name: string;
  cover: string;
  hero?: string;
}

// Servidor fora do ar ou limite atingido: a fila para e tenta de novo depois
export class ArtworkServerUnavailable extends Error {}

interface ArtworkResponse {
  found?: unknown;
  name?: unknown;
  cover?: unknown;
  hero?: unknown;
}

const isIgdbImage = (value: unknown): value is string => typeof value === 'string' && IGDB_IMAGE.test(value);

export async function fetchIgdbArtwork(game: Game): Promise<IgdbArtwork | null> {
  const base = igdbProxyUrl();
  const title = game.title?.trim();
  if (!base || !title || title.length < 2 || isSteamPlaceholderTitle(title)) return null;

  let data: ArtworkResponse | null;
  try {
    data = await fetchJson<ArtworkResponse | null>(`${base}/v1/artwork?${new URLSearchParams({ title: title.slice(0, 120) })}`, {
      timeoutMs: TIMEOUT_MS,
      service: 'o servidor do Lazulium'
    });
  } catch (err) {
    // 400 é título que o servidor não aceita: tentar de novo daria o mesmo resultado
    if (err instanceof HttpError && err.status === 400) return null;
    throw new ArtworkServerUnavailable((err as Error).message);
  }
  // A resposta é dado de fora: só passa endereço de imagem do próprio IGDB
  if (!data || data.found !== true || !isIgdbImage(data.cover)) return null;
  return {
    name: typeof data.name === 'string' ? data.name : title,
    cover: data.cover,
    hero: isIgdbImage(data.hero) ? data.hero : undefined
  };
}
