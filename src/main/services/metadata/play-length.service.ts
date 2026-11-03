import { Game, GamePlayLength, isWeakPlayLength } from '@shared/types/game';
import { db } from '../../database/db';
import { isSteamPlaceholderTitle } from '../scanners/steam-names.service';

// Servidor em server/igdb-proxy, que guarda a credencial da Twitch. Vazio enquanto não está publicado: fica só a estimativa da Steam.
const IGDB_PROXY_URL = 'https://lazulium-igdb.yungloof.workers.dev';
const IGDB_TIMEOUT_MS = 8_000;

// O Steam não publica "tempo para zerar", mas cada review traz as horas do autor. Entre quem recomenda o jogo,
// o quartil de baixo costuma ficar perto da campanha, e a mediana, perto da campanha com extras.
const REVIEW_ENDPOINTS = ['appreviews', 'ajaxappreviews'];
const REVIEWS_PER_PAGE = 100;
const PAGES = 3;
const PAGE_DELAY_MS = 500;
const REVIEW_TIMEOUT_MS = 10_000;
const MIN_SAMPLE = 50;
const OPEN_ENDED_SPREAD = 8;        // p75 muito acima de p25: multiplayer e jogos sem fim, em que "duração" não faz sentido

const DAY_MS = 24 * 60 * 60 * 1000;
const FOUND_TTL_MS = 30 * DAY_MS;
const NOT_FOUND_TTL_MS = 7 * DAY_MS;
const RETRY_SOON_TTL_MS = DAY_MS;   // Resultado incompleto porque uma das fontes não respondeu: tenta de novo logo
const CACHE_PREFIX = 'v2:';         // Muda quando a regra de escolha da fonte muda

type IgdbResult = { kind: 'found'; length: GamePlayLength } | { kind: 'none' } | { kind: 'unavailable' };

interface ReviewsPage {
  success?: number;
  cursor?: string;
  reviews?: { author?: { playtime_at_review?: number } }[];
}

