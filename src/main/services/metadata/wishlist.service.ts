import { Notification } from 'electron';
import { WishlistDeals, WishlistItem, WishlistState } from '@shared/types/wishlist';
import { igdbProxyUrl } from './play-length.service';
import { db } from '../../database/db';
import { HttpError, describeError, fetchJson, isConnectionError, logBackgroundFailure, sleep } from './http';

const WISHLIST_URL = 'https://api.steampowered.com/IWishlistService/GetWishlist/v1/';
const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const PRICE_BATCH = 50;             // A loja aceita vários jogos de uma vez só quando pede apenas o preço
const NAME_DELAY_MS = 350;          // Nome vem um jogo por vez: a loja limita a uns 200 pedidos a cada 5 min
const REQUEST_TIMEOUT_MS = 12_000;
const LAST_SYNC_SETTING = 'wishlistSyncAt';
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const SILENT_MODE = process.env.LAZULIUM_SILENT === '1';
const DEALS_BATCH = 20;             // Cabe no limite de 50 subrequests do cache por jogo do Worker (20 match + 1 fetch + 20 put)
const STEAM = { service: 'a Steam', timeoutMs: REQUEST_TIMEOUT_MS };
const STORE = { service: 'a loja da Steam', timeoutMs: REQUEST_TIMEOUT_MS, retries: 1 };
const OFFLINE_WARNING = 'Sem conexão com a internet: a lista mostra os preços da última atualização. Com a conexão de volta, clique em Atualizar.';
// O GG.deals leva pelo AppID da Steam à página do jogo, com todas as lojas
const GGDEALS_GAME_URL = (appId: number) => `https://gg.deals/steam/app/${appId}/`;
const STEAM_IMAGE = /^https:\/\/[a-z0-9.-]+\.(steamstatic|steampowered)\.com\//;

interface PriceOverview {
  initial?: number;
  final?: number;
  discount_percent?: number;
  final_formatted?: string;
}

const isAppId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const cents = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined);

async function fetchAccountWishlist(steamId: string): Promise<{ appid: number; date_added?: number }[]> {
  const data = await fetchJson<{ response?: { items?: unknown } } | null>(`${WISHLIST_URL}?steamid=${encodeURIComponent(steamId)}`, STEAM);
  const items = Array.isArray(data?.response?.items) ? (data.response.items as { appid?: unknown; date_added?: unknown }[]) : [];
  return items.flatMap((item) =>
    item && isAppId(item.appid) ? [{ appid: item.appid, date_added: typeof item.date_added === 'number' && item.date_added > 0 ? item.date_added : undefined }] : []
  );
}

async function fetchDetails(appId: number): Promise<{ name?: string; isFree?: boolean; imageUrl?: string }> {
  const data = await fetchJson<Record<string, { success?: boolean; data?: { name?: unknown; is_free?: unknown; header_image?: unknown } } | null> | null>(
    `${APP_DETAILS_URL}?appids=${appId}&cc=br&l=portuguese`,
    STORE
  );
  const entry = data?.[String(appId)]?.data;
  return {
    name: typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 200) : undefined,
    isFree: typeof entry?.is_free === 'boolean' ? entry.is_free : undefined,
    imageUrl: typeof entry?.header_image === 'string' && STEAM_IMAGE.test(entry.header_image) ? entry.header_image : undefined
  };
}

function toPrice(value: unknown): PriceOverview | null {
  if (!value || typeof value !== 'object') return null;
  const price = value as Record<string, unknown>;
  const final = cents(price.final);
  if (final === undefined) return null;
  return {
    final,
    initial: cents(price.initial),
    discount_percent: typeof price.discount_percent === 'number' && price.discount_percent >= 0 && price.discount_percent <= 100 ? price.discount_percent : undefined,
    final_formatted: typeof price.final_formatted === 'string' ? price.final_formatted.slice(0, 40) : undefined
  };
}

