import { CategoryRule, GameCategory } from '@shared/types/categories';
import { Game, GameLog } from '@shared/types/game';
import { GameList } from '@shared/types/lists';
import {
  SYNC_SCHEMA,
  SyncCategoryEntry,
  SyncGameEntry,
  SyncGameRef,
  SyncListEntry,
  SyncListTier,
  SyncSnapshot,
  SyncTombstones,
  SyncUnresolved
} from '@shared/types/sync';
import { libraryTitleKey, steamKeyOf } from './game-match';
import { normalizeTiers } from './tier-list';

export const SYNC_TOMBSTONE_MAX_AGE_MS = 90 * 86_400_000;

export interface SyncDbState {
  games: Game[];
  gameLists: GameList[];
  gameCategories: GameCategory[];
  categoriesOrderUpdatedAt?: string;
  syncTombstones?: SyncTombstones;
  syncUnresolved?: SyncUnresolved;
}

export interface AppliedSyncState {
  games: Game[];
  gameLists: GameList[];
  gameCategories: GameCategory[];
  categoriesOrderUpdatedAt?: string;
  syncTombstones: SyncTombstones;
  syncUnresolved: SyncUnresolved;
}

export interface MergeSyncResult {
  merged: SyncSnapshot;
  changedLocal: boolean;
  changedRemote: boolean;
}

const HTTPS_URL = /^https:\/\//i;
const normalizeCatName = (name: string): string =>
  name.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

const parseMs = (iso?: string): number => {
  if (!iso) return -Infinity;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : -Infinity;
};

const compareIso = (a?: string, b?: string): number => {
  const ma = parseMs(a);
  const mb = parseMs(b);
  if (ma === mb) return 0;
  return ma > mb ? 1 : -1;
};

const maxIso = (...values: Array<string | undefined>): string | undefined => {
  let best: string | undefined;
  let bestMs = -Infinity;
  for (const val of values) {
    const ms = parseMs(val);
    if (ms > bestMs) {
      bestMs = ms;
      best = val;
    }
  }
  return best;
};

const isFreshTombstone = (deletedAt: string | undefined, nowMs: number): boolean => {
  const ms = parseMs(deletedAt);
  return Number.isFinite(ms) && nowMs - ms <= SYNC_TOMBSTONE_MAX_AGE_MS;
};

export function hasLogContent(log?: GameLog): boolean {
  if (!log) return false;
  return Boolean(
    log.status ||
      log.rating !== undefined ||
      log.startedOn ||
      log.finishedOn ||
      log.review?.trim() ||
      log.notes?.trim()
  );
}

export function normalizeLog(log?: GameLog): GameLog | undefined {
  if (!log) return undefined;
  const out: GameLog = {};
  if (log.status) out.status = log.status;
  if (log.rating !== undefined) out.rating = log.rating;
  if (log.startedOn) out.startedOn = log.startedOn;
  if (log.finishedOn) out.finishedOn = log.finishedOn;
  const review = log.review?.trim();
  if (review) out.review = review;
  const notes = log.notes?.trim();
  if (notes) out.notes = notes;
  return hasLogContent(out) ? out : undefined;
}

const logsEqual = (a?: GameLog, b?: GameLog): boolean => {
  const na = normalizeLog(a);
  const nb = normalizeLog(b);
  if (!na && !nb) return true;
  if (!na || !nb) return false;
  return (
    na.status === nb.status &&
    na.rating === nb.rating &&
    na.startedOn === nb.startedOn &&
    na.finishedOn === nb.finishedOn &&
    na.review === nb.review &&
    na.notes === nb.notes
  );
};

// Quando dois bancos antigos ainda sem `logUpdatedAt` se encontram pela primeira vez, junta campos sem apagar nada
function combineUnstampedLogs(a?: GameLog, b?: GameLog): GameLog | undefined {
  const na = normalizeLog(a);
  const nb = normalizeLog(b);
  if (!na) return nb;
  if (!nb) return na;
  return normalizeLog({
    status: na.status ?? nb.status,
    rating: na.rating ?? nb.rating,
    startedOn: na.startedOn ?? nb.startedOn,
    finishedOn: na.finishedOn ?? nb.finishedOn,
    review: na.review ?? nb.review,
    notes: na.notes ?? nb.notes
  });
}

export function gameSyncKey(
  game: Pick<Game, 'id' | 'title' | 'detectedTitle' | 'platform' | 'platformGameId' | 'manualEntry'>
): string {
  const steam = steamKeyOf(game);
  if (steam) return steam;
  if (!game.manualEntry && game.platformGameId) return `${game.platform}:${game.platformGameId}`;
  return libraryTitleKey(game.detectedTitle ?? game.title) ?? `id:${game.id}`;
}

