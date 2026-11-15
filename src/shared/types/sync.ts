import { CategoryRule } from './categories';
import { GameLog, GamePlatform } from './game';

export const SYNC_SCHEMA = 'lazulium-sync/1' as const;

export interface SyncGameRef {
  key: string;                      // Chave estável entre PCs ('steam:620', 'epic:...', 't:nome', 'id:...')
  steamKey?: string;                // 'steam:<appid>' quando Steam
  titleKey?: string;                // 't:<normalizado>' para cruzar lojas, avulsos e emuladores
  title: string;                    // Nome para diagnóstico e preservação quando o outro PC não tem o jogo
}

export interface SyncGameEntry {
  key: string;
  steamKey?: string;
  titleKey?: string;
  title: string;
  platform?: GamePlatform;
  platformGameId?: string;
  manualEntry?: boolean;
  manualPlatform?: string;
  coverUrl?: string;                // Capa pública (HTTPS), nunca arquivo local
  totalPlaytimeSeconds?: number;    // Preservado em entradas manuais do Diário
  log?: GameLog;                    // Status, nota, datas, resenha e anotações (cópia privada da conta)
  logUpdatedAt?: string;
  isFavorite?: boolean;
  favoriteUpdatedAt?: string;
  deletedAt?: string;               // Marca de exclusão com data para não ressuscitar ao sincronizar
}

export interface SyncListTier {
  id: string;
  label: string;
  color: string;
  items: SyncGameRef[];
}

export interface SyncListEntry {
  id: string;
  title: string;
  description?: string;
  ranked: boolean;
  featured: boolean;
  items: SyncGameRef[];
  tiers?: SyncListTier[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SyncCategoryEntry {
  id: string;
  name: string;
  rule?: CategoryRule;
  items: SyncGameRef[];             // Só preenchido em categorias manuais (`!rule`)
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SyncSnapshot {
  schema: typeof SYNC_SCHEMA;
  games: SyncGameEntry[];
  lists: SyncListEntry[];
  categories: SyncCategoryEntry[];
  categoriesOrder?: { ids: string[]; updatedAt: string };
}

export interface SyncTombstones {
  manualGames?: Record<string, string>; // key -> deletedAt ISO
  lists?: Record<string, string>;       // list.id -> deletedAt ISO
  categories?: Record<string, string>;  // category.id -> deletedAt ISO
}

export interface SyncUnresolved {
  games?: Record<string, SyncGameEntry>; // key -> registro de jogo que este PC ainda não tem na biblioteca
  lists?: Record<string, { gameRefs?: SyncGameRef[]; tierRefs?: Record<string, SyncGameRef[]> }>;
  categories?: Record<string, SyncGameRef[]>;
}

export interface SyncStatusState {
  enabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  revision: number;
  syncing: boolean;
}

export interface SyncResult {
  syncedAt: string;
  revision: number;
  changedLocal: boolean;
  changedRemote: boolean;
}