async function fetchPrices(appIds: number[]): Promise<Map<number, PriceOverview | null>> {
  const prices = new Map<number, PriceOverview | null>();
  for (let i = 0; i < appIds.length; i += PRICE_BATCH) {
    const batch = appIds.slice(i, i + PRICE_BATCH);
    const data = await fetchJson<Record<string, { success?: boolean; data?: { price_overview?: unknown } | unknown[] } | null> | null>(
      `${APP_DETAILS_URL}?appids=${batch.join(',')}&cc=br&filters=price_overview`,
      STORE
    );
    for (const id of batch) {
      const entry = data?.[String(id)];
      // Sem preço a loja responde "data: []": jogo grátis, ainda não lançado ou fora de venda
      prices.set(id, entry?.data && !Array.isArray(entry.data) ? toPrice(entry.data.price_overview) : null);
    }
  }
  return prices;
}

interface DealsResponse {
  prices?: Record<string, { url?: unknown; currency?: unknown; retail?: unknown; keyshops?: unknown; lowestRetail?: unknown; lowestKeyshops?: unknown } | null>;
}

interface DealsBatchResult {
  deals: Map<number, WishlistDeals>;
  failed: boolean;
  errorMessage?: string;
}

// Prioriza jogos ainda sem preços ou com consulta mais antiga para que listas grandes avancem mesmo se bater cota.
export function orderDealsTargets(list: readonly WishlistItem[]): number[] {
  return [...list]
    .sort((a, b) => {
      if (Boolean(a.deals) !== Boolean(b.deals)) return a.deals ? 1 : -1;
      return (a.deals?.checkedAt ?? '').localeCompare(b.deals?.checkedAt ?? '');
    })
    .map((item) => item.appId);
}

// Outras lojas, pelo nosso servidor (é ele que guarda a chave do GG.deals). Fora do ar ou sem chave, a lista segue só com a Steam.
export async function fetchDeals(appIds: number[]): Promise<DealsBatchResult> {
  const deals = new Map<number, WishlistDeals>();
  const checkedAt = new Date().toISOString();
  for (let i = 0; i < appIds.length; i += DEALS_BATCH) {
    const batch = appIds.slice(i, i + DEALS_BATCH);
    try {
      const data = await fetchJson<DealsResponse | null>(`${igdbProxyUrl()}/v1/prices?steamAppIds=${batch.join(',')}`, {
        service: 'o servidor de preços do Lazulium',
        timeoutMs: REQUEST_TIMEOUT_MS
      });
      const prices = data?.prices && typeof data.prices === 'object' ? data.prices : {};
      for (const id of batch) {
        const entry = prices[String(id)];
        if (!entry || typeof entry !== 'object' || typeof entry.currency !== 'string' || !/^[A-Z]{3}$/.test(entry.currency)) continue;
        deals.set(id, {
          url: typeof entry.url === 'string' && entry.url.startsWith('https://gg.deals/') ? entry.url : undefined,
          currency: entry.currency,
          retailCents: cents(entry.retail),
          keyshopCents: cents(entry.keyshops),
          lowestRetailCents: cents(entry.lowestRetail),
          lowestKeyshopCents: cents(entry.lowestKeyshops),
          checkedAt
        });
      }
    } catch (err) {
      // Mantém os lotes já recebidos: listas muito grandes não perdem tudo se um lote posterior falhar
      return { deals, failed: true, errorMessage: describeError(err) };
    }
  }
  return { deals, failed: false };
}

// Menor preço em loja oficial: a Steam ou outra que o GG.deals achou
const bestOfficialCents = (item: WishlistItem) => {
  const prices = [item.priceCents, item.deals?.currency === 'BRL' ? item.deals.retailCents : undefined].filter((p): p is number => p !== undefined);
  return prices.length ? Math.min(...prices) : undefined;
};

// Vale avisar quando chegou no alvo ou entrou em promoção mais barata do que a última avisada
function shouldNotify(item: WishlistItem): boolean {
  const price = bestOfficialCents(item);
  if (price === undefined) return false;
  if (item.notifiedCents !== undefined && price >= item.notifiedCents) return false;
  if (item.targetCents !== undefined) return price <= item.targetCents;
  return (item.discountPercent ?? 0) > 0;
}

class WishlistService {
  private running?: Promise<WishlistState>;
  private dealsWarned = false;