export function gameRefOf(game: Game): SyncGameRef {
  const steamKey = steamKeyOf(game);
  const tk = libraryTitleKey(game.detectedTitle ?? game.title) ?? libraryTitleKey(game.title) ?? undefined;
  return {
    key: gameSyncKey(game),
    ...(steamKey ? { steamKey } : {}),
    ...(tk ? { titleKey: tk } : {}),
    title: game.title
  };
}

const sameRef = (a: SyncGameRef, b: SyncGameRef): boolean =>
  a.key === b.key || Boolean(a.steamKey && a.steamKey === b.steamKey) || Boolean(a.titleKey && a.titleKey === b.titleKey);

const refIdentityKey = (ref: SyncGameRef): string => ref.steamKey ?? ref.titleKey ?? ref.key;

const publicCoverUrl = (game: Game): string | undefined => {
  const candidate = game.media?.coverSourceUrl ?? game.media?.publicCoverUrl ?? game.media?.coverUrl;
  return candidate && HTTPS_URL.test(candidate) ? candidate : undefined;
};

interface GameLookup {
  byId: Map<string, Game>;
  byKey: Map<string, Game[]>;
  bySteamKey: Map<string, Game[]>;
  byTitleKey: Map<string, Game[]>;
}

function buildGameLookup(games: Game[]): GameLookup {
  const byId = new Map<string, Game>();
  const byKey = new Map<string, Game[]>();
  const bySteamKey = new Map<string, Game[]>();
  const byTitleKey = new Map<string, Game[]>();

  // Jogos detectados/de loja têm prioridade sobre entradas manuais com o mesmo nome
  const ordered = [...games].sort((a, b) => Number(Boolean(a.manualEntry)) - Number(Boolean(b.manualEntry)));
  const push = (map: Map<string, Game[]>, key: string | null | undefined, game: Game) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.includes(game)) {
      list.push(game);
      map.set(key, list);
    }
  };

  for (const game of ordered) {
    byId.set(game.id, game);
    push(byKey, gameSyncKey(game), game);
    push(bySteamKey, steamKeyOf(game), game);
    push(byTitleKey, libraryTitleKey(game.detectedTitle ?? game.title), game);
    push(byTitleKey, libraryTitleKey(game.title), game);
  }
  return { byId, byKey, bySteamKey, byTitleKey };
}

function findMatchingGames(
  lookup: GameLookup,
  ref: { key: string; steamKey?: string; titleKey?: string }
): Game[] {
  const byK = lookup.byKey.get(ref.key);
  if (byK?.length) return byK;
  if (ref.steamKey) {
    const byS = lookup.bySteamKey.get(ref.steamKey);
    if (byS?.length) return byS;
  }
  if (ref.titleKey) {
    const byT = lookup.byTitleKey.get(ref.titleKey);
    if (byT?.length) return byT;
  }
  return [];
}

function entryMatches(a: { key: string; steamKey?: string; titleKey?: string }, b: { key: string; steamKey?: string; titleKey?: string }): boolean {
  if (a.key === b.key) return true;
  if (a.steamKey && b.steamKey && a.steamKey === b.steamKey) return true;
  if (a.titleKey && b.titleKey && a.titleKey === b.titleKey) return true;
  return false;
}

const canonicalEntryKey = (a: SyncGameEntry, b: SyncGameEntry): string => {
  if (a.key === b.key) return a.key;
  if (a.steamKey) return a.steamKey;
  if (b.steamKey) return b.steamKey;
  if (!a.key.startsWith('t:') && b.key.startsWith('t:')) return a.key;
  if (!b.key.startsWith('t:') && a.key.startsWith('t:')) return b.key;
  return a.key < b.key ? a.key : b.key;
};

