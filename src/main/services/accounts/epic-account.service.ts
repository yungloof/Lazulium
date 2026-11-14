import { BrowserWindow } from 'electron';
import { Game } from '@shared/types/game';
import { db } from '../../database/db';
import { HttpError, describeError, httpRequest } from '../metadata/http';
import { openWebLogin } from './web-login.service';
import { EpicCatalogItem, EpicLibraryRecord, buildOwnedEpicGame, isPlayableGame, usableRecords } from './epic-library';

// "Entrar com a Epic": a pessoa entra no site da Epic, numa janela do Lazulium, e o Lazulium importa as horas de cada jogo
// e traz os jogos da conta que ela já jogou mas não estão instalados neste PC (como o histórico da Steam).
// A Epic não tem uma forma oficial para isso: usamos o mesmo acesso público do launcher da Epic, como o Legendary,
// o Heroic e o Playnite. Se a Epic mudar algo, só a importação de horas para; o resto do app segue igual.
// O token fica cifrado no PC (SECRET_SETTING_KEYS) e só é enviado para a própria Epic.

const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const TOKEN_URL = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token';
const PLAYTIME_URL = (accountId: string) => `https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account/${accountId}/all`;
const LIBRARY_URL = 'https://library-service.live.use1a.on.epicgames.com/library/api/public/items';
const CATALOG_URL = (namespace: string) => `https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${encodeURIComponent(namespace)}/bulk/items`;
const MAX_LIBRARY_PAGES = 50;
const CATALOG_PARALLEL = 4;
const REDIRECT_PAGE = `https://www.epicgames.com/id/api/redirect?clientId=${CLIENT_ID}&responseType=code`;
const LOGIN_PAGE = `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(REDIRECT_PAGE)}`;
const REQUEST_TIMEOUT_MS = 15_000;
const AUTH_CODE = /"authorizationCode"\s*:\s*"([0-9a-f]{32})"/i;
const IMPORT_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const EPIC_SETTING_KEYS = {
  refreshToken: 'epicRefreshToken',       // Cifrado
  accountId: 'epicAccountId',
  displayName: 'epicDisplayName',
  lastImportAt: 'epicLastImportAt'
} as const;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  account_id?: string;
  displayName?: string;
  errorMessage?: string;
}

interface PlaytimeEntry {
  artifactId?: string;
  totalTime?: number;                 // Segundos
}

export interface EpicImportResult {
  updated: number;                    // Jogos com horas novas
  matched: number;                    // Jogos da biblioteca encontrados na conta
  added: number;                      // Jogos da conta, já jogados, que entraram como não instalados
}

async function requestToken(body: Record<string, string>): Promise<Required<Pick<TokenResponse, 'access_token' | 'refresh_token' | 'account_id'>> & TokenResponse> {
  let res: Response;
  try {
    res = await httpRequest(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ ...body, token_type: 'eg1' }).toString(),
      timeoutMs: REQUEST_TIMEOUT_MS,
      service: 'a Epic'
    });
  } catch (err) {
    throw new Error(describeError(err));
  }
  const data = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !data?.access_token || !data.refresh_token || !data.account_id) {
    throw new HttpError(res.status === 400 || res.status === 401 ? 'A Epic não aceitou o login. Entre de novo.' : `A Epic não respondeu como esperado (erro ${res.status}).`, 'status', res.status);
  }
  return data as Required<Pick<TokenResponse, 'access_token' | 'refresh_token' | 'account_id'>> & TokenResponse;
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  let res: Response;
  try {
    res = await httpRequest(url, {
      headers: { Authorization: `bearer ${accessToken}`, Accept: 'application/json' },
      timeoutMs: REQUEST_TIMEOUT_MS,
      retries: 1,
      service: 'a Epic'
    });
  } catch (err) {
    throw new Error(describeError(err));
  }
  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || data === null) throw new Error(`A Epic não respondeu como esperado (erro ${res.status}).`);
  return data;
}

// Tudo o que a conta tem (paginado)
async function fetchLibrary(accessToken: string): Promise<EpicLibraryRecord[]> {
  const records: EpicLibraryRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIBRARY_PAGES; page++) {
    const url = new URL(LIBRARY_URL);
    url.searchParams.set('includeMetadata', 'true');
    if (cursor) url.searchParams.set('cursor', cursor);
    const data = await getJson<{ records?: EpicLibraryRecord[]; responseMetadata?: { nextCursor?: string } }>(url.toString(), accessToken);
    if (Array.isArray(data.records)) records.push(...data.records);
    cursor = data.responseMetadata?.nextCursor;
    if (!cursor) break;
  }
  return records;
}

