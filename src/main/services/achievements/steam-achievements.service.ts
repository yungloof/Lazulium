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

  private async fetchGlobalPercents(appId: string): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    try {
      const res = await fetch(
        `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${encodeURIComponent(appId)}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      const list: SteamGlobalPercent[] = (await res.json())?.achievementpercentages?.achievements ?? [];
      for (const item of list) map.set(item.name.toLowerCase(), Math.round(Number(item.percent) * 10) / 10);
    } catch {
      // Raridade é opcional
    }
    return map;
  }

  // XML público: https://steamcommunity.com/profiles/<id>/stats/<appid>/achievements/?xml=1
  // closed="1" = desbloqueada; iconClosed é o ícone colorido e iconOpen o cinza.
  private async fetchFromCommunity(game: Game, appId: string, steamId: string, now: string): Promise<GameAchievements> {
    const base = { gameId: game.id, source: 'steam' as const, syncedAt: now };
    let xml: string;
    try {
      const res = await fetch(
        `https://steamcommunity.com/profiles/${encodeURIComponent(steamId)}/stats/${encodeURIComponent(appId)}/achievements/?xml=1&l=brazilian`,
        { signal: AbortSignal.timeout(15_000) }
      );
      // Limite de pedidos ou Steam fora do ar não pode virar "este jogo não possui conquistas"
      if (!res.ok) return { ...base, total: 0, unlocked: 0, items: [], retryable: true, warning: `A Steam não respondeu agora (HTTP ${res.status}).` };
      xml = await res.text();
    } catch (err) {
      return { ...base, total: 0, unlocked: 0, items: [], retryable: true, warning: `Sem conexão com a Steam (${(err as Error).message}).` };
    }

    const cdata = (block: string, tag: string) =>
      block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`))?.slice(1).find((v) => v !== undefined)?.trim() ?? '';

    const blocks = xml.match(/<achievement closed="[01]">[\s\S]*?<\/achievement>/g) ?? [];
    if (blocks.length === 0) {
      const privacy = cdata(xml, 'privacyState');
      const error = cdata(xml, 'error');
      return {
        ...base,
        total: 0,
        unlocked: 0,
        items: [],
        warning:
          privacy && privacy !== 'public'
            ? 'Perfil da Steam privado: deixe "Detalhes do jogo" como público na privacidade da Steam para ver as conquistas.'
            : error
              ? `Steam: ${error}`
              : 'Este jogo não possui conquistas na Steam.'
      };
    }

    const globalPercent = await this.fetchGlobalPercents(appId);
    const items: Achievement[] = blocks.map((block) => {
      const apiName = cdata(block, 'apiname');
      const unlocked = block.startsWith('<achievement closed="1"');
      const timestamp = Number(cdata(block, 'unlockTimestamp') || 0);
      return {
        id: apiName,
        name: cdata(block, 'name') || apiName,
        description: cdata(block, 'description'),
        iconUrl: cdata(block, 'iconClosed'),
        iconLockedUrl: cdata(block, 'iconOpen') || cdata(block, 'iconClosed'),
        unlocked,
        unlockedAt: unlocked && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : undefined,
        globalPercent: globalPercent.get(apiName.toLowerCase())
      };
    });

    return { ...base, total: items.length, unlocked: items.filter((i) => i.unlocked).length, items };
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

    if (!id) {
      return {
        gameId: game.id,
        source: 'steam',
        total: 0,
        unlocked: 0,
        items: [],
        syncedAt: now,
        warning: 'Entre com sua conta Steam em Configurações → Contas para ver as conquistas.'
      };
    }

    // Sem Web API Key: usa a página pública de conquistas do perfil (só precisa do SteamID)
    if (!key) return this.fetchFromCommunity(game, appId, id, now);

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
      if (schemaRes.status === 'rejected') {
        return {
          gameId: game.id,
          source: 'steam',
          total: 0,
          unlocked: 0,
          items: [],
          syncedAt: now,
          retryable: true,
          warning: `Sem conexão com a Steam para obter o esquema de conquistas (${(schemaRes.reason as Error)?.message || 'tempo limite'}).`
        };
      }

      // Só limite e queda da Steam passam sozinhos: 400/403 (chave inválida, jogo sem dados) repetiriam para sempre
      if (schemaRes.value.status === 429 || schemaRes.value.status >= 500) {
        return {
          gameId: game.id,
          source: 'steam',
          total: 0,
          unlocked: 0,
          items: [],
          syncedAt: now,
          retryable: true,
          warning: `A Steam não respondeu ao esquema de conquistas (HTTP ${schemaRes.value.status}).`
        };
      }

      let schemaList: SteamSchemaAchievement[] = [];
      if (schemaRes.value.ok) {
        try {
          const schemaData = await schemaRes.value.json();
          schemaList = schemaData?.game?.availableGameStats?.achievements ?? [];
        } catch {
          return {
            gameId: game.id,
            source: 'steam',
            total: 0,
            unlocked: 0,
            items: [],
            syncedAt: now,
            retryable: true,
            warning: 'Não foi possível ler o esquema de conquistas retornado pela Steam.'
          };
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
          noList: true,
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

      // Trata as conquistas do jogador (resiliência contra perfil privado / 403 / 429 / 5xx)
      let playerMap = new Map<string, SteamPlayerAchievement>();
      let warning: string | undefined = undefined;
      let retryable: boolean | undefined = undefined;

      if (playerRes.status === 'fulfilled') {
        const pRes = playerRes.value;
        if (pRes.status === 401 || pRes.status === 403) {
          warning = 'Perfil da Steam privado ou conquistas ocultas nas configurações de privacidade.';
        } else if (pRes.status === 429) {
          warning = 'A Steam limitou pedidos (HTTP 429). Tente de novo mais tarde.';
          retryable = true;
        } else if (pRes.status >= 500) {
          warning = `A Steam retornou HTTP ${pRes.status} para o jogador. Tente de novo mais tarde.`;
          retryable = true;
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
            retryable = true;
          }
        } else {
          warning = `Steam retornou HTTP ${pRes.status} para o jogador. Verifique a privacidade do perfil.`;
        }
      } else {
        warning = 'Tempo limite ao consultar o perfil do jogador na Steam.';
        retryable = true;
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
        retryable,
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
        retryable: true,
        warning: `Falha na sincronização com a Steam: ${(err as Error).message}`
      };
    }
  }
}

export const steamAchievementsService = new SteamAchievementsService();
