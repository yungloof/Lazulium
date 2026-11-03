import { GamePlayLength } from '@shared/types/game';
import { db } from '../../database/db';

// O Steam não publica "tempo para zerar", mas cada review traz as horas do autor. Entre quem recomenda o jogo,
// o quartil de baixo costuma ficar perto da campanha, e a mediana, perto da campanha com extras.
const REVIEW_ENDPOINTS = ['appreviews', 'ajaxappreviews'];
const REVIEWS_PER_PAGE = 100;
const PAGES = 3;
const PAGE_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 10_000;
const MIN_SAMPLE = 50;
const OPEN_ENDED_SPREAD = 8;        // p75 muito acima de p25: multiplayer e jogos sem fim, em que "duração" não faz sentido
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;

interface ReviewsPage {
  success?: number;
  cursor?: string;
  reviews?: { author?: { playtime_at_review?: number } }[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

async function fetchPage(appId: string, cursor: string): Promise<ReviewsPage | null> {
  const query = `json=1&filter=recent&language=all&review_type=positive&purchase_type=all&num_per_page=${REVIEWS_PER_PAGE}&cursor=${encodeURIComponent(cursor)}`;
  for (const endpoint of REVIEW_ENDPOINTS) {
    const res = await fetch(`https://store.steampowered.com/${endpoint}/${encodeURIComponent(appId)}?${query}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!res.ok) continue;
    const page = (await res.json().catch(() => null)) as ReviewsPage | null;
    if (page?.success === 1) return page;
  }
  return null;
}

async function measure(appId: string): Promise<GamePlayLength | null> {
  const hours: number[] = [];
  let cursor = '*';
  for (let page = 0; page < PAGES; page++) {
    const result = await fetchPage(appId, cursor);
    if (!result) break;
    for (const review of result.reviews ?? []) {
      const minutes = review.author?.playtime_at_review ?? 0;
      if (minutes > 0) hours.push(minutes / 60);
    }
    if (!result.cursor || (result.reviews?.length ?? 0) < REVIEWS_PER_PAGE) break;
    cursor = result.cursor;
    await sleep(PAGE_DELAY_MS);
  }
  if (hours.length < MIN_SAMPLE) return null;
  hours.sort((a, b) => a - b);
  const lowHours = quantile(hours, 0.25);
  const typicalHours = quantile(hours, 0.5);
  return {
    lowHours,
    typicalHours,
    openEnded: quantile(hours, 0.75) / Math.max(lowHours, 0.1) >= OPEN_ENDED_SPREAD,
    sampleSize: hours.length,
    fetchedAt: Date.now()
  };
}

class PlayLengthService {
  private inFlight = new Map<string, Promise<GamePlayLength | null>>();

  // Informação extra da página do jogo: sem rede ou sem dados, a página só não mostra. Falha não vai para o cache.
  get(appId: string): Promise<GamePlayLength | null> {
    const cached = db.getPlayLength(appId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return Promise.resolve(cached);

    const running = this.inFlight.get(appId);
    if (running) return running;
    const task = measure(appId)
      .then((length) => {
        if (length) db.setPlayLength(appId, length);
        return length ?? cached ?? null;
      })
      .catch((err) => {
        console.warn(`[PlayLength] ${appId}: ${(err as Error).message}`);
        return cached ?? null;
      })
      .finally(() => this.inFlight.delete(appId));
    this.inFlight.set(appId, task);
    return task;
  }
}

export const playLengthService = new PlayLengthService();
