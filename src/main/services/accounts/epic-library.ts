import { Game } from '@shared/types/game';

// Biblioteca da conta da Epic: os jogos que a pessoa tem e já jogou, mesmo sem estarem instalados neste PC
// (como o histórico da Steam). Os dados vêm do mesmo acesso público do launcher que o Legendary, o Heroic e o
// Playnite usam: library-service (o que a conta tem) e catalog (nome, capa e se é jogo ou DLC).
// Aqui ficam só as regras, sem rede, para dar para testar.

export interface EpicLibraryRecord {
  appName?: string;
  namespace?: string;
  catalogItemId?: string;
  sandboxType?: string;             // "PUBLIC", "PRIVATE" (versões de teste de desenvolvedor)
}

export interface EpicCatalogItem {
  id?: string;
  title?: string;
  keyImages?: { type?: string; url?: string }[];
  categories?: { path?: string }[];
  mainGameItem?: unknown;           // Preenchido nas DLCs
  releaseInfo?: { appId?: string; platform?: string[] }[];
}

// Endereço que o launcher da Epic entende: com o jogo instalado abre, sem ele oferece a instalação
export function epicLauncherUri(namespace: string | undefined, catalogItemId: string | undefined, appName: string, action: 'launch' | 'install'): string {
  const id = namespace && catalogItemId ? `${namespace}%3A${catalogItemId}%3A${appName}` : appName;
  return `com.epicgames.launcher://apps/${id}?action=${action}&silent=true`;
}

// Registros que podem virar jogo: com nome interno, fora dos pacotes da Unreal ("ue") e das versões privadas de teste
export function usableRecords(records: EpicLibraryRecord[]): Map<string, EpicLibraryRecord> {
  const byApp = new Map<string, EpicLibraryRecord>();
  for (const record of records) {
    if (!record?.appName || !record.namespace || !record.catalogItemId) continue;
    if (record.namespace === 'ue' || record.sandboxType === 'PRIVATE') continue;
    const key = record.appName.toLowerCase();
    if (!byApp.has(key)) byApp.set(key, record);
  }
  return byApp;
}

// Jogo de Windows de verdade: nem DLC, nem programa (Unreal Engine, ferramentas), nem só de Mac
export function isPlayableGame(item: EpicCatalogItem | undefined): item is EpicCatalogItem & { title: string } {
  if (!item?.title?.trim() || item.mainGameItem) return false;
  const paths = (item.categories ?? []).map((c) => c.path ?? '');
  if (paths.length > 0 && !paths.some((p) => p === 'games' || p.startsWith('games/'))) return false;
  const platforms = (item.releaseInfo ?? []).flatMap((r) => r.platform ?? []);
  if (platforms.length > 0 && !platforms.includes('Windows')) return false;
  return true;
}

function image(item: EpicCatalogItem, ...types: string[]): string | undefined {
  for (const type of types) {
    const url = item.keyImages?.find((k) => k.type === type)?.url;
    if (url && url.startsWith('https://')) return url;
  }
  return undefined;
}

// Jogo da conta que não está no PC: entra como "não instalado", com as horas da Epic e a capa da loja
export function buildOwnedEpicGame(record: EpicLibraryRecord & { appName: string }, item: EpicCatalogItem & { title: string }, playtimeSeconds: number, now: string): Game {
  const cover = image(item, 'DieselGameBoxTall', 'OfferImageTall', 'Thumbnail');
  const hero = image(item, 'DieselGameBox', 'OfferImageWide');
  return {
    id: `epic-${record.appName}`,
    title: item.title.trim(),
    platform: 'epic',
    platformGameId: record.appName,
    executablePath: '',
    launchUri: epicLauncherUri(record.namespace, record.catalogItemId, record.appName, 'install'),
    isInstalled: false,
    media: { ...(cover ? { coverUrl: cover } : {}), ...(hero ? { heroUrl: hero } : {}) },
    isFavorite: false,
    isHidden: false,
    tags: [],
    totalPlaytimeSeconds: playtimeSeconds,
    sourcePlaytimeSeconds: playtimeSeconds,
    createdAt: now,
    updatedAt: now
  };
}