function mergeGameEntry(a: SyncGameEntry, b: SyncGameEntry): SyncGameEntry {
  const maxDel = maxIso(a.deletedAt, b.deletedAt);
  const maxEdit = maxIso(a.logUpdatedAt, b.logUpdatedAt, a.favoriteUpdatedAt, b.favoriteUpdatedAt);
  const key = canonicalEntryKey(a, b);
  const steamKey = a.steamKey ?? b.steamKey;
  const titleKey = a.titleKey ?? b.titleKey;

  if (maxDel && (!maxEdit || compareIso(maxDel, maxEdit) >= 0)) {
    return {
      key,
      ...(steamKey ? { steamKey } : {}),
      ...(titleKey ? { titleKey } : {}),
      title: b.title || a.title,
      deletedAt: maxDel
    };
  }

  // Merge Diário (log) por `logUpdatedAt`
  let log: GameLog | undefined;
  let logUpdatedAt: string | undefined;
  let manualWinner = a;
  const logCmp = compareIso(a.logUpdatedAt, b.logUpdatedAt);
  if (logCmp > 0) {
    log = normalizeLog(a.log);
    logUpdatedAt = a.logUpdatedAt;
    manualWinner = a;
  } else if (logCmp < 0) {
    log = normalizeLog(b.log);
    logUpdatedAt = b.logUpdatedAt;
    manualWinner = b;
  } else {
    logUpdatedAt = a.logUpdatedAt ?? b.logUpdatedAt;
    log = logUpdatedAt ? normalizeLog(a.log) ?? normalizeLog(b.log) : combineUnstampedLogs(a.log, b.log);
    manualWinner = b.manualEntry && !a.manualEntry ? b : a;
  }

  // Merge Favorito (`isFavorite`) por `favoriteUpdatedAt` independente do Diário
  let isFavorite: boolean | undefined;
  let favoriteUpdatedAt: string | undefined;
  const favCmp = compareIso(a.favoriteUpdatedAt, b.favoriteUpdatedAt);
  if (favCmp > 0) {
    isFavorite = Boolean(a.isFavorite);
    favoriteUpdatedAt = a.favoriteUpdatedAt;
  } else if (favCmp < 0) {
    isFavorite = Boolean(b.isFavorite);
    favoriteUpdatedAt = b.favoriteUpdatedAt;
  } else {
    favoriteUpdatedAt = a.favoriteUpdatedAt ?? b.favoriteUpdatedAt;
    isFavorite = favoriteUpdatedAt ? Boolean(a.isFavorite || b.isFavorite) : Boolean(a.isFavorite || b.isFavorite) || undefined;
  }

  const manualEntry = Boolean(a.manualEntry || b.manualEntry) && (a.manualEntry !== false && b.manualEntry !== false);
  const isManualOnly = Boolean(manualWinner.manualEntry || (!a.platformGameId && !b.platformGameId && (a.manualEntry || b.manualEntry)));

  return {
    key,
    ...(steamKey ? { steamKey } : {}),
    ...(titleKey ? { titleKey } : {}),
    title: manualWinner.title || a.title || b.title,
    ...(manualWinner.platform ?? a.platform ?? b.platform ? { platform: manualWinner.platform ?? a.platform ?? b.platform } : {}),
    ...(manualWinner.platformGameId ?? a.platformGameId ?? b.platformGameId
      ? { platformGameId: manualWinner.platformGameId ?? a.platformGameId ?? b.platformGameId }
      : {}),
    ...(isManualOnly && (a.manualEntry || b.manualEntry) ? { manualEntry: true } : {}),
    ...(manualWinner.manualPlatform ?? a.manualPlatform ?? b.manualPlatform
      ? { manualPlatform: manualWinner.manualPlatform ?? a.manualPlatform ?? b.manualPlatform }
      : {}),
    ...(manualWinner.coverUrl ?? a.coverUrl ?? b.coverUrl ? { coverUrl: manualWinner.coverUrl ?? a.coverUrl ?? b.coverUrl } : {}),
    ...(manualWinner.totalPlaytimeSeconds !== undefined
      ? { totalPlaytimeSeconds: manualWinner.totalPlaytimeSeconds }
      : a.totalPlaytimeSeconds !== undefined || b.totalPlaytimeSeconds !== undefined
        ? { totalPlaytimeSeconds: a.totalPlaytimeSeconds ?? b.totalPlaytimeSeconds }
        : {}),
    ...(log ? { log } : {}),
    ...(logUpdatedAt ? { logUpdatedAt } : {}),
    ...(isFavorite !== undefined ? { isFavorite } : {}),
    ...(favoriteUpdatedAt ? { favoriteUpdatedAt } : {})
  };
}

function refListWithUnresolved(
  gameIds: string[],
  byId: Map<string, Game>,
  preserved: SyncGameRef[] | undefined
): SyncGameRef[] {
  const refs: SyncGameRef[] = [];
  for (const id of gameIds) {
    const g = byId.get(id);
    if (!g) continue;
    const ref = gameRefOf(g);
    if (!refs.some((r) => sameRef(r, ref))) refs.push(ref);
  }
  for (const extra of preserved ?? []) {
    if (!refs.some((r) => sameRef(r, extra))) refs.push(extra);
  }
  return refs;
}

