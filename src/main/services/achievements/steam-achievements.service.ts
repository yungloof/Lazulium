import { Game } from '@shared/types/game';
import { Achievement, GameAchievements } from '@shared/types/achievements';
import { ApiKeyTestResult } from '@shared/types/ipc';

interface SteamPlayerAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
}

interface SteamSchemaAchievement {
  name: string;
  defaultvalue: number;
  displayName: string;
  hidden: number;
  description?: string;
  icon: string;
  icongray?: string;
}

interface SteamGlobalPercent {
  name: string;
  percent: number;
}

export class SteamAchievementsService {
  /**
   * Testa a validade da Web API Key e do SteamID64 usando ISteamUser/GetPlayerSummaries/v2
   */
  async testCredentials(apiKey: string, steamId: string): Promise<ApiKeyTestResult> {
    const key = apiKey.trim();
    const id = steamId.trim();

    if (!key) return { ok: false, message: 'Informe a chave da Steam Web API.' };
    if (!id) return { ok: false, message: 'Informe o SteamID64 (número de 17 dígitos).' };

    try {
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(
        key
      )}&steamids=${encodeURIComponent(id)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

      if (res.status === 403) {
        return { ok: false, message: 'Chave da Steam Web API inválida (HTTP 403 Forbidden).' };
      }

      if (!res.ok) {
        return { ok: false, message: `Erro ao conectar com a Steam API (HTTP ${res.status}).` };
      }

      const json = await res.json();
      const players = json?.response?.players;

      if (!players || !Array.isArray(players) || players.length === 0) {
        return { ok: false, message: 'SteamID64 não encontrado ou formato inválido.' };
      }

      const player = players[0];
      const persona = player?.personaname || id;
      return { ok: true, message: `Conectado com sucesso como "${persona}"!` };
    } catch (err) {
      return { ok: false, message: `Falha de conexão: ${(err as Error).message}` };
    }
  }

  /**
   * Busca as conquistas de um jogo Steam combinando:
   * 1. GetSchemaForGame/v2 (nomes, descrições, ícones)
   * 2. GetPlayerAchievements/v1 (status de desbloqueio e data)
   * 3. GetGlobalAchievementPercentagesForApp/v2 (raridade global)
   */
  async fetchAchievements(game: Game, apiKey: string, steamId: string): Promise<GameAchievements> {
    const now = new Date().toISOString();
    const appId = game.platformGameId || game.id.replace('steam-', '');

    if (game.platform !== 'steam' || !appId) {
      return {
        gameId: game.id,
        source: 'steam',
        total: 0,
        unlocked: 0,
        items: [],
        syncedAt: now,
        warning: 'Este jogo não é da plataforma Steam.'
      };
    }

    const key = apiKey.trim();
    const id = steamId.trim();

    if (!key || !id) {
      return {
        gameId: game.id,
        source: 'steam',
        total: 0,
        unlocked: 0,
        items: [],
        syncedAt: now,
        warning: 'Configure sua Steam Web API Key e SteamID64 em Configurações para carregar conquistas.'
      };
    }

    try {
      // 1. Busca o Schema do jogo (definições de conquistas)
      const schemaUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${encodeURIComponent(
        key
      )}&appid=${encodeURIComponent(appId)}&l=brazilian`;

      // 2. Busca conquistas do jogador
      const playerUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(
        key
      )}&steamid=${encodeURIComponent(id)}&appid=${encodeURIComponent(appId)}&l=brazilian`;

      // 3. Busca porcentagens globais
      const globalUrl = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${encodeURIComponent(
        appId
      )}`;

      const [schemaRes, playerRes, globalRes] = await Promise.allSettled([
        fetch(schemaUrl, { signal: AbortSignal.timeout(12_000) }),
        fetch(playerUrl, { signal: AbortSignal.timeout(12_000) }),
        fetch(globalUrl, { signal: AbortSignal.timeout(10_000) })
      ]);

      // Trata o Schema
      let schemaList: SteamSchemaAchievement[] = [];
      if (schemaRes.status === 'fulfilled' && schemaRes.value.ok) {
        try {
          const schemaData = await schemaRes.value.json();
          schemaList = schemaData?.game?.availableGameStats?.achievements ?? [];
        } catch {
          schemaList = [];
        }
      }

      if (schemaList.length === 0) {
        return {
          gameId: game.id,
          source: 'steam',
          total: 0,
          unlocked: 0,
          items: [],
          syncedAt: now,
          warning: 'Este jogo não possui conquistas na Steam ou o esquema não está disponível.'
        };
      }

      // Trata as porcentagens globais
      const globalPercentMap = new Map<string, number>();
      if (globalRes.status === 'fulfilled' && globalRes.value.ok) {
        try {
          const globalData = await globalRes.value.json();
          const list: SteamGlobalPercent[] = globalData?.achievementpercentages?.achievements ?? [];
          for (const item of list) {
            globalPercentMap.set(item.name, Math.round(item.percent * 10) / 10);
          }
        } catch {
          // ignora falha nas porcentagens globais
        }
      }

      // Trata as conquistas do jogador (resiliência contra perfil privado / 403)
      let playerMap = new Map<string, SteamPlayerAchievement>();
      let warning: string | undefined = undefined;

      if (playerRes.status === 'fulfilled') {
        const pRes = playerRes.value;
        if (pRes.status === 403) {
          warning = 'Perfil da Steam privado ou conquistas ocultas nas configurações de privacidade.';
        } else if (pRes.ok) {
          try {
            const pData = await pRes.json();
            if (pData?.playerstats?.success === false) {
              warning = pData?.playerstats?.error || 'Perfil da Steam privado ou jogo não pertence à conta.';
            } else {
              const achs: SteamPlayerAchievement[] = pData?.playerstats?.achievements ?? [];
              for (const ach of achs) {
                playerMap.set(ach.apiname, ach);
              }
            }
          } catch {
            warning = 'Não foi possível ler os dados de desbloqueio do jogador.';
          }
        } else {
          warning = `Steam retornou HTTP ${pRes.status} para o jogador. Verifique a privacidade do perfil.`;
        }
      } else {
        warning = 'Tempo limite ao consultar o perfil do jogador na Steam.';
      }

      // Monta os itens finais
      const items: Achievement[] = schemaList.map((s) => {
        const playerAch = playerMap.get(s.name);
        const unlocked = playerAch?.achieved === 1;
        const unlockedAt =
          playerAch?.unlocktime && playerAch.unlocktime > 0
            ? new Date(playerAch.unlocktime * 1000).toISOString()
            : undefined;
        const globalPercent = globalPercentMap.get(s.name);

        return {
          id: s.name,
          name: s.displayName || s.name,
          description: s.description || '',
          iconUrl: s.icon,
          iconLockedUrl: s.icongray || s.icon,
          unlocked,
          unlockedAt,
          globalPercent
        };
      });

      const unlockedCount = items.filter((i) => i.unlocked).length;

      return {
        gameId: game.id,
        source: 'steam',
        total: items.length,
        unlocked: unlockedCount,
        items,
        syncedAt: now,
        warning
      };
    } catch (err) {
      return {
        gameId: game.id,
        source: 'steam',
        total: 0,
        unlocked: 0,
        items: [],
        syncedAt: now,
        warning: `Falha na sincronização com a Steam: ${(err as Error).message}`
      };
    }
  }
}

export const steamAchievementsService = new SteamAchievementsService();
