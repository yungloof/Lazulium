import { DEFAULT_EMULATOR_PROFILES, hasRetroAchievements } from '@shared/constants/emulators';
import { createHash } from 'crypto';
import { createReadStream, existsSync, statSync } from 'fs';
import { Game } from '@shared/types/game';
import { Achievement, GameAchievements } from '@shared/types/achievements';
import { ApiKeyTestResult } from '@shared/types/ipc';
import { cleanRomTitle } from '../scanners/emulator-scanner.service';
import { normalizeKey } from '../cloudsync/save-locator.service';

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

const RA_HEADERS = { 'User-Agent': 'Lazulium-Game-Hub/0.1.0' };
const LIST_TIMEOUT_MS = 20_000;
const MIN_CATALOG_KEY_LENGTH = 6;
// Mesmo jogo relançado: a lista do original serve ("The Wind Waker HD")
const REMASTER_SUFFIX = /\s+(hd|remaster(ed)?|definitive edition|deluxe)$/i;

// Consoles onde vale procurar pelo nome um jogo que não roda em emulador com suporte (ports, Switch, registros à mão)
const CATALOG_CONSOLES: [number, string][] = [
  [2, 'Nintendo 64'], [3, 'SNES'], [7, 'NES'], [5, 'Game Boy Advance'], [6, 'Game Boy Color'], [4, 'Game Boy'], [16, 'GameCube'],
  [19, 'Wii'], [18, 'Nintendo DS'], [21, 'PlayStation 2'], [12, 'PlayStation'], [41, 'PSP'], [1, 'Mega Drive']
];

// Lista de jogos por console: uma por sessão, mesmo com vários jogos perguntando ao mesmo tempo
const gameListCache = new Map<number, Promise<RAGameListItem[] | undefined>>();

function loadGameList(consoleId: number, username: string, apiKey: string): Promise<RAGameListItem[] | undefined> {
  const cached = gameListCache.get(consoleId);
  if (cached) return cached;
  // f=1: só jogos com conquistas cadastradas
  const request = fetch(`https://retroachievements.org/API/API_GetGameList.php?i=${consoleId}&f=1&z=${encodeURIComponent(username)}&y=${encodeURIComponent(apiKey)}`, {
    headers: RA_HEADERS,
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS)
  })
    .then(async (res) => {
      const list = res.ok ? ((await res.json()) as RAGameListItem[]) : undefined;
      return Array.isArray(list) ? list : undefined;
    })
    .catch(() => undefined)
    .then((list) => {
      // Falha não fica guardada: a próxima consulta tenta de novo
      if (!list) gameListCache.delete(consoleId);
      return list;
    });
  gameListCache.set(consoleId, request);
  return request;
}