export function buildSyncSnapshot(state: SyncDbState, nowIso = new Date().toISOString()): SyncSnapshot {
  const nowMs = parseMs(nowIso);
  const lookup = buildGameLookup(state.games);
  const entries: SyncGameEntry[] = [];

  for (const game of state.games) {
    const cleanLog = normalizeLog(game.log);
    const shouldInclude = Boolean(
      game.manualEntry || game.isFavorite || game.favoriteUpdatedAt || cleanLog || game.logUpdatedAt
    );
    if (!shouldInclude) continue;

    const steamKey = steamKeyOf(game);
    const tk = libraryTitleKey(game.detectedTitle ?? game.title) ?? libraryTitleKey(game.title) ?? undefined;
    const coverUrl = publicCoverUrl(game);

    const entry: SyncGameEntry = {
      key: gameSyncKey(game),
      ...(steamKey ? { steamKey } : {}),
      ...(tk ? { titleKey: tk } : {}),
      title: game.title,
      platform: game.platform,
      ...(game.platformGameId ? { platformGameId: game.platformGameId } : {}),
      ...(game.manualEntry ? { manualEntry: true } : {}),
      ...(game.manualPlatform ? { manualPlatform: game.manualPlatform } : {}),
      ...(coverUrl ? { coverUrl } : {}),
      ...(game.manualEntry ? { totalPlaytimeSeconds: Math.max(0, Math.round(game.totalPlaytimeSeconds ?? 0)) } : {}),
      ...(cleanLog ? { log: cleanLog } : {}),
      ...((game.logUpdatedAt ?? (game.manualEntry ? game.createdAt : undefined))
        ? { logUpdatedAt: game.logUpdatedAt ?? game.createdAt }
        : {}),
      ...(game.isFavorite || game.favoriteUpdatedAt ? { isFavorite: Boolean(game.isFavorite) } : {}),
      ...(game.favoriteUpdatedAt ? { favoriteUpdatedAt: game.favoriteUpdatedAt } : {})
    };

    const existingIndex = entries.findIndex((e) => entryMatches(e, entry));
    if (existingIndex >= 0) {
      entries[existingIndex] = mergeGameEntry(entries[existingIndex], entry);
    } else {
      entries.push(entry);
    }
  }

  // Preserva entradas remotas que pertencem a jogos ainda não presentes neste PC
  for (const extra of Object.values(state.syncUnresolved?.games ?? {})) {
    if (findMatchingGames(lookup, extra).length > 0) continue;
    const existingIndex = entries.findIndex((e) => entryMatches(e, extra));
    if (existingIndex >= 0) entries[existingIndex] = mergeGameEntry(entries[existingIndex], extra);
    else entries.push(extra);
  }

  // Tombstones de registros manuais apagados
  for (const [key, deletedAt] of Object.entries(state.syncTombstones?.manualGames ?? {})) {
    if (!isFreshTombstone(deletedAt, nowMs)) continue;
    const tomb: SyncGameEntry = {
      key,
      ...(key.startsWith('steam:') ? { steamKey: key } : {}),
      ...(key.startsWith('t:') ? { titleKey: key } : {}),
      title: key,
      deletedAt
    };
    const existingIndex = entries.findIndex((e) => entryMatches(e, tomb));
    if (existingIndex >= 0) entries[existingIndex] = mergeGameEntry(entries[existingIndex], tomb);
    else entries.push(tomb);
  }

  const lists: SyncListEntry[] = state.gameLists.map((list) => {
    const unresolved = state.syncUnresolved?.lists?.[list.id];
    const items = refListWithUnresolved(list.gameIds, lookup.byId, unresolved?.gameRefs);
    const tiers: SyncListTier[] | undefined = list.tiers?.map((tier) => ({
      id: tier.id,
      label: tier.label,
      color: tier.color,
      items: refListWithUnresolved(tier.gameIds, lookup.byId, unresolved?.tierRefs?.[tier.id])
    }));
    return {
      id: list.id,
      title: list.title,
      ...(list.description ? { description: list.description } : {}),
      ranked: list.ranked,
      featured: list.featured,
      items,
      ...(tiers ? { tiers } : {}),
      createdAt: list.createdAt,
      updatedAt: list.updatedAt
    };
  });

  for (const [id, deletedAt] of Object.entries(state.syncTombstones?.lists ?? {})) {
    if (!isFreshTombstone(deletedAt, nowMs)) continue;
    const existing = lists.find((l) => l.id === id);
    if (existing && compareIso(existing.updatedAt, deletedAt) > 0) continue;
    if (!existing) {
      lists.push({
        id,
        title: '',
        ranked: false,
        featured: false,
        items: [],
        createdAt: deletedAt,
        updatedAt: deletedAt,
        deletedAt
      });
    }
  }

  const categories: SyncCategoryEntry[] = state.gameCategories.map((cat) => {
    const unresolved = state.syncUnresolved?.categories?.[cat.id];
    return {
      id: cat.id,
      name: cat.name,
      ...(cat.rule ? { rule: cat.rule } : {}),
      items: cat.rule ? [] : refListWithUnresolved(cat.gameIds, lookup.byId, unresolved),
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt
    };
  });

  for (const [id, deletedAt] of Object.entries(state.syncTombstones?.categories ?? {})) {
    if (!isFreshTombstone(deletedAt, nowMs)) continue;
    const existing = categories.find((c) => c.id === id);
    if (existing && compareIso(existing.updatedAt, deletedAt) > 0) continue;
    if (!existing) {
      categories.push({
        id,
        name: '',
        items: [],
        createdAt: deletedAt,
        updatedAt: deletedAt,
        deletedAt
      });
    }
  }

  return {
    schema: SYNC_SCHEMA,
    games: entries,
    lists,
    categories,
    ...(state.categoriesOrderUpdatedAt
      ? { categoriesOrder: { ids: state.gameCategories.map((c) => c.id), updatedAt: state.categoriesOrderUpdatedAt } }
      : {})
  };
}

