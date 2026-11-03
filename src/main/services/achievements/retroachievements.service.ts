import { createHash } from 'crypto';
import { createReadStream, existsSync, statSync } from 'fs';
import { Game } from '@shared/types/game';
import { Achievement, GameAchievements } from '@shared/types/achievements';
import { ApiKeyTestResult } from '@shared/types/ipc';
import { cleanRomTitle } from '../scanners/emulator-scanner.service';

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
  rpcs3: [4],                            // PlayStation 3
  dolphin: [16, 18],                     // GameCube, Wii
  retroarch: [3, 7, 5, 1, 12, 11, 9],    // SNES, NES, GBA, Genesis, PS1, GB, GBC
  cemu: [18, 16],                        // Wii U / Wii
  melonds: [18],                         // Nintendo DS
  mgba: [5, 6, 4],                       // GBA, GBC, GB
  ppsspp: [41]                           // PSP
};

// Cache simples em memória da lista de jogos por console para evitar chamadas repetidas
const gameListCache = new Map<number, RAGameListItem[]>();

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
    apiKey: string
  ): Promise<{ gameId: number | null; method: 'hash' | 'title' | null }> {
    // 1. Identificação por Hash MD5
    if (game.romPath) {
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
    const targetTitle = cleanRomTitle(game.title).toLowerCase().trim();
    if (!targetTitle) return { gameId: null, method: null };

    const consoleIds = (game.emulatorId && EMULATOR_CONSOLE_MAP[game.emulatorId]) || [3, 7, 5, 1, 12, 21, 16];

    for (const consoleId of consoleIds) {
      try {
        let list = gameListCache.get(consoleId);
        if (!list) {
          const listUrl = `https://retroachievements.org/API/API_GetGameList.php?i=${consoleId}&z=${encodeURIComponent(
            username
          )}&y=${encodeURIComponent(apiKey)}`;
          const res = await fetch(listUrl, {
            headers: { 'User-Agent': 'Lazulium-Game-Hub/0.1.0' },
            signal: AbortSignal.timeout(10_000)
          });
          if (res.ok) {
            list = (await res.json()) as RAGameListItem[];
            if (Array.isArray(list)) gameListCache.set(consoleId, list);
          }
        }

        if (Array.isArray(list)) {
          // Busca exata ou por inclusão limpa
          const match = list.find((g) => {
            const clean = cleanRomTitle(g.Title).toLowerCase().trim();
            return clean === targetTitle || (targetTitle.length >= 5 && clean.includes(targetTitle));
          });
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
      const { gameId } = await this.identifyGameId(game, user, key);

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

      const progressUrl = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?u=${encodeURIComponent(
        user
      )}&z=${encodeURIComponent(user)}&y=${encodeURIComponent(key)}&g=${gameId}&a=1`;

      const res = await fetch(progressUrl, {
        headers: { 'User-Agent': 'Lazulium-Game-Hub/0.1.0' },
        signal: AbortSignal.timeout(12_000)
      });

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

      const data: RAGameInfoResponse = await res.json();
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

      const totalPlayers = data.NumDistinctPlayersCasual || 0;

      const items: Achievement[] = rawAchievements.map((ach) => {
        const unlocked = Boolean(ach.DateEarned);
        const unlockedAt = ach.DateEarned ? new Date(ach.DateEarned).toISOString() : undefined;
        const globalPercent =
          totalPlayers > 0 && ach.NumAwarded !== undefined
            ? Math.round((ach.NumAwarded / totalPlayers) * 1000) / 10
            : undefined;

        const badge = ach.BadgeName || '00000';
        const iconUrl = `https://media.retroachievements.org/Badge/${badge}.png`;
        const iconLockedUrl = `https://media.retroachievements.org/Badge/${badge}_lock.png`;

        return {
          id: String(ach.ID),
          name: ach.Title,
          description: ach.Description || '',
          iconUrl,
          iconLockedUrl,
          unlocked,
          unlockedAt,
          globalPercent
        };
      });

      const unlockedCount = items.filter((i) => i.unlocked).length;

      return {
        gameId: game.id,
        source: 'retroachievements',
        total: items.length,
        unlocked: unlockedCount,
        items,
        syncedAt: now
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