  getState(warning?: string): WishlistState {
    return { items: db.getWishlist(), lastSyncAt: db.getSettings()[LAST_SYNC_SETTING] || undefined, warning };
  }

  // Ao abrir o app: sem internet, só tenta de novo na próxima abertura (a data da última atualização não muda)
  syncInBackground(): void {
    const last = Date.parse(db.getSettings()[LAST_SYNC_SETTING] ?? '');
    if (Date.now() - last < SYNC_INTERVAL_MS) return;
    this.sync().catch((err) => logBackgroundFailure('[Desejos]', err));
  }

  sync(): Promise<WishlistState> {
    this.running ??= this.runSync().finally(() => (this.running = undefined));
    return this.running;
  }

  private async runSync(): Promise<WishlistState> {
    const steamId = db.getSettings().steamUserId;
    // Cópias: a atualização nunca altera os itens do banco no meio do caminho
    const snapshot = new Map(db.getWishlist().map((item) => [item.appId, { ...item }]));
    const items = new Map([...snapshot].filter(([, item]) => item.source === 'manual'));
    let warning: string | undefined;

    if (steamId) {
      try {
        const account = await fetchAccountWishlist(steamId);
        for (const entry of account) {
          const known = snapshot.get(entry.appid);
          items.set(entry.appid, known ?? {
            appId: entry.appid,
            name: `Jogo ${entry.appid}`,
            source: 'steam',
            addedAt: new Date((entry.date_added ?? Date.now() / 1000) * 1000).toISOString()
          });
        }
        // Lista vazia pode ser perfil privado: não apaga o que já estava aqui
        if (account.length === 0) {
          for (const [id, item] of snapshot) if (item.source === 'steam') items.set(id, item);
          warning = 'A Steam não mostrou nenhum desejo. Se você tem jogos lá, deixe os detalhes dos jogos do perfil como públicos na privacidade da Steam.';
        }
      } catch (err) {
        // Sem internet não há nada a atualizar: a lista fica como está, sem gravar
        if (isConnectionError(err)) return this.getState(OFFLINE_WARNING);
        for (const [id, item] of snapshot) items.set(id, item);
        warning = `Não foi possível ler a lista da Steam (${describeError(err)}). Clique em Atualizar para tentar de novo.`;
      }
    } else if (snapshot.size > 0 || items.size === 0) {
      for (const [id, item] of snapshot) items.set(id, item);
      warning = 'Conecte a Steam em Configurações → Contas para trazer sua lista de desejos.';
    }

    const list = [...items.values()];
    let offline = false;
    for (const item of list) {
      if (!item.name.startsWith('Jogo ') && item.isFree !== undefined && item.imageUrl) continue;
      try {
        const details = await fetchDetails(item.appId);
        if (details.name) item.name = details.name;
        item.isFree = !!details.isFree;
        item.imageUrl = details.imageUrl ?? item.imageUrl;
      } catch (err) {
        // Fica com o nome provisório; a próxima atualização tenta de novo. Sem rede ou no limite da loja, para aqui.
        if (isConnectionError(err)) offline = true;
        if (offline || (err instanceof HttpError && err.status === 429)) break;
      }
      await sleep(NAME_DELAY_MS);
    }

    if (!offline) {
      try {
        const prices = await fetchPrices(list.map((item) => item.appId));
        const now = new Date().toISOString();
        for (const item of list) {
          const price = prices.get(item.appId);
          item.checkedAt = now;
          item.noPrice = !price && !item.isFree;
          item.priceCents = price?.final;
          item.initialCents = price?.initial;
          item.discountPercent = price?.discount_percent;
          item.priceLabel = price?.final_formatted;
          if (price?.final !== undefined) item.lowestCents = Math.min(item.lowestCents ?? price.final, price.final);
        }
        const { deals, failed, errorMessage } = await fetchDeals(orderDealsTargets(list));
        for (const item of list) item.deals = deals.get(item.appId) ?? item.deals;
        if (!failed) {
          this.dealsWarned = false;
        } else {
          // Servidor de preços fora do ar, sem a chave do GG.deals ou cota momentânea: avisa uma vez por sessão
          if (!this.dealsWarned) console.warn(`[Desejos] Preços de outras lojas indisponíveis: ${errorMessage ?? 'erro desconhecido'}`);
          this.dealsWarned = true;
        }
        this.notify(list);
      } catch (err) {
        if (isConnectionError(err)) offline = true;
        else warning ??= `Não foi possível atualizar os preços (${describeError(err)}). Clique em Atualizar para tentar de novo.`;
      }
    }
    if (offline) warning ??= OFFLINE_WARNING;

    this.commit(list, snapshot);
    if (!warning) db.setSetting(LAST_SYNC_SETTING, new Date().toISOString());
    console.log(`[Desejos] ${list.length} jogos; ${list.filter((i) => (i.discountPercent ?? 0) > 0).length} em promoção`);
    return this.getState(warning);
  }