function mergeRefsUnion(a: SyncGameRef[], b: SyncGameRef[]): SyncGameRef[] {
  const out = [...a];
  for (const item of b) {
    if (!out.some((x) => sameRef(x, item))) out.push(item);
  }
  return out;
}

const sameRefsOrder = (a: SyncGameRef[], b: SyncGameRef[]): boolean =>
  a.length === b.length && a.every((x, i) => refIdentityKey(x) === refIdentityKey(b[i]));

function rulesEqual(a?: CategoryRule, b?: CategoryRule): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function gameEntriesEquivalent(a: SyncGameEntry, b: SyncGameEntry): boolean {
  if (Boolean(a.deletedAt) !== Boolean(b.deletedAt)) return false;
  if (a.deletedAt && b.deletedAt) return a.deletedAt === b.deletedAt;
  return (
    logsEqual(a.log, b.log) &&
    (a.logUpdatedAt ?? '') === (b.logUpdatedAt ?? '') &&
    Boolean(a.isFavorite) === Boolean(b.isFavorite) &&
    (a.favoriteUpdatedAt ?? '') === (b.favoriteUpdatedAt ?? '') &&
    (!a.manualEntry ||
      (a.title === b.title &&
        (a.manualPlatform ?? '') === (b.manualPlatform ?? '') &&
        (a.totalPlaytimeSeconds ?? 0) === (b.totalPlaytimeSeconds ?? 0)))
  );
}

function listsEquivalent(a: SyncListEntry, b: SyncListEntry): boolean {
  if (Boolean(a.deletedAt) !== Boolean(b.deletedAt)) return false;
  if (a.deletedAt && b.deletedAt) return a.deletedAt === b.deletedAt;
  if (
    a.title !== b.title ||
    (a.description ?? '') !== (b.description ?? '') ||
    a.ranked !== b.ranked ||
    a.featured !== b.featured ||
    a.updatedAt !== b.updatedAt ||
    !sameRefsOrder(a.items, b.items)
  ) {
    return false;
  }
  const ta = a.tiers ?? [];
  const tb = b.tiers ?? [];
  if (ta.length !== tb.length) return false;
  return ta.every(
    (t, i) =>
      t.id === tb[i].id &&
      t.label === tb[i].label &&
      t.color === tb[i].color &&
      sameRefsOrder(t.items, tb[i].items)
  );
}

function categoriesEquivalent(a: SyncCategoryEntry, b: SyncCategoryEntry): boolean {
  if (Boolean(a.deletedAt) !== Boolean(b.deletedAt)) return false;
  if (a.deletedAt && b.deletedAt) return a.deletedAt === b.deletedAt;
  return (
    a.id === b.id &&
    a.name === b.name &&
    rulesEqual(a.rule, b.rule) &&
    sameRefsOrder(a.items, b.items) &&
    a.updatedAt === b.updatedAt
  );
}

function mergeListEntry(a: SyncListEntry, b: SyncListEntry): SyncListEntry {
  const maxDel = maxIso(a.deletedAt, b.deletedAt);
  const liveA = a.deletedAt ? undefined : a;
  const liveB = b.deletedAt ? undefined : b;
  const maxUpd = maxIso(liveA?.updatedAt, liveB?.updatedAt);
  if (maxDel && (!maxUpd || compareIso(maxDel, maxUpd) >= 0)) {
    return {
      id: a.id,
      title: '',
      ranked: false,
      featured: false,
      items: [],
      createdAt: a.createdAt || b.createdAt || maxDel,
      updatedAt: maxDel,
      deletedAt: maxDel
    };
  }
  if (!liveA) return liveB!;
  if (!liveB) return liveA;
  return compareIso(liveA.updatedAt, liveB.updatedAt) >= 0 ? liveA : liveB;
}

