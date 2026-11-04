import { Notification } from 'electron';
import { WishlistItem, WishlistState } from '@shared/types/wishlist';
import { db } from '../../database/db';

const WISHLIST_URL = 'https://api.steampowered.com/IWishlistService/GetWishlist/v1/';
const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const PRICE_BATCH = 50;             // A loja aceita vários jogos de uma vez só quando pede apenas o preço
const NAME_DELAY_MS = 350;          // Nome vem um jogo por vez: a loja limita a uns 200 pedidos a cada 5 min
const REQUEST_TIMEOUT_MS = 12_000;
const LAST_SYNC_SETTING = 'wishlistSyncAt';
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const SILENT_MODE = process.env.LAZULIUM_SILENT === '1';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PriceOverview {
  initial?: number;
  final?: number;
  discount_percent?: number;
  final_formatted?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchAccountWishlist(steamId: string): Promise<{ appid: number; date_added?: number }[]> {
  const data = await getJson<{ response?: { items?: { appid: number; date_added?: number }[] } }>(`${WISHLIST_URL}?steamid=${encodeURIComponent(steamId)}`);
  return data.response?.items ?? [];
}

async function fetchDetails(appId: number): Promise<{ name?: string; isFree?: boolean }> {
  const data = await getJson<Record<string, { success?: boolean; data?: { name?: string; is_free?: boolean } }>>(`${APP_DETAILS_URL}?appids=${appId}&cc=br&l=portuguese`);
  const entry = data[String(appId)]?.data;
  return { name: entry?.name, isFree: entry?.is_free };
}

async function fetchPrices(appIds: number[]): Promise<Map<number, PriceOverview | null>> {
  const prices = new Map<number, PriceOverview | null>();
  for (let i = 0; i < appIds.length; i += PRICE_BATCH) {
    const batch = appIds.slice(i, i + PRICE_BATCH);
    const data = await getJson<Record<string, { success?: boolean; data?: { price_overview?: PriceOverview } | unknown[] }>>(`${APP_DETAILS_URL}?appids=${batch.join(',')}&cc=br&filters=price_overview`);
    for (const id of batch) {
      const entry = data[String(id)];
      // Sem preço a loja responde "data: []": jogo grátis, ainda não lançado ou fora de venda
      prices.set(id, entry?.data && !Array.isArray(entry.data) ? entry.data.price_overview ?? null : null);
    }
  }
  return prices;
}

// Vale avisar quando chegou no alvo ou entrou em promoção mais barata do que a última avisada
function shouldNotify(item: WishlistItem): boolean {
  if (item.priceCents === undefined) return false;
  if (item.notifiedCents !== undefined && item.priceCents >= item.notifiedCents) return false;
  if (item.targetCents !== undefined) return item.priceCents <= item.targetCents;
  return (item.discountPercent ?? 0) > 0;
}

class WishlistService {
  private running?: Promise<WishlistState>;

  getState(warning?: string): WishlistState {
    return { items: db.getWishlist(), lastSyncAt: db.getSettings()[LAST_SYNC_SETTING] || undefined, warning };
  }

  syncInBackground(): void {
    const last = Date.parse(db.getSettings()[LAST_SYNC_SETTING] ?? '');
    if (Date.now() - last < SYNC_INTERVAL_MS) return;
    this.sync().catch((err) => console.warn(`[Desejos] ${(err as Error).message}`));
  }

  sync(): Promise<WishlistState> {
    this.running ??= this.runSync().finally(() => (this.running = undefined));
    return this.running;
  }

  private async runSync(): Promise<WishlistState> {
    const steamId = db.getSettings().steamUserId;
    const previous = new Map(db.getWishlist().map((item) => [item.appId, item]));
    const items = new Map([...previous].filter(([, item]) => item.source === 'manual'));
    let warning: string | undefined;

    if (steamId) {
      try {
        const account = await fetchAccountWishlist(steamId);
        for (const entry of account) {
          const known = previous.get(entry.appid);
          items.set(entry.appid, known ?? {
            appId: entry.appid,
            name: `Jogo ${entry.appid}`,
            source: 'steam',
            addedAt: new Date((entry.date_added ?? Date.now() / 1000) * 1000).toISOString()
          });
        }
        // Lista vazia pode ser perfil privado: não apaga o que já estava aqui
        if (account.length === 0) {
          for (const [id, item] of previous) if (item.source === 'steam') items.set(id, item);
          warning = 'A Steam não mostrou nenhum desejo. Se você tem jogos lá, deixe os detalhes dos jogos do perfil como públicos na privacidade da Steam.';
        }
      } catch (err) {
        for (const [id, item] of previous) items.set(id, item);
        warning = `Não foi possível ler a lista da Steam (${(err as Error).message}). Confira a internet e clique em Atualizar.`;
      }
    } else if (previous.size > 0 || items.size === 0) {
      for (const [id, item] of previous) items.set(id, item);
      warning = 'Conecte a Steam em Configurações → Contas para trazer sua lista de desejos.';
    }

    const list = [...items.values()];
    for (const item of list) {
      if (!item.name.startsWith('Jogo ') && item.isFree !== undefined) continue;
      try {
        const details = await fetchDetails(item.appId);
        if (details.name) item.name = details.name;
        item.isFree = !!details.isFree;
      } catch {
        // Fica com o nome provisório; a próxima atualização tenta de novo
      }
      await sleep(NAME_DELAY_MS);
    }

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
      this.notify(list);
    } catch (err) {
      warning ??= `Não foi possível atualizar os preços (${(err as Error).message}). Confira a internet e clique em Atualizar.`;
    }

    db.setWishlist(list);
    if (!warning) db.setSetting(LAST_SYNC_SETTING, new Date().toISOString());
    console.log(`[Desejos] ${list.length} jogos; ${list.filter((i) => (i.discountPercent ?? 0) > 0).length} em promoção`);
    return this.getState(warning);
  }

  private notify(list: WishlistItem[]): void {
    const deals = list.filter(shouldNotify);
    for (const item of deals) item.notifiedCents = item.priceCents;
    // Preço voltou a subir: a próxima promoção avisa de novo
    for (const item of list) {
      if (item.notifiedCents !== undefined && item.priceCents !== undefined && item.priceCents > item.notifiedCents) item.notifiedCents = undefined;
    }
    if (deals.length === 0 || SILENT_MODE || !Notification.isSupported()) return;
    const [first] = deals;
    const body = deals.length === 1 ? `${first.name}: ${first.priceLabel}${first.discountPercent ? ` (-${first.discountPercent}%)` : ''}` : `${first.name} e mais ${deals.length - 1} jogos da sua lista`;
    new Notification({ title: 'Promoção na lista de desejos', body }).show();
  }

  async add(appId: number, name: string): Promise<WishlistState> {
    if (!Number.isInteger(appId) || appId <= 0) throw new Error('Jogo inválido.');
    const list = db.getWishlist();
    if (!list.some((item) => item.appId === appId)) {
      db.setWishlist([{ appId, name: name.trim().slice(0, 200) || `Jogo ${appId}`, source: 'manual', addedAt: new Date().toISOString() }, ...list]);
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