function toItems(data: RAGameInfoResponse): Achievement[] {
  const totalPlayers = data.NumDistinctPlayersCasual || 0;
  return Object.values(data.Achievements ?? {}).map((ach) => {
    const badge = ach.BadgeName || '00000';
    return {
      id: String(ach.ID),
      name: ach.Title,
      description: ach.Description || '',
      iconUrl: `https://media.retroachievements.org/Badge/${badge}.png`,
      iconLockedUrl: `https://media.retroachievements.org/Badge/${badge}_lock.png`,
      unlocked: Boolean(ach.DateEarned),
      unlockedAt: ach.DateEarned ? new Date(ach.DateEarned).toISOString() : undefined,
      globalPercent: totalPlayers > 0 && ach.NumAwarded !== undefined ? Math.round((ach.NumAwarded / totalPlayers) * 1000) / 10 : undefined
    };
  });
}

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
      const url = `https://retroachievements.org/API/API_GetUserProfile.php?u=${encodeURIComponent(
        user
      )}&z=${encodeURIComponent(user)}&y=${encodeURIComponent(key)}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Lazulium-Game-Hub/0.1.0' },
        signal: AbortSignal.timeout(10_000)
      });

      if (!res.ok) {
        return { ok: false, message: `Erro ao conectar ao RetroAchievements (HTTP ${res.status}).` };
      }

      const json = await res.json();
      if (!json || json.Success === false || (!json.User && !json.TotalPoints && json.TotalPoints !== 0)) {
        return { ok: false, message: 'Usuário ou Web API Key incorretos no RetroAchievements.' };
      }

      const points = json.TotalPoints ?? 0;
      return { ok: true, message: `Conectado como "${json.User || user}" (${points} pontos)!` };
    } catch (err) {
      return { ok: false, message: `Falha de conexão: ${(err as Error).message}` };
    }
  }

  /**
   * Calcula o MD5 de uma ROM de forma segura (com limite de tamanho para não travar em arquivos gigantes)
   */
  private async computeRomMd5(romPath: string): Promise<string | null> {
    if (!existsSync(romPath)) return null;

    return new Promise((resolve) => {
      try {
        const stats = statSync(romPath);
        // Se a ROM for maior que 2 GB, evitamos ler o arquivo inteiro via stream simples
        const hash = createHash('md5');
        const stream = createReadStream(romPath, stats.size > 2 * 1024 * 1024 * 1024 ? { end: 64 * 1024 * 1024 } : undefined);

        const timer = setTimeout(() => {
          stream.destroy();
          resolve(null);
        }, 5000);

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
  private async identifyGameId(
    game: Game,
    username: string,
    apiKey: string,
    skipHash = false
  ): Promise<{ gameId: number | null; method: 'hash' | 'title' | null }> {
    if (!hasRetroAchievements(game.emulatorId)) return { gameId: null, method: null };

    // 1. Identificação por Hash MD5
    if (game.romPath && !skipHash) {
      try {
        const md5 = await this.computeRomMd5(game.romPath);
        if (md5) {
          const hashUrl = `https://retroachievements.org/dorequest.php?r=gameid&m=${encodeURIComponent(md5)}`;
          const res = await fetch(hashUrl, {
            headers: { 'User-Agent': 'Lazulium-Game-Hub/0.1.0' },
            signal: AbortSignal.timeout(8000)
          });
          if (res.ok) {
            const data = await res.json();
            const id = data?.GameID ? Number(data.GameID) : 0;
            if (id > 0) return { gameId: id, method: 'hash' };
          }
        }
      } catch {
        // Fallback para busca por título
      }
    }

    // 2. Fallback: Busca por título limpo no console correspondente
    const targetKey = raTitleKey(game.title);
    if (!targetKey) return { gameId: null, method: null };

    const consoleIds = (game.emulatorId && EMULATOR_CONSOLE_MAP[game.emulatorId]) || [3, 7, 5, 1, 12, 21, 16];

    for (const consoleId of consoleIds) {
      try {
        const list = await loadGameList(consoleId, username, apiKey);

        if (Array.isArray(list)) {
          // Só nome igual: nome parecido traria as conquistas de outro jogo
          const match = list.find((g) => !isVariantEntry(g.Title) && raTitleKey(g.Title) === targetKey);
          if (match && match.ID > 0) {
            return { gameId: match.ID, method: 'title' };
          }
        }
      } catch {
        continue;
      }
    }

    return { gameId: null, method: null };
  }

  private requestProgress(raGameId: number, user: string, key: string): Promise<Response> {
    return fetch(
      `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?u=${encodeURIComponent(user)}&z=${encodeURIComponent(user)}&y=${encodeURIComponent(key)}&g=${raGameId}&a=1`,
      { headers: RA_HEADERS, signal: AbortSignal.timeout(12_000) }
    );
  }

  // Procura o jogo pelo nome em todos os consoles. null: não existe lista; erro: não deu para conferir tudo.
  async findInCatalog(title: string, username: string, apiKey: string): Promise<{ raGameId: number; consoleName: string } | null> {
    const key = raTitleKey(cleanRomTitle(title).replace(REMASTER_SUFFIX, ''));
    if (key.length < MIN_CATALOG_KEY_LENGTH) return null;
    let failed = 0;
    for (const [consoleId, consoleName] of CATALOG_CONSOLES) {
      const list = await loadGameList(consoleId, username, apiKey);
      if (!list) {
        failed++;
        continue;
      }
      const match = list.find((g) => !isVariantEntry(g.Title) && raTitleKey(g.Title) === key);
      if (match && match.ID > 0) return { raGameId: match.ID, consoleName };
    }
    if (failed > 0) throw new Error('O RetroAchievements não respondeu para todos os consoles.');
    return null;
  }

  // Lista de um jogo que não envia conquistas sozinho (port, console sem suporte): o jogador marca à mão
  async fetchCatalogList(game: Game, raGameId: number, consoleName: string, username: string, apiKey: string): Promise<GameAchievements> {
    const base = { gameId: game.id, source: 'retroachievements' as const, syncedAt: new Date().toISOString() };
    try {
      const res = await this.requestProgress(raGameId, username.trim(), apiKey.trim());
      if (!res.ok) return { ...base, total: 0, unlocked: 0, items: [], retryable: true, warning: `RetroAchievements retornou HTTP ${res.status}.` };
      const items = toItems((await res.json()) as RAGameInfoResponse);
      return {
        ...base,
        listLabel: `RetroAchievements · ${consoleName}`,
        total: items.length,
        unlocked: items.filter((i) => i.unlocked).length,
        items,
        note: `Lista da versão de ${consoleName} no RetroAchievements. Esta versão do jogo não envia conquistas sozinha: marque à mão as que você já fez.`
      };
    } catch (err) {
      return { ...base, total: 0, unlocked: 0, items: [], retryable: true, warning: `Falha ao carregar conquistas do RetroAchievements: ${(err as Error).message}` };
    }
  }

  /**
   * Busca as conquistas e o progresso do usuário no RetroAchievements
   */
  async fetchAchievements(game: Game, username: string, apiKey: string): Promise<GameAchievements> {
    const now = new Date().toISOString();

    if (game.platform !== 'emulator') {
      return {
        gameId: game.id,
        source: 'retroachievements',
        total: 0,
        unlocked: 0,
        items: [],
        syncedAt: now,
        warning: 'Este jogo não é de emulador.'
      };
    }

    if (!hasRetroAchievements(game.emulatorId)) {
      const name = (game.emulatorId && DEFAULT_EMULATOR_PROFILES[game.emulatorId]?.name) ?? 'Este emulador';
      return {
        gameId: game.id,
        source: 'retroachievements',
        total: 0,
        unlocked: 0,
        items: [],
        syncedAt: now,
        warning: `O ${name} não tem suporte ao RetroAchievements, então este jogo não tem conquistas por aqui.`
      };
    }

    const user = username.trim();
    const key = apiKey.trim();

    if (!user || !key) {
      return {
        gameId: game.id,
        source: 'retroachievements',
        total: 0,
        unlocked: 0,
        items: [],
        syncedAt: now,
        warning: 'Entre com sua conta do RetroAchievements em Configurações → Contas para ver as conquistas.'
      };
    }

    try {
      const { gameId, method } = await this.identifyGameId(game, user, key);

      if (!gameId) {
        return {
          gameId: game.id,
          source: 'retroachievements',
          total: 0,
          unlocked: 0,
          items: [],
          syncedAt: now,
          warning: 'Jogo não identificado no catálogo do RetroAchievements (tente verificar o arquivo de ROM).'
        };
      }

      const fetchProgress = (id: number) => this.requestProgress(id, user, key);

      const res = await fetchProgress(gameId);

      if (!res.ok) {
        return {
          gameId: game.id,
          source: 'retroachievements',
          total: 0,
          unlocked: 0,
          items: [],
          syncedAt: now,
          retryable: true,
          warning: `RetroAchievements retornou HTTP ${res.status}.`
        };
      }

      let data: RAGameInfoResponse = await res.json();
      // A ROM pode apontar para uma entrada vazia (tradução, revisão): o jogo com o mesmo nome costuma ter as conquistas
      if (method === 'hash' && !Object.keys(data?.Achievements ?? {}).length) {
        const byTitle = (await this.identifyGameId(game, user, key, true)).gameId;
        if (byTitle && byTitle !== gameId) {
          const retry = await fetchProgress(byTitle);
          if (retry.ok) data = await retry.json();
        }
      }
      const rawAchievements = data?.Achievements ? Object.values(data.Achievements) : [];

      if (rawAchievements.length === 0) {
        return {
          gameId: game.id,
          source: 'retroachievements',
          total: 0,
          unlocked: 0,
          items: [],
          syncedAt: now,
          warning: 'Este jogo ainda não possui conquistas cadastradas no RetroAchievements.'
        };
      }

      const items = toItems(data);
      const unlockedCount = items.filter((i) => i.unlocked).length;

      return {
        gameId: game.id,
        source: 'retroachievements',
        total: items.length,
        unlocked: unlockedCount,
        items,
        syncedAt: now,
        note: progressNote(game, unlockedCount)
      };
    } catch (err) {
      return {
        gameId: game.id,
        source: 'retroachievements',
        total: 0,
        unlocked: 0,
        items: [],
        syncedAt: now,
        retryable: true,
        warning: `Falha ao carregar conquistas do RetroAchievements: ${(err as Error).message}`
      };
    }
  }
}

export const retroAchievementsService = new RetroAchievementsService();