interface ProxyResponse {
  found?: boolean;
  name?: unknown;
  hastily?: unknown;
  normally?: unknown;
  completely?: unknown;
  count?: unknown;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
const toHours = (seconds: unknown) => (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds / 3600 : null);

const steamAppId = (game: Game) => (game.platform === 'steam' ? game.platformGameId : undefined);

async function queryIgdb(game: Game): Promise<IgdbResult> {
  const base = process.env.LAZULIUM_IGDB_PROXY_URL ?? IGDB_PROXY_URL;
  if (!base) return { kind: 'unavailable' };

  const params = new URLSearchParams();
  const appId = steamAppId(game);
  if (appId) params.set('steamAppId', appId);
  if (game.title && !isSteamPlaceholderTitle(game.title)) params.set('title', game.title.slice(0, 120));
  if ([...params.keys()].length === 0) return { kind: 'none' };

  try {
    const res = await fetch(`${base}/v1/time-to-beat?${params}`, { signal: AbortSignal.timeout(IGDB_TIMEOUT_MS) });
    if (!res.ok) {
      // 400 é título que o servidor não aceita: tentar de novo daria o mesmo resultado
      if (res.status !== 400) console.warn(`[PlayLength] Servidor do IGDB respondeu ${res.status}`);
      return res.status === 400 ? { kind: 'none' } : { kind: 'unavailable' };
    }
    const data = (await res.json()) as ProxyResponse;
    const [lowHours, typicalHours, completeHours] = [toHours(data.hastily), toHours(data.normally), toHours(data.completely)];
    if (!data.found || (!lowHours && !typicalHours && !completeHours)) return { kind: 'none' };
    return {
      kind: 'found',
      length: {
        source: 'igdb',
        lowHours,
        typicalHours,
        completeHours,
        openEnded: false,
        sampleSize: typeof data.count === 'number' ? data.count : 0,
        matchedName: typeof data.name === 'string' ? data.name : undefined
      }
    };
  } catch (err) {
    console.warn(`[PlayLength] Servidor do IGDB indisponível: ${(err as Error).message}`);
    return { kind: 'unavailable' };
  }
}

async function fetchReviewsPage(appId: string, cursor: string): Promise<ReviewsPage | null> {
  const query = `json=1&filter=recent&language=all&review_type=positive&purchase_type=all&num_per_page=${REVIEWS_PER_PAGE}&cursor=${encodeURIComponent(cursor)}`;
  for (const endpoint of REVIEW_ENDPOINTS) {
    const res = await fetch(`https://store.steampowered.com/${endpoint}/${encodeURIComponent(appId)}?${query}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS)
    });
    if (!res.ok) continue;
    const page = (await res.json().catch(() => null)) as ReviewsPage | null;
    if (page?.success === 1) return page;
  }
  return null;
}

async function measureSteamReviews(appId: string): Promise<GamePlayLength | null> {
  const hours: number[] = [];
  let cursor = '*';
  try {
    for (let page = 0; page < PAGES; page++) {
      const result = await fetchReviewsPage(appId, cursor);
      if (!result) break;
      for (const review of result.reviews ?? []) {
        const minutes = review.author?.playtime_at_review ?? 0;
        if (minutes > 0) hours.push(minutes / 60);
      }
      if (!result.cursor || (result.reviews?.length ?? 0) < REVIEWS_PER_PAGE) break;
      cursor = result.cursor;
      await sleep(PAGE_DELAY_MS);
    }
  } catch (err) {
    console.warn(`[PlayLength] Reviews de ${appId}: ${(err as Error).message}`);
  }
  if (hours.length < MIN_SAMPLE) return null;
  hours.sort((a, b) => a - b);
  const lowHours = quantile(hours, 0.25);
  return {
    source: 'steam-reviews',
    lowHours,
    typicalHours: quantile(hours, 0.5),
    openEnded: quantile(hours, 0.75) / Math.max(lowHours, 0.1) >= OPEN_ENDED_SPREAD,
    sampleSize: hours.length
  };
}

class PlayLengthService {
  private inFlight = new Map<string, Promise<GamePlayLength | null>>();

  // Informação extra da página do jogo: sem rede ou sem dados, a página só não mostra
  get(game: Game): Promise<GamePlayLength | null> {
    const cached = db.getPlayLength(CACHE_PREFIX + game.id);
    if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.length);

    const running = this.inFlight.get(game.id);
    if (running) return running;
    const task = this.load(game, cached?.length ?? null).finally(() => this.inFlight.delete(game.id));
    this.inFlight.set(game.id, task);
    return task;
  }

  private async load(game: Game, previous: GamePlayLength | null): Promise<GamePlayLength | null> {
    const igdb = await queryIgdb(game);
    const appId = steamAppId(game);
    const igdbLength = igdb.kind === 'found' ? igdb.length : null;
    // Na Steam as reviews sempre entram: amostra maior quando o IGDB é fraco, e só elas revelam jogo sem fim (CS2)
    const reviews = appId ? await measureSteamReviews(appId) : null;
    const igdbWins = !appId || (igdbLength && !isWeakPlayLength(igdbLength) && !reviews?.openEnded);
    const length = igdbWins ? igdbLength : reviews ?? igdbLength;
    const igdbDown = igdb.kind === 'unavailable';
    const reviewsDown = !!appId && !reviews;

    if (!length && igdbDown) return previous; // Falha temporária não apaga o que já se sabia nem vira "sem dados"
    if (!length && appId) return previous;    // Reviews não responderam: não dá para afirmar que não há dados

    const ttl = igdbDown || reviewsDown ? RETRY_SOON_TTL_MS : length ? FOUND_TTL_MS : NOT_FOUND_TTL_MS;
    db.setPlayLength(CACHE_PREFIX + game.id, { length, expiresAt: Date.now() + ttl });
    return length;
  }
}

export const playLengthService = new PlayLengthService();
