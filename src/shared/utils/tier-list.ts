import { GameList, GameTier } from '../types/lists';

// Tier list: uma lista com fileiras (S, A, B...). Os jogos da lista que não estão em fileira nenhuma ficam em "Sem tier",
// na ordem de gameIds. Regras puras, usadas pelo main (ao salvar) e pela tela (ao mover).

// Cores do TierMaker, da melhor para a pior, e mais algumas para fileiras novas
export const TIER_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fff7f', '#7fffff', '#7fbfff', '#7f7fff', '#ff7fff', '#bf7fbf', '#cfcfcf'] as const;

export const MAX_TIERS = 20;
export const MAX_TIER_LABEL = 24;

const DEFAULT_LABELS = ['S', 'A', 'B', 'C', 'D'];

export function defaultTiers(newId: () => string): GameTier[] {
  return DEFAULT_LABELS.map((label, index) => ({ id: newId(), label, color: TIER_COLORS[index], gameIds: [] }));
}

// Fileiras válidas: com id único, nome curto, cor da paleta e só jogos da lista, cada jogo numa fileira só
export function normalizeTiers(tiers: unknown, gameIds: string[], newId: () => string): GameTier[] {
  if (!Array.isArray(tiers)) return [];
  const inList = new Set(gameIds);
  const placed = new Set<string>();
  const ids = new Set<string>();
  const result: GameTier[] = [];
  for (const raw of tiers.slice(0, MAX_TIERS)) {
    if (!raw || typeof raw !== 'object') continue;
    const tier = raw as Partial<GameTier>;
    let id = typeof tier.id === 'string' && tier.id.trim() ? tier.id.trim().slice(0, 64) : newId();
    if (ids.has(id)) id = newId();
    ids.add(id);
    const label = (typeof tier.label === 'string' ? tier.label : '').replace(/\s+/g, ' ').trim().slice(0, MAX_TIER_LABEL) || '?';
    const color = typeof tier.color === 'string' && /^#[0-9a-f]{6}$/i.test(tier.color) ? tier.color.toLowerCase() : TIER_COLORS[Math.min(result.length, TIER_COLORS.length - 1)];
    const games = (Array.isArray(tier.gameIds) ? tier.gameIds : []).filter((g): g is string => typeof g === 'string' && inList.has(g) && !placed.has(g));
    games.forEach((g) => placed.add(g));
    result.push({ id, label, color, gameIds: games });
  }
  return result;
}

export function unrankedIds(list: Pick<GameList, 'gameIds' | 'tiers'>): string[] {
  const placed = new Set((list.tiers ?? []).flatMap((t) => t.gameIds));
  return list.gameIds.filter((id) => !placed.has(id));
}

// Move um jogo para uma fileira (ou para "Sem tier", com tierId null), antes de outro jogo ou no fim
export function moveInTierList(
  list: Pick<GameList, 'gameIds' | 'tiers'>,
  gameId: string,
  tierId: string | null,
  beforeId?: string
): Pick<GameList, 'gameIds' | 'tiers'> {
  if (!list.gameIds.includes(gameId) || beforeId === gameId) return list;
  const tiers = (list.tiers ?? []).map((tier) => ({ ...tier, gameIds: tier.gameIds.filter((id) => id !== gameId) }));
  let gameIds = list.gameIds;
  const insert = (ids: string[]) => {
    const at = beforeId ? ids.indexOf(beforeId) : -1;
    return at < 0 ? [...ids, gameId] : [...ids.slice(0, at), gameId, ...ids.slice(at)];
  };
  const target = tierId ? tiers.find((t) => t.id === tierId) : undefined;
  if (target) target.gameIds = insert(target.gameIds);
  else {
    // "Sem tier" segue a ordem de gameIds: só reposiciona quando há um vizinho de referência
    const others = gameIds.filter((id) => id !== gameId);
    gameIds = beforeId && others.includes(beforeId) ? insert(others) : tierId === null ? [...others, gameId] : gameIds;
  }
  return { gameIds, tiers };
}