// Nome, capa e tipo (jogo ou DLC) de cada item, um por consulta (como o Legendary); um que falhe só fica de fora
async function fetchCatalog(accessToken: string, wanted: EpicLibraryRecord[]): Promise<Map<string, EpicCatalogItem>> {
  const items = new Map<string, EpicCatalogItem>();
  const queue = [...wanted];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const namespace = next.namespace!;
      const url = new URL(CATALOG_URL(namespace));
      url.searchParams.set('id', next.catalogItemId!);
      url.searchParams.set('includeDLCDetails', 'true');
      url.searchParams.set('includeMainGameDetails', 'true');
      url.searchParams.set('country', 'BR');
      url.searchParams.set('locale', 'pt-BR');
      try {
        const data = await getJson<Record<string, EpicCatalogItem>>(url.toString(), accessToken);
        for (const [id, item] of Object.entries(data ?? {})) items.set(id, item);
      } catch (err) {
        console.warn(`[Epic] Catálogo de ${namespace}:`, (err as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: CATALOG_PARALLEL }, worker));
  return items;
}

class EpicAccountService {
  private timer: NodeJS.Timeout | undefined;
  private listener: (game: Game) => void = () => {};

  setGameUpdatedListener(listener: (game: Game) => void): void {
    this.listener = listener;
  }
  private importing: Promise<EpicImportResult> | undefined;

  isConnected(): boolean {
    return !!db.getSettings()[EPIC_SETTING_KEYS.refreshToken];
  }

  getAccount(): { displayName?: string; lastImportAt?: string } {
    const s = db.getSettings();
    return { displayName: s[EPIC_SETTING_KEYS.displayName] || undefined, lastImportAt: s[EPIC_SETTING_KEYS.lastImportAt] || undefined };
  }

  init(): void {
    const run = () => {
      if (this.isConnected()) void this.importPlaytime().catch((err) => console.warn('[Epic] Importação de horas falhou:', (err as Error).message));
    };
    setTimeout(run, 45_000).unref();
    this.timer = setInterval(run, IMPORT_INTERVAL_MS);
    this.timer.unref();
  }

  async login(parent: BrowserWindow | null): Promise<EpicImportResult> {
    const tokens = await openWebLogin<{ code: string; tokens?: Awaited<ReturnType<typeof requestToken>> }>(
      {
        title: 'Entre na sua conta da Epic: o Lazulium importa as horas e os jogos que você já jogou e fecha a janela sozinho',
        partition: 'persist:login-epic',
        host: /(^|\.)epicgames\.com$/i,
        initialUrl: LOGIN_PAGE,
        keyPageUrl: REDIRECT_PAGE,
        // Login, verificação em duas etapas e cadastro ficam em /id/...; só a página do código fica de fora
        skipRedirectPaths: /^\/id\/(?!api\/redirect)/i,
        extract: (content) => {
          const code = `${content.text}\n${content.html}`.match(AUTH_CODE)?.[1];
          return code ? [{ code }] : [];
        },
        // O código vale uma vez: a troca já é a validação
        validate: async (candidate) => {
          try {
            candidate.tokens = await requestToken({ grant_type: 'authorization_code', code: candidate.code });
            return true;
          } catch {
            return false;
          }
        }
      },
      parent
    ).then((result) => result.tokens!);

    this.saveTokens(tokens);
    return this.importPlaytime();
  }

  logout(): void {
    for (const key of Object.values(EPIC_SETTING_KEYS)) db.setSetting(key, '');
  }

  private saveTokens(tokens: TokenResponse): void {
    if (tokens.refresh_token) db.setSetting(EPIC_SETTING_KEYS.refreshToken, tokens.refresh_token);
    if (tokens.account_id) db.setSetting(EPIC_SETTING_KEYS.accountId, tokens.account_id);
    if (tokens.displayName) db.setSetting(EPIC_SETTING_KEYS.displayName, tokens.displayName.slice(0, 64));
  }

  // Horas de cada jogo na conta da Epic -> horas do launcher no Lazulium (como as da Steam e do GOG)
  importPlaytime(): Promise<EpicImportResult> {
    this.importing ??= this.runImport().finally(() => (this.importing = undefined));
    return this.importing;
  }

