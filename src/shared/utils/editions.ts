import { Game, GameEdition, GamePlatform } from '../types/game';
import { titleKey } from './title-key';

// Mesmo jogo em lojas diferentes (GTA V na Steam e na Epic): no banco continua um registro por loja (scanner,
// horas e conquistas de cada uma seguem iguais); na tela vira um card só, com as horas somadas e a escolha de
// por onde abrir. Junta pelo nome, só entre lojas diferentes e só lojas de verdade: jogo avulso, de emulador ou
// registrado à mão fica de fora, porque o nome deles vem da pasta e pode coincidir com outro jogo.

export const EDITION_PLATFORMS: readonly GamePlatform[] = ['steam', 'epic', 'gog', 'ea', 'ubisoft', 'battlenet', 'xbox', 'riot'];

// A principal (id e dados que a tela usa: Diário, listas, capa) é a da loja mais completa, nesta ordem
const PRIORITY = new Map(EDITION_PLATFORMS.map((p, i) => [p, i]));

export interface EditionPrefs {
  split: string[];                    // Chaves (editionKey) que o jogador separou
  preferred: Record<string, string>;  // Id da principal -> id da loja escolhida para abrir
}

export const EMPTY_EDITION_PREFS: EditionPrefs = { split: [], preferred: {} };

export function editionKey(game: Pick<Game, 'title' | 'detectedTitle' | 'platform' | 'manualEntry' | 'isHidden'>): string | null {
  if (game.manualEntry || game.isHidden || !PRIORITY.has(game.platform)) return null;
  // Pelo nome da loja: renomear o card não desfaz a junção
  const key = titleKey(game.detectedTitle ?? game.title);
  return key.length >= 2 ? key : null;
}

const toEdition = (game: Game): GameEdition => ({
  id: game.id,
  platform: game.platform,
  isInstalled: game.isInstalled !== false,
  playtimeSeconds: game.totalPlaytimeSeconds ?? 0,
  ...(game.lastPlayedAt ? { lastPlayedAt: game.lastPlayedAt } : {})
});

const latest = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);

export interface FoldResult {
  games: Game[];                      // Para a tela: cada jogo uma vez
  primaryOf: Map<string, string>;     // Id de qualquer loja -> id da principal (só de quem foi juntado)
}

export function foldEditions(raw: Game[], prefs: EditionPrefs = EMPTY_EDITION_PREFS): FoldResult {
  const split = new Set(prefs.split);
  const groups = new Map<string, Game[]>();
  for (const game of raw) {
    const key = editionKey(game);
    if (!key || split.has(key)) continue;
    const group = groups.get(key);
    // Uma por loja: dois registros da mesma loja com o mesmo nome não são o mesmo jogo em lojas diferentes
    if (!group) groups.set(key, [game]);
    else if (!group.some((g) => g.platform === game.platform)) group.push(game);
  }

  const primaryOf = new Map<string, string>();
  const folded = new Map<string, Game>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const members = [...group].sort((a, b) => PRIORITY.get(a.platform)! - PRIORITY.get(b.platform)!);
    const [primary, ...others] = members;
    for (const member of members) primaryOf.set(member.id, primary.id);
    folded.set(primary.id, {
      ...primary,
      editions: members.map(toEdition),
      totalPlaytimeSeconds: members.reduce((sum, g) => sum + (g.totalPlaytimeSeconds ?? 0), 0),
      isInstalled: members.some((g) => g.isInstalled !== false),
      isFavorite: members.some((g) => g.isFavorite),
      isRunning: members.some((g) => g.isRunning),
      lastPlayedAt: members.reduce<string | undefined>((at, g) => latest(at, g.lastPlayedAt), undefined),
      // O registro do Diário fica na principal; se só a outra loja tinha, ele aparece até ser editado
      log: primary.log ?? others.find((g) => g.log)?.log
    });
  }

  const games: Game[] = [];
  for (const game of raw) {
    const primaryId = primaryOf.get(game.id);
    if (!primaryId) games.push(game);
    else if (primaryId === game.id) games.push(folded.get(game.id)!);
  }
  return { games, primaryOf };
}

// Por onde abrir: a loja escolhida (se ainda instalada), senão a instalada jogada por último, senão a principal
export function launchEdition(game: Pick<Game, 'id' | 'editions'>, preferredId?: string): string {
  const editions = game.editions;
  if (!editions || editions.length === 0) return game.id;
  const installed = editions.filter((e) => e.isInstalled);
  if (preferredId && installed.some((e) => e.id === preferredId)) return preferredId;
  if (installed.length === 0) return preferredId && editions.some((e) => e.id === preferredId) ? preferredId : editions[0].id;
  return [...installed].sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))[0].id;
}

// Ids de todos os registros por trás de um card (o dele e o das outras lojas)
export function editionIds(game: Pick<Game, 'id' | 'editions'>): string[] {
  return [...new Set([game.id, ...(game.editions ?? []).map((e) => e.id)])];
}

// Lista feita antes de juntar pode guardar o id da outra loja: na tela, cada jogo vira o id do card, sem repetir
export function resolveEditionIds(ids: string[], primaryOf: Map<string, string>): string[] {
  return [...new Set(ids.map((id) => primaryOf.get(id) ?? id))];
}

// Guardado nas configurações (texto JSON), como as outras preferências da tela
export const EDITION_SETTING_KEYS = { split: 'editionsSplit', preferred: 'editionsPreferred' } as const;

export function parseEditionPrefs(settings: Record<string, string | undefined> | undefined): EditionPrefs {
  const read = (key: string): unknown => {
    try {
      return JSON.parse(settings?.[key] ?? 'null');
    } catch {
      return null;
    }
  };
  const split = read(EDITION_SETTING_KEYS.split);
  const preferred = read(EDITION_SETTING_KEYS.preferred);
  return {
    split: Array.isArray(split) ? split.filter((k): k is string => typeof k === 'string') : [],
    preferred:
      preferred && typeof preferred === 'object' && !Array.isArray(preferred)
        ? Object.fromEntries(Object.entries(preferred).filter((e): e is [string, string] => typeof e[1] === 'string'))
        : {}
  };
}
