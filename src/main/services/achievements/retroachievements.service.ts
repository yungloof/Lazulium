import { DEFAULT_EMULATOR_PROFILES, hasRetroAchievements } from '@shared/constants/emulators';
import { createHash } from 'crypto';
import { createReadStream, existsSync, statSync } from 'fs';
import { Game } from '@shared/types/game';
import { Achievement, GameAchievements } from '@shared/types/achievements';
import { ApiKeyTestResult } from '@shared/types/ipc';
import { cleanRomTitle } from '../scanners/emulator-scanner.service';
import { normalizeKey } from '../cloudsync/save-locator.service';
import { HttpError, describeError, fetchJson, httpRequest, isConnectionError } from '../metadata/http';

interface RAGameListItem {
  ID: number;
  Title: string;
  ConsoleID?: number;
}

interface RAAchievement {
  ID: number;
  Title: string;
  Description: string;
  Points: number;
  BadgeName: string;
  DateEarned?: string | null;
  NumAwarded?: number;
  DisplayOrder?: number;
}

interface RAGameInfoResponse {
  ID?: number;
  Title?: string;
  NumDistinctPlayersCasual?: number;
  Achievements?: Record<string, RAAchievement>;
}

const EMULATOR_CONSOLE_MAP: Record<string, number[]> = {
  pcsx2: [21],                           // PlayStation 2
  duckstation: [12],                     // PlayStation 1
  dolphin: [16, 19],                     // GameCube, Wii
  retroarch: [3, 7, 5, 1, 12, 11, 9],    // SNES, NES, GBA, Genesis, PS1, GB, GBC
  bizhawk: [7, 3, 4, 6, 5, 2, 1],        // NES, SNES, GB, GBC, GBA, N64, Genesis
  melonds: [18],                         // Nintendo DS
  mgba: [5, 6, 4],                       // GBA, GBC, GB
  ppsspp: [41]                           // PSP
};

// O site lista o jogo, mas o programa no PC não envia conquistas: quem desbloqueia é o BizHawk ou o RetroArch
// (docs.retroachievements.org, suporte de emuladores)
const CATALOG_ONLY_EMULATORS = ['mgba', 'melonds'];

