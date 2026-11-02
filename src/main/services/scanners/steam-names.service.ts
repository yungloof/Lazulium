import { Game } from '@shared/types/game';
import { db } from '../../database/db';

// Jogos antigos que não estão no appinfo.vdf recebem o nome pela loja da Steam, em segundo plano
const STORE_URL = 'https://store.steampowered.com/api/appdetails';
const REQUEST_SPACING_MS = 1_600;          // A loja limita a cerca de 200 pedidos a cada 5 minutos
const PLACEHOLDER_PATTERN = /^Jogo Steam \d+$/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const steamPlaceholderTitle = (appId: string) => `Jogo Steam ${appId}`;
export const isSteamPlaceholderTitle = (title: string) => PLACEHOLDER_PATTERN.test(title);

type GameUpdatedListener = (game: Game) => void;

class SteamNamesService {
  private listener: GameUpdatedListener = () => {};
  private running = false;
  private attempted = new Set<string>();

  setGameUpdatedListener(listener: GameUpdatedListener): void {
    this.listener = listener;
  }

  async resolveMissing(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = db
        .getGames()
        .filter((g) => g.platform === 'steam' && g.platformGameId && isSteamPlaceholderTitle(g.title) && !this.attempted.has(g.id));
      for (const game of pending) {
        this.attempted.add(game.id);
        const appId = game.platformGameId!;
        const res = await fetch(`${STORE_URL}?appids=${encodeURIComponent(appId)}&filters=basic`, {
          signal: AbortSignal.timeout(10_000)
        });
        // Limite atingido: tenta de novo na próxima abertura do app
        if (!res.ok) {
          this.attempted.delete(game.id);
          console.warn(`[SteamNames] Loja respondeu HTTP ${res.status}; parando por agora`);
          return;
        }
        const entry = ((await res.json()) as Record<string, { success?: boolean; data?: { name?: string; type?: string } }>)[appId];
        const current = db.getGameById(game.id);
        if (current && entry?.success && entry.data?.name) {
          // DLCs e demos não são jogos: o tempo fica guardado, mas fora das listas
          const updated = { ...current, title: entry.data.name, isHidden: entry.data.type !== 'game' };
          db.upsertGame(updated);
          this.listener(updated);
        }
        await sleep(REQUEST_SPACING_MS);
      }
    } catch (err) {
      console.warn('[SteamNames] Sem acesso à loja da Steam:', (err as Error).message);
    } finally {
      this.running = false;
    }
  }
}

export const steamNamesService = new SteamNamesService();