  private async runImport(): Promise<EpicImportResult> {
    const refresh = db.getSettings()[EPIC_SETTING_KEYS.refreshToken];
    if (!refresh) throw new Error('Entre na conta da Epic primeiro.');
    let tokens;
    try {
      tokens = await requestToken({ grant_type: 'refresh_token', refresh_token: refresh });
    } catch (err) {
      // Sessão vencida (a Epic derruba depois de um tempo ou ao trocar a senha): pede para entrar de novo
      if (err instanceof HttpError && (err.status === 400 || err.status === 401)) this.logout();
      throw err;
    }
    this.saveTokens(tokens);

    let res: Response;
    try {
      res = await httpRequest(PLAYTIME_URL(tokens.account_id), {
        headers: { Authorization: `bearer ${tokens.access_token}`, Accept: 'application/json' },
        timeoutMs: REQUEST_TIMEOUT_MS,
        retries: 1,
        service: 'a Epic'
      });
    } catch (err) {
      throw new Error(describeError(err));
    }
    const entries = (await res.json().catch(() => null)) as PlaytimeEntry[] | null;
    if (!res.ok || !Array.isArray(entries)) throw new Error(`A Epic não devolveu as horas (erro ${res.status}).`);

    const seconds = new Map<string, number>();
    for (const entry of entries) {
      if (typeof entry?.artifactId !== 'string' || typeof entry.totalTime !== 'number' || !Number.isFinite(entry.totalTime) || entry.totalTime < 0) continue;
      const key = entry.artifactId.toLowerCase();
      seconds.set(key, Math.max(seconds.get(key) ?? 0, Math.round(entry.totalTime)));
    }

    // Jogos da conta já jogados que não estão na biblioteca: entram como não instalados. Uma falha aqui não impede as horas.
    let added = 0;
    try {
      added = await this.importOwnedGames(tokens.access_token, seconds);
    } catch (err) {
      console.warn('[Epic] Jogos da conta não vieram:', (err as Error).message);
    }

    let updated = 0;
    let matched = 0;
    for (const game of db.getGames()) {
      if (game.platform !== 'epic' || !game.platformGameId) continue;
      const total = seconds.get(game.platformGameId.toLowerCase());
      if (total === undefined) continue;
      matched++;
      // Mesma regra dos scanners: horas do launcher + ajuste manual, nunca menos do que já está contado
      const next = Math.max(game.totalPlaytimeSeconds ?? 0, total + (game.playtimeAdjustmentSeconds ?? 0));
      if (game.sourcePlaytimeSeconds === total && next === game.totalPlaytimeSeconds) continue;
      const changed = { ...game, sourcePlaytimeSeconds: total, totalPlaytimeSeconds: next };
      db.upsertGame(changed);
      this.listener(changed);
      updated++;
    }
    db.setSetting(EPIC_SETTING_KEYS.lastImportAt, new Date().toISOString());
    console.log(`[Epic] Horas importadas: ${matched} jogo(s) da biblioteca na conta, ${updated} atualizado(s), ${added} jogo(s) da conta adicionados`);
    return { updated, matched, added };
  }

  // Só os jogados (com horas na Epic), como no histórico da Steam: os brindes nunca abertos não enchem a biblioteca
  private async importOwnedGames(accessToken: string, seconds: Map<string, number>): Promise<number> {
    const known = new Set(db.getGames().flatMap((g) => (g.platform === 'epic' && g.platformGameId ? [g.platformGameId.toLowerCase()] : [])));
    const played = [...seconds.entries()].filter(([app, total]) => total > 0 && !known.has(app));
    if (played.length === 0) return 0;

    const records = usableRecords(await fetchLibrary(accessToken));
    const wanted = played.flatMap(([app]) => (records.has(app) ? [records.get(app)!] : []));
    if (wanted.length === 0) return 0;
    const catalog = await fetchCatalog(accessToken, wanted);

    const now = new Date().toISOString();
    const created: Game[] = [];
    for (const record of wanted) {
      const item = catalog.get(record.catalogItemId!);
      if (!isPlayableGame(item)) continue;
      // O jogo pode ter entrado por outro caminho enquanto a rede respondia (scan)
      if (db.getGameById(`epic-${record.appName}`)) continue;
      created.push(buildOwnedEpicGame(record as EpicLibraryRecord & { appName: string }, item, seconds.get(record.appName!.toLowerCase()) ?? 0, now));
    }
    if (created.length === 0) return 0;
    db.upsertGames(created);
    for (const game of created) this.listener(game);
    console.log(`[Epic] ${created.length} jogo(s) da conta adicionados como não instalados: ${created.map((g) => g.title).join(', ')}`);
    return created.length;
  }
}

export const epicAccountService = new EpicAccountService();