  // Grava o resultado sem desfazer o que o jogador mudou enquanto a atualização rodava (remover, preço-alvo, adicionar)
  private commit(list: WishlistItem[], snapshot: Map<number, WishlistItem>): void {
    const current = new Map(db.getWishlist().map((item) => [item.appId, item]));
    const merged: WishlistItem[] = [];
    for (const item of list) {
      const now = current.get(item.appId);
      if (!now && snapshot.has(item.appId)) continue;
      const targetChanged = now && now.targetCents !== snapshot.get(item.appId)?.targetCents;
      merged.push(targetChanged ? { ...item, targetCents: now.targetCents, notifiedCents: now.notifiedCents } : item);
    }
    const kept = new Set(merged.map((item) => item.appId));
    for (const [appId, item] of current) if (!snapshot.has(appId) && !kept.has(appId)) merged.push(item);
    db.setWishlist(merged);
  }

  private notify(list: WishlistItem[]): void {
    const deals = list.filter(shouldNotify);
    for (const item of deals) item.notifiedCents = bestOfficialCents(item);
    // Preço voltou a subir: a próxima promoção avisa de novo
    for (const item of list) {
      const price = bestOfficialCents(item);
      if (item.notifiedCents !== undefined && price !== undefined && price > item.notifiedCents) item.notifiedCents = undefined;
    }
    if (deals.length === 0 || SILENT_MODE || !Notification.isSupported()) return;
    const [first] = deals;
    const brl = (value?: number) => (value === undefined ? '' : (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
    const body = deals.length === 1 ? `${first.name}: ${brl(bestOfficialCents(first))}${bestOfficialCents(first) === first.priceCents && first.discountPercent ? ` (-${first.discountPercent}%)` : ''}` : `${first.name} e mais ${deals.length - 1} jogos da sua lista`;
    new Notification({ title: 'Promoção na lista de desejos', body }).show();
  }

  dealsUrl(appId: number): string {
    return db.getWishlist().find((item) => item.appId === appId)?.deals?.url ?? GGDEALS_GAME_URL(appId);
  }

  async add(appId: number, name: string): Promise<WishlistState> {
    if (!Number.isInteger(appId) || appId <= 0) throw new Error('Jogo inválido.');
    // Uma atualização em andamento não traria o preço do jogo novo: espera ela e atualiza de novo
    await this.running?.catch(() => undefined);
    const list = db.getWishlist();
    if (!list.some((item) => item.appId === appId)) {
      db.setWishlist([{ appId, name: String(name ?? '').trim().slice(0, 200) || `Jogo ${appId}`, source: 'manual', addedAt: new Date().toISOString() }, ...list]);
    }
    return this.sync();
  }

  remove(appId: number): WishlistState {
    db.setWishlist(db.getWishlist().filter((item) => item.appId !== appId));
    return this.getState();
  }

  setTarget(appId: number, targetCents: number | null): WishlistState {
    db.setWishlist(db.getWishlist().map((item) => (item.appId === appId ? { ...item, targetCents: targetCents && targetCents > 0 ? Math.round(targetCents) : undefined, notifiedCents: undefined } : item)));
    return this.getState();
  }
}

export const wishlistService = new WishlistService();