function mergeCategoryEntry(a: SyncCategoryEntry, b: SyncCategoryEntry, keepId?: string): SyncCategoryEntry {
  const maxDel = maxIso(a.deletedAt, b.deletedAt);
  const liveA = a.deletedAt ? undefined : a;
  const liveB = b.deletedAt ? undefined : b;
  const maxUpd = maxIso(liveA?.updatedAt, liveB?.updatedAt);
  if (maxDel && (!maxUpd || compareIso(maxDel, maxUpd) >= 0)) {
    return {
      id: keepId ?? a.id,
      name: '',
      items: [],
      createdAt: a.createdAt || b.createdAt || maxDel,
      updatedAt: maxDel,
      deletedAt: maxDel
    };
  }
  if (!liveA) return keepId ? { ...liveB!, id: keepId } : liveB!;
  if (!liveB) return keepId ? { ...liveA, id: keepId } : liveA;

  const cmp = compareIso(liveA.updatedAt, liveB.updatedAt);
  const newer = cmp >= 0 ? liveA : liveB;
  const sameOriginId = liveA.id === liveB.id;
  // Categorias independentes com mesmo nome (ids diferentes antes do primeiro sync) unem os jogos manuais
  const items = !sameOriginId && !liveA.rule && !liveB.rule ? mergeRefsUnion(liveA.items, liveB.items) : newer.items;
  return {
    ...newer,
    id: keepId ?? newer.id,
    items,
    createdAt: compareIso(liveA.createdAt, liveB.createdAt) <= 0 ? liveA.createdAt : liveB.createdAt
  };
}

export function mergeSyncSnapshots(
  local: SyncSnapshot,
  remote: SyncSnapshot | null | undefined,
  nowIso = new Date().toISOString()
): MergeSyncResult {
  if (!remote) {
    return { merged: local, changedLocal: false, changedRemote: true };
  }

  // 1. Jogos (Diário + Favoritos + Tombstones de entradas manuais)
  const mergedGames: SyncGameEntry[] = local.games.map((g) => ({ ...g }));
  for (const rEntry of remote.games ?? []) {
    const idx = mergedGames.findIndex((lEntry) => entryMatches(lEntry, rEntry));
    if (idx >= 0) mergedGames[idx] = mergeGameEntry(mergedGames[idx], rEntry);
    else mergedGames.push(rEntry);
  }

  // 2. Listas
  const mergedListsMap = new Map<string, SyncListEntry>();
  for (const l of local.lists) mergedListsMap.set(l.id, l);
  for (const r of remote.lists ?? []) {
    const cur = mergedListsMap.get(r.id);
    mergedListsMap.set(r.id, cur ? mergeListEntry(cur, r) : r);
  }
  const mergedLists = [...mergedListsMap.values()];

  // 3. Categorias (por ID, com colapso seguro para categorias vivas com mesmo nome vindas de PCs diferentes)
  const idRemap = new Map<string, string>();
  const byId = new Map<string, SyncCategoryEntry>();
  for (const c of local.categories) byId.set(c.id, c);

  for (const rc of remote.categories ?? []) {
    const exact = byId.get(rc.id);
    if (exact) {
      byId.set(rc.id, mergeCategoryEntry(exact, rc));
      continue;
    }
    if (!rc.deletedAt) {
      const targetKey = normalizeCatName(rc.name);
      const sameName = [...byId.values()].find((c) => !c.deletedAt && normalizeCatName(c.name) === targetKey);
      if (sameName) {
        const merged = mergeCategoryEntry(sameName, rc, sameName.id);
        byId.set(sameName.id, merged);
        idRemap.set(rc.id, sameName.id);
        continue;
      }
    }
    byId.set(rc.id, rc);
  }

  // Ordena categorias pela ordem mais nova entre `categoriesOrder` de cada PC
  const allMergedCats = [...byId.values()];
  const lOrd = local.categoriesOrder;
  const rOrd = remote.categoriesOrder;
  let categoriesOrder: SyncSnapshot['categoriesOrder'];
  if (lOrd || rOrd) {
    const useRemote = compareIso(rOrd?.updatedAt, lOrd?.updatedAt) > 0;
    const rawOrder = (useRemote ? rOrd?.ids : lOrd?.ids) ?? [];
    const seen = new Set<string>();
    const normalizedIds: string[] = [];
    for (const rawId of rawOrder) {
      const id = idRemap.get(rawId) ?? rawId;
      if (!seen.has(id) && byId.get(id) && !byId.get(id)?.deletedAt) {
        seen.add(id);
        normalizedIds.push(id);
      }
    }
    for (const cat of allMergedCats) {
      if (!cat.deletedAt && !seen.has(cat.id)) {
        seen.add(cat.id);
        normalizedIds.push(cat.id);
      }
    }
    categoriesOrder = {
      ids: normalizedIds,
      updatedAt: maxIso(lOrd?.updatedAt, rOrd?.updatedAt) ?? nowIso
    };
  }

  const orderPos = new Map((categoriesOrder?.ids ?? []).map((id, i) => [id, i]));
  const mergedCategories = [...allMergedCats].sort((a, b) => {
    if (Boolean(a.deletedAt) !== Boolean(b.deletedAt)) return a.deletedAt ? 1 : -1;
    const pa = orderPos.get(a.id);
    const pb = orderPos.get(b.id);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return 0;
  });

  const merged: SyncSnapshot = {
    schema: SYNC_SCHEMA,
    games: mergedGames,
    lists: mergedLists,
    categories: mergedCategories,
    ...(categoriesOrder ? { categoriesOrder } : {})
  };

  // Detecta mudanças reais por lado para evitar gravações ou uploads à toa
  const sideDiffers = (side: SyncSnapshot): boolean => {
    for (const mg of merged.games) {
      const sg = side.games.find((g) => entryMatches(g, mg));
      if (!sg) {
        if (!mg.deletedAt) return true;
        // Tombstone remoto ainda fresco precisa ir para os tombstones locais se ainda não estiver registrado
        return !side.games.some((g) => entryMatches(g, mg));
      }
      if (!gameEntriesEquivalent(mg, sg)) return true;
    }
    for (const sg of side.games) {
      if (!merged.games.some((mg) => entryMatches(mg, sg))) return true;
    }

    for (const ml of merged.lists) {
      const sl = side.lists.find((l) => l.id === ml.id);
      if (!sl || !listsEquivalent(ml, sl)) return true;
    }
    for (const sl of side.lists) {
      if (!merged.lists.some((ml) => ml.id === sl.id)) return true;
    }

    const sideLiveCats = side.categories.filter((c) => !c.deletedAt);
    const mergedLiveCats = merged.categories.filter((c) => !c.deletedAt);
    if (sideLiveCats.length !== mergedLiveCats.length) return true;
    for (let i = 0; i < mergedLiveCats.length; i++) {
      const mc = mergedLiveCats[i];
      const sc = sideLiveCats[i];
      if (!sc || !categoriesEquivalent(mc, sc)) return true;
    }
    for (const mc of merged.categories) {
      if (!mc.deletedAt) continue;
      const sc = side.categories.find((c) => c.id === mc.id);
      if (!sc || sc.deletedAt !== mc.deletedAt) return true;
    }

    return false;
  };

  return {
    merged,
    changedLocal: sideDiffers(local),
    changedRemote: sideDiffers(remote)
  };
}

