import type { GameLogStatus, GamePlatform } from './game';

export type CategoryRuleStatus = GameLogStatus | 'unplayed';

export interface CategoryRule {
  platforms?: GamePlatform[];
  statuses?: CategoryRuleStatus[];
  genres?: string[];
  series?: string[];
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
  favoritesOnly?: boolean;
  installedOnly?: boolean;
}

// Categoria criada pelo jogador para arrumar a biblioteca (como as coleções da Steam).
// Um jogo pode estar em várias; a ordem do array é a ordem em que aparecem na lista lateral.
// Quando `rule` está preenchida, os jogos são avaliados dinamicamente sobre a biblioteca.
export interface GameCategory {
  id: string;
  name: string;
  gameIds: string[];
  rule?: CategoryRule;
  createdAt: string;                // ISO timestamp
  updatedAt: string;                // ISO timestamp
}

export interface SteamCollectionsImportResult {
  categories: GameCategory[];
  created: number;
  merged: number;
  linksAdded: number;
  favoritesAdded: number;
  skippedDynamic: number;
  skippedEmpty: number;
}

export const MAX_CATEGORY_NAME = 40;