// "Legend of Zelda, The: Oracle of Ages" -> mesma chave de "The Legend of Zelda: ORACLE OF AGES"
const raTitleKey = (title: string) => normalizeKey(cleanRomTitle(title.replace(/^(.*?),\s*The\b/i, 'The $1')));
// Hacks, homebrew e conjuntos extras têm o título marcado: não são o jogo que está na biblioteca
const isVariantEntry = (title: string) => title.startsWith('~') || /\[Subset/i.test(title);

function progressNote(game: Game, unlocked: number): string | undefined {
  if (unlocked > 0) return undefined;
  const name = (game.emulatorId && DEFAULT_EMULATOR_PROFILES[game.emulatorId]?.name) ?? 'emulador';
  return game.emulatorId && CATALOG_ONLY_EMULATORS.includes(game.emulatorId)
    ? `O ${name} para PC não envia conquistas ao RetroAchievements: marque à mão as que você já fez. No BizHawk ou no RetroArch, logado na sua conta, elas contam sozinhas.`
    : `Nenhuma conquista nesta conta ainda. Elas contam sozinhas se você entrar na mesma conta do RetroAchievements dentro do ${name}; também dá para marcar à mão.`;
}

const RA_BASE = 'https://retroachievements.org';
const RA_HEADERS = { 'User-Agent': 'Lazulium-Game-Hub/0.1.0' };
const RA = { service: 'o RetroAchievements', headers: RA_HEADERS };
const LIST_TIMEOUT_MS = 20_000;
const LIST_TTL_MS = 6 * 60 * 60 * 1000;   // Jogos novos entram no catálogo: a lista de cada console não vale a sessão inteira
const PROGRESS_TIMEOUT_MS = 12_000;
const HASH_TIMEOUT_MS = 8_000;
const MD5_TIMEOUT_MS = 5_000;
const MD5_MAX_FULL_BYTES = 2 * 1024 * 1024 * 1024;
const MD5_PARTIAL_BYTES = 64 * 1024 * 1024;
const MIN_CATALOG_KEY_LENGTH = 6;
// Mesmo jogo relançado: a lista do original serve ("The Wind Waker HD")
const REMASTER_SUFFIX = /\s+(hd|remaster(ed)?|definitive edition|deluxe)$/i;

// Consoles onde vale procurar pelo nome um jogo que não roda em emulador com suporte (ports, Switch, registros à mão)
const CATALOG_CONSOLES: [number, string][] = [
  [2, 'Nintendo 64'], [3, 'SNES'], [7, 'NES'], [5, 'Game Boy Advance'], [6, 'Game Boy Color'], [4, 'Game Boy'], [16, 'GameCube'],
  [19, 'Wii'], [18, 'Nintendo DS'], [21, 'PlayStation 2'], [12, 'PlayStation'], [41, 'PSP'], [1, 'Mega Drive']
];

// Lista de jogos por console: uma por algumas horas, mesmo com vários jogos perguntando ao mesmo tempo.
// Falha não fica guardada: a próxima consulta tenta de novo. O erro volta para quem pediu saber se foi falta de internet.
type GameListResult = { list: RAGameListItem[] } | { error: unknown };
const gameListCache = new Map<number, { at: number; request: Promise<GameListResult> }>();

function loadGameList(consoleId: number, username: string, apiKey: string): Promise<GameListResult> {
  const cached = gameListCache.get(consoleId);
  if (cached && Date.now() - cached.at < LIST_TTL_MS) return cached.request;
  // f=1: só jogos com conquistas cadastradas
  const request = fetchJson<unknown>(`${RA_BASE}/API/API_GetGameList.php?i=${consoleId}&f=1&z=${encodeURIComponent(username)}&y=${encodeURIComponent(apiKey)}`, {
    ...RA,
    timeoutMs: LIST_TIMEOUT_MS,
    retries: 1
  })
    .then((data): GameListResult => {
      if (!Array.isArray(data)) throw new HttpError('O RetroAchievements mandou uma resposta que o Lazulium não entendeu.', 'format');
      return { list: (data as RAGameListItem[]).filter((g) => g && typeof g.ID === 'number' && typeof g.Title === 'string') };
    })
    .catch((error: unknown): GameListResult => {
      if (gameListCache.get(consoleId)?.request === request) gameListCache.delete(consoleId);
      return { error };
    });
  gameListCache.set(consoleId, { at: Date.now(), request });
  return request;
}

const BADGE_NAME = /^[A-Za-z0-9_-]{1,40}$/;

// Resposta de fora: conquista sem id ou nome fica de fora; badge só com nome de arquivo simples
function toItems(data: RAGameInfoResponse): Achievement[] {
  const totalPlayers = Number(data.NumDistinctPlayersCasual) || 0;
  const achievements = data.Achievements && typeof data.Achievements === 'object' ? Object.values(data.Achievements) : [];
  return achievements.flatMap((ach) => {
    if (!ach || (typeof ach.ID !== 'number' && typeof ach.ID !== 'string') || typeof ach.Title !== 'string') return [];
    const badge = typeof ach.BadgeName === 'string' && BADGE_NAME.test(ach.BadgeName) ? ach.BadgeName : '00000';
    const earned = typeof ach.DateEarned === 'string' && ach.DateEarned ? new Date(ach.DateEarned) : undefined;
    const awarded = Number(ach.NumAwarded);
    return [
      {
        id: String(ach.ID),
        name: ach.Title,
        description: typeof ach.Description === 'string' ? ach.Description : '',
        iconUrl: `https://media.retroachievements.org/Badge/${badge}.png`,
        iconLockedUrl: `https://media.retroachievements.org/Badge/${badge}_lock.png`,
        unlocked: !!earned,
        unlockedAt: earned && !Number.isNaN(earned.getTime()) ? earned.toISOString() : undefined,
        globalPercent: totalPlayers > 0 && Number.isFinite(awarded) ? Math.round((awarded / totalPlayers) * 1000) / 10 : undefined
      }
    ];
  });
}

// failed: alguma consulta não respondeu, então "não achou" ainda não é resposta definitiva
type IdentifyResult = { gameId: number; method: 'hash' | 'title' } | { gameId: null; failed?: unknown };

type Result = Omit<GameAchievements, 'gameId' | 'source' | 'syncedAt'>;
const emptyResult = (extra: Partial<Result>): Result => ({ total: 0, unlocked: 0, items: [], ...extra });

// Sem internet a mensagem já diz tudo; outra falha passageira ganha o aviso de que o app tenta de novo
const retryWarning = (err: unknown) =>
  isConnectionError(err) || err instanceof HttpError ? describeError(err) : 'O RetroAchievements não respondeu agora. O Lazulium tenta de novo mais tarde.';

export class RetroAchievementsService {
  /**
   * Testa a conexão e credenciais do RetroAchievements via API_GetUserProfile.php
   */
  async testCredentials(username: string, apiKey: string): Promise<ApiKeyTestResult> {
    const user = username.trim();
    const key = apiKey.trim();

    if (!user) return { ok: false, message: 'Informe o nome de usuário do RetroAchievements.' };
    if (!key) return { ok: false, message: 'Informe a Web API Key do RetroAchievements.' };

    try {
      const res = await httpRequest(`${RA_BASE}/API/API_GetUserProfile.php?u=${encodeURIComponent(user)}&z=${encodeURIComponent(user)}&y=${encodeURIComponent(key)}`, {
        ...RA,
        timeoutMs: 10_000
      });
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Usuário ou Web API Key incorretos no RetroAchievements.' };
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, message: `O RetroAchievements não respondeu agora (erro ${res.status}). Tente de novo em instantes.` };
      }

      const json = (await res.json().catch(() => null)) as { Success?: boolean; User?: unknown; TotalPoints?: unknown } | null;
      if (!json || json.Success === false || (!json.User && typeof json.TotalPoints !== 'number')) {
        return { ok: false, message: 'Usuário ou Web API Key incorretos no RetroAchievements.' };
      }

      const points = typeof json.TotalPoints === 'number' ? json.TotalPoints : 0;
      return { ok: true, message: `Conectado como "${typeof json.User === 'string' ? json.User : user}" (${points} pontos)!` };
    } catch (err) {
      return { ok: false, message: describeError(err) };
    }
  }

  /**
   * MD5 da ROM, com limite de tamanho e de tempo para não travar em arquivos gigantes
   */
  private async computeRomMd5(romPath: string): Promise<string | null> {
    if (!existsSync(romPath)) return null;

    return new Promise((resolve) => {
      try {
        const stats = statSync(romPath);
        const hash = createHash('md5');
        // Acima de 2 GB lê só o começo (o hash não vai bater, e o título resolve)
        const stream = createReadStream(romPath, stats.size > MD5_MAX_FULL_BYTES ? { end: MD5_PARTIAL_BYTES } : undefined);

        const timer = setTimeout(() => {
          stream.destroy();
          resolve(null);
        }, MD5_TIMEOUT_MS);

        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => {
          clearTimeout(timer);
          resolve(hash.digest('hex'));
        });
        stream.on('error', () => {
          clearTimeout(timer);
          resolve(null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Procura o GameID do RetroAchievements:
   * 1. Pelo hash MD5 da ROM (dorequest.php?r=gameid&m=...)
   * 2. Pelo título limpo da ROM / jogo nos consoles do emulador (API_GetGameList.php)
   */
  private async identifyGameId(game: Game, username: string, apiKey: string, skipHash = false): Promise<IdentifyResult> {
    if (!hasRetroAchievements(game.emulatorId)) return { gameId: null };
    let failed: unknown;

    // 1. Identificação por Hash MD5
    if (game.romPath && !skipHash) {
      const md5 = await this.computeRomMd5(game.romPath);
      if (md5) {
        try {
          const data = await fetchJson<{ GameID?: unknown } | null>(`${RA_BASE}/dorequest.php?r=gameid&m=${encodeURIComponent(md5)}`, { ...RA, timeoutMs: HASH_TIMEOUT_MS });
          const id = Number(data?.GameID);
          if (Number.isInteger(id) && id > 0) return { gameId: id, method: 'hash' };
        } catch (err) {
          // Sem internet, a busca pelo título também não vai responder
          if (isConnectionError(err)) return { gameId: null, failed: err };
          failed = err;
        }
      }
    }

    // 2. Fallback: busca por título limpo nos consoles do emulador
    const targetKey = raTitleKey(game.title);
    if (!targetKey) return { gameId: null, failed };

    const consoleIds = (game.emulatorId && EMULATOR_CONSOLE_MAP[game.emulatorId]) || [3, 7, 5, 1, 12, 21, 16];
    for (const consoleId of consoleIds) {
      const result = await loadGameList(consoleId, username, apiKey);
      if ('error' in result) {
        if (isConnectionError(result.error)) return { gameId: null, failed: result.error };
        failed ??= result.error;
        continue;
      }
      // Só nome igual: nome parecido traria as conquistas de outro jogo
      const match = result.list.find((g) => !isVariantEntry(g.Title) && raTitleKey(g.Title) === targetKey);
      if (match && match.ID > 0) return { gameId: match.ID, method: 'title' };
    }

    return { gameId: null, failed };
  }

  private async loadProgress(raGameId: number, user: string, key: string): Promise<RAGameInfoResponse> {
    const data = await fetchJson<RAGameInfoResponse | null>(
      `${RA_BASE}/API/API_GetGameInfoAndUserProgress.php?u=${encodeURIComponent(user)}&z=${encodeURIComponent(user)}&y=${encodeURIComponent(key)}&g=${raGameId}&a=1`,
      { ...RA, timeoutMs: PROGRESS_TIMEOUT_MS, retries: 1 }
    );
    if (!data || typeof data !== 'object') throw new HttpError('O RetroAchievements mandou uma resposta que o Lazulium não entendeu.', 'format');
    return data;
  }

  // Procura o jogo pelo nome em todos os consoles. null: não existe lista; erro: não deu para conferir tudo.
  async findInCatalog(title: string, username: string, apiKey: string): Promise<{ raGameId: number; consoleName: string } | null> {
    const key = raTitleKey(cleanRomTitle(title).replace(REMASTER_SUFFIX, ''));
    if (key.length < MIN_CATALOG_KEY_LENGTH) return null;
    let failed: unknown;
    for (const [consoleId, consoleName] of CATALOG_CONSOLES) {
      const result = await loadGameList(consoleId, username, apiKey);
      if ('error' in result) {
        // Sem internet não adianta perguntar dos outros consoles
        if (isConnectionError(result.error)) throw result.error;
        failed ??= result.error;
        continue;
      }
      const match = result.list.find((g) => !isVariantEntry(g.Title) && raTitleKey(g.Title) === key);
      if (match && match.ID > 0) return { raGameId: match.ID, consoleName };
    }
    if (failed) throw failed instanceof HttpError ? failed : new Error('O RetroAchievements não respondeu para todos os consoles.');
    return null;
  }

  // Lista de um jogo que não envia conquistas sozinho (port, console sem suporte): o jogador marca à mão
  async fetchCatalogList(game: Game, raGameId: number, consoleName: string, username: string, apiKey: string): Promise<GameAchievements> {
    const base = { gameId: game.id, source: 'retroachievements' as const, syncedAt: new Date().toISOString() };
    try {
      const items = toItems(await this.loadProgress(raGameId, username.trim(), apiKey.trim()));
      return {
        ...base,
        listLabel: `RetroAchievements · ${consoleName}`,
        total: items.length,
        unlocked: items.filter((i) => i.unlocked).length,
        items,
        note: `Lista da versão de ${consoleName} no RetroAchievements. Esta versão do jogo não envia conquistas sozinha: marque à mão as que você já fez.`
      };
    } catch (err) {
      return { ...base, ...emptyResult({ retryable: true, warning: retryWarning(err) }) };
    }
  }

  /**
   * Busca as conquistas e o progresso do usuário no RetroAchievements
   */
  async fetchAchievements(game: Game, username: string, apiKey: string): Promise<GameAchievements> {
    const base = { gameId: game.id, source: 'retroachievements' as const, syncedAt: new Date().toISOString() };

    if (game.platform !== 'emulator') return { ...base, ...emptyResult({ warning: 'Este jogo não é de emulador.' }) };

    if (!hasRetroAchievements(game.emulatorId)) {
      const name = (game.emulatorId && DEFAULT_EMULATOR_PROFILES[game.emulatorId]?.name) ?? 'Este emulador';
      return { ...base, ...emptyResult({ warning: `O ${name} não tem suporte ao RetroAchievements, então este jogo não tem conquistas por aqui.` }) };
    }

    const user = username.trim();
    const key = apiKey.trim();
    if (!user || !key) {
      return { ...base, ...emptyResult({ warning: 'Entre com sua conta do RetroAchievements em Configurações → Contas para ver as conquistas.' }) };
    }

    try {
      const identified = await this.identifyGameId(game, user, key);
      if (identified.gameId === null) {
        // Sem resposta do site não dá para dizer que o jogo não existe lá: tenta de novo depois, sem trocar a lista guardada
        if (identified.failed) return { ...base, ...emptyResult({ retryable: true, warning: retryWarning(identified.failed) }) };
        return { ...base, ...emptyResult({ warning: 'Jogo não identificado no catálogo do RetroAchievements (tente verificar o arquivo de ROM).' }) };
      }

      let data = await this.loadProgress(identified.gameId, user, key);
      // A ROM pode apontar para uma entrada vazia (tradução, revisão): o jogo com o mesmo nome costuma ter as conquistas
      if (identified.method === 'hash' && toItems(data).length === 0) {
        const byTitle = await this.identifyGameId(game, user, key, true);
        if (byTitle.gameId && byTitle.gameId !== identified.gameId) data = await this.loadProgress(byTitle.gameId, user, key).catch(() => data);
      }

      const items = toItems(data);
      if (items.length === 0) {
        return { ...base, ...emptyResult({ warning: 'Este jogo ainda não possui conquistas cadastradas no RetroAchievements.' }) };
      }

      const unlockedCount = items.filter((i) => i.unlocked).length;
      return { ...base, total: items.length, unlocked: unlockedCount, items, note: progressNote(game, unlockedCount) };
    } catch (err) {
      return { ...base, ...emptyResult({ retryable: true, warning: retryWarning(err) }) };
    }
  }
}

export const retroAchievementsService = new RetroAchievementsService();