function resolveRefs(
  refs: SyncGameRef[],
  lookup: GameLookup
): { gameIds: string[]; unresolved: SyncGameRef[] } {
  const gameIds: string[] = [];
  const unresolved: SyncGameRef[] = [];
  for (const ref of refs) {
    const matched = findMatchingGames(lookup, ref);
    if (matched.length > 0) {
      const id = matched[0].id;
      if (!gameIds.includes(id)) gameIds.push(id);
    } else if (!unresolved.some((u) => sameRef(u, ref))) {
      unresolved.push(ref);
    }
  }
  return { gameIds, unresolved };
}

export function applySyncSnapshot(
  state: SyncDbState,
  merged: SyncSnapshot,
  nowIso = new Date().toISOString(),
  newId: () => string = () => globalThis.crypto.randomUUID()
): AppliedSyncState {
  const nowMs = parseMs(nowIso);
  let games = state.games.map((g) => ({ ...g }));
  let lookup = buildGameLookup(games);

  const manualTombstones: Record<string, string> = {};
  const unresolvedGames: Record<string, SyncGameEntry> = {};

  for (const entry of merged.games) {
    const matched = findMatchingGames(lookup, entry);

    if (entry.deletedAt) {
      if (isFreshTombstone(entry.deletedAt, nowMs)) manualTombstones[entry.key] = entry.deletedAt;
      // Apaga localmente apenas entradas manuais mais antigas que o tombstone; jogos detectados na loja nunca somem
      games = games.filter((g) => {
        if (!matched.includes(g) || !g.manualEntry) return true;
        const latestLocal = maxIso(g.logUpdatedAt, g.favoriteUpdatedAt, g.createdAt);
        return Boolean(latestLocal && compareIso(latestLocal, entry.deletedAt) > 0);
      });
      lookup = buildGameLookup(games);
      continue;
    }

    if (matched.length > 0) {
      for (const localGame of matched) {
        const idx = games.indexOf(localGame);
        if (idx < 0) continue;
        const cleanLog = normalizeLog(entry.log);
        const updated: Game = {
          ...localGame,
          log: cleanLog ?? (entry.logUpdatedAt ? {} : localGame.log),
          ...(entry.logUpdatedAt ? { logUpdatedAt: entry.logUpdatedAt } : {}),
          isFavorite: entry.isFavorite !== undefined ? entry.isFavorite : localGame.isFavorite,
          ...(entry.favoriteUpdatedAt ? { favoriteUpdatedAt: entry.favoriteUpdatedAt } : {})
        };
        if (localGame.manualEntry) {
          if (entry.title) updated.title = entry.title;
          if (entry.manualPlatform !== undefined) updated.manualPlatform = entry.manualPlatform;
          if (entry.totalPlaytimeSeconds !== undefined) updated.totalPlaytimeSeconds = entry.totalPlaytimeSeconds;
          if (!localGame.media?.coverUrl && entry.coverUrl && HTTPS_URL.test(entry.coverUrl)) {
            updated.media = { ...localGame.media, coverUrl: entry.coverUrl };
          }
        }
        games[idx] = updated;
      }
      lookup = buildGameLookup(games);
    } else if (entry.manualEntry) {
      const created: Game = {
        id: `log-${newId()}`,
        title: entry.title || 'Jogo sem nome',
        platform: 'standalone',
        executablePath: '',
        manualEntry: true,
        ...(entry.manualPlatform ? { manualPlatform: entry.manualPlatform } : {}),
        isInstalled: false,
        media: entry.coverUrl && HTTPS_URL.test(entry.coverUrl) ? { coverUrl: entry.coverUrl } : {},
        isFavorite: Boolean(entry.isFavorite),
        ...(entry.favoriteUpdatedAt ? { favoriteUpdatedAt: entry.favoriteUpdatedAt } : {}),
        isHidden: false,
        tags: [],
        totalPlaytimeSeconds: Math.max(0, Math.round(entry.totalPlaytimeSeconds ?? 0)),
        log: normalizeLog(entry.log) ?? {},
        ...(entry.logUpdatedAt ? { logUpdatedAt: entry.logUpdatedAt } : {}),
        createdAt: entry.logUpdatedAt ?? nowIso,
        updatedAt: entry.logUpdatedAt ?? nowIso
      };
      games.push(created);
      lookup = buildGameLookup(games);
    } else {
      unresolvedGames[entry.key] = entry;
    }
  }

  // Listas
  const listTombstones: Record<string, string> = {};
  const unresolvedLists: NonNullable<SyncUnresolved['lists']> = {};
  const gameLists: GameList[] = [];

  for (const item of merged.lists) {
    if (item.deletedAt) {
      if (isFreshTombstone(item.deletedAt, nowMs)) listTombstones[item.id] = item.deletedAt;
      continue;
    }
    const { gameIds, unresolved } = resolveRefs(item.items, lookup);
    const tierRefs: Record<string, SyncGameRef[]> = {};
    const rawTiers = item.tiers?.map((tier) => {
      const resolvedTier = resolveRefs(tier.items, lookup);
      if (resolvedTier.unresolved.length > 0) tierRefs[tier.id] = resolvedTier.unresolved;
      return { id: tier.id, label: tier.label, color: tier.color, gameIds: resolvedTier.gameIds };
    });
    if (unresolved.length > 0 || Object.keys(tierRefs).length > 0) {
      unresolvedLists[item.id] = {
        ...(unresolved.length > 0 ? { gameRefs: unresolved } : {}),
        ...(Object.keys(tierRefs).length > 0 ? { tierRefs } : {})
      };
    }
    gameLists.push({
      id: item.id,
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      ranked: item.ranked,
      featured: item.featured,
      gameIds,
      ...(rawTiers ? { tiers: normalizeTiers(rawTiers, gameIds, newId) } : {}),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    });
  }

  // Categorias
  const catTombstones: Record<string, string> = {};
  const unresolvedCats: NonNullable<SyncUnresolved['categories']> = {};
  const gameCategories: GameCategory[] = [];

  for (const cat of merged.categories) {
    if (cat.deletedAt) {
      if (isFreshTombstone(cat.deletedAt, nowMs)) catTombstones[cat.id] = cat.deletedAt;
      continue;
    }
    if (cat.rule) {
      gameCategories.push({
        id: cat.id,
        name: cat.name,
        gameIds: [],
        rule: cat.rule,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt
      });
    } else {
      const { gameIds, unresolved } = resolveRefs(cat.items, lookup);
      if (unresolved.length > 0) unresolvedCats[cat.id] = unresolved;
      gameCategories.push({
        id: cat.id,
        name: cat.name,
        gameIds,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt
      });
    }
  }

  return {
    games,
    gameLists,
    gameCategories,
    ...(merged.categoriesOrder?.updatedAt ? { categoriesOrderUpdatedAt: merged.categoriesOrder.updatedAt } : {}),
    syncTombstones: {
      ...(Object.keys(manualTombstones).length > 0 ? { manualGames: manualTombstones } : {}),
      ...(Object.keys(listTombstones).length > 0 ? { lists: listTombstones } : {}),
      ...(Object.keys(catTombstones).length > 0 ? { categories: catTombstones } : {})
    },
    syncUnresolved: {
      ...(Object.keys(unresolvedGames).length > 0 ? { games: unresolvedGames } : {}),
      ...(Object.keys(unresolvedLists).length > 0 ? { lists: unresolvedLists } : {}),
      ...(Object.keys(unresolvedCats).length > 0 ? { categories: unresolvedCats } : {})
    }
  };
}
