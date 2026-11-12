import { Game } from '@shared/types/game';
import { Achievement, GameAchievements } from '@shared/types/achievements';
import { ApiKeyTestResult } from '@shared/types/ipc';
import { HttpError, describeError, fetchJson, httpRequest } from '../metadata/http';

const STEAM_API = 'https://api.steampowered.com';
const API_TIMEOUT_MS = 12_000;
const COMMUNITY_TIMEOUT_MS = 15_000;
const PERCENT_TIMEOUT_MS = 10_000;
const STEAM = { service: 'a Steam' };

interface SteamPlayerAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
}

interface SteamSchemaAchievement {
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
  icongray?: string;
}

type Result = Omit<GameAchievements, 'gameId' | 'source' | 'syncedAt'>;

const emptyResult = (extra: Partial<Result>): Result => ({ total: 0, unlocked: 0, items: [], ...extra });
const isHttps = (value: unknown): value is string => typeof value === 'string' && value.startsWith('https://');

// Raridade é opcional: qualquer falha só deixa o mapa vazio
async function fetchGlobalPercents(appId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const data = await fetchJson<{ achievementpercentages?: { achievements?: unknown } } | null>(
      `${STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${encodeURIComponent(appId)}`,
      { ...STEAM, timeoutMs: PERCENT_TIMEOUT_MS }
    );
    const list = data?.achievementpercentages?.achievements;
    for (const item of Array.isArray(list) ? (list as { name?: unknown; percent?: unknown }[]) : []) {
      const percent = Number(item?.percent);
      if (typeof item?.name === 'string' && Number.isFinite(percent)) map.set(item.name.toLowerCase(), Math.round(percent * 10) / 10);
    }
  } catch {
    // Sem raridade: a lista sai do mesmo jeito
  }
  return map;
}

export class SteamAchievementsService {
  /**
   * Testa a validade da Web API Key e do SteamID64 usando ISteamUser/GetPlayerSummaries/v2
   */
  async testCredentials(apiKey: string, steamId: string): Promise<ApiKeyTestResult> {
    const key = apiKey.trim();
    const id = steamId.trim();

    if (!key) return { ok: false, message: 'Informe a chave da Steam Web API.' };
    if (!/^7656\d{13}$/.test(id)) return { ok: false, message: 'Informe o SteamID64 (número de 17 dígitos que começa com 7656).' };

    try {
      const res = await httpRequest(`${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(id)}`, {
        ...STEAM,
        timeoutMs: 10_000
      });
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Chave da Steam Web API inválida.' };
      if (!res.ok) return { ok: false, message: `A Steam não respondeu agora (erro ${res.status}). Tente de novo em instantes.` };

      const json = (await res.json().catch(() => null)) as { response?: { players?: { personaname?: unknown }[] } } | null;
      const players = json?.response?.players;
      if (!Array.isArray(players) || players.length === 0) return { ok: false, message: 'SteamID64 não encontrado.' };

      const persona = typeof players[0]?.personaname === 'string' ? players[0].personaname : id;
      return { ok: true, message: `Conectado como "${persona}".` };
    } catch (err) {
      return { ok: false, message: describeError(err) };
    }
  }

  // XML público: https://steamcommunity.com/profiles/<id>/stats/<appid>/achievements/?xml=1
  // closed="1" = desbloqueada; iconClosed é o ícone colorido e iconOpen o cinza.
  private async fetchFromCommunity(appId: string, steamId: string): Promise<Result> {
    let xml: string;
    try {
      const res = await httpRequest(
        `https://steamcommunity.com/profiles/${encodeURIComponent(steamId)}/stats/${encodeURIComponent(appId)}/achievements/?xml=1&l=brazilian`,
        { ...STEAM, timeoutMs: COMMUNITY_TIMEOUT_MS, retries: 1 }
      );
      // Limite de pedidos ou Steam fora do ar não pode virar "este jogo não possui conquistas"
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return emptyResult({ retryable: true, warning: `A Steam não respondeu agora (erro ${res.status}).` });
      }
      xml = await res.text();
    } catch (err) {
      return emptyResult({ retryable: true, warning: describeError(err) });
    }

    const cdata = (block: string, tag: string) =>
      block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`))?.slice(1).find((v) => v !== undefined)?.trim() ?? '';

    const blocks = xml.match(/<achievement closed="[01]">[\s\S]*?<\/achievement>/g) ?? [];
    if (blocks.length === 0) {
      // A Steam responde em HTML (sem as tags do XML) para vários jogos sem página de conquistas: é resposta definitiva
      const privacy = cdata(xml, 'privacyState');
      const error = cdata(xml, 'error');
      return emptyResult({
        warning:
          (privacy && privacy !== 'public') || /private/i.test(error)
            ? 'Perfil da Steam privado: deixe "Detalhes do jogo" como público na privacidade da Steam para ver as conquistas.'
            : error
              ? `Steam: ${error.slice(0, 200)}`
              : 'Este jogo não tem conquistas na Steam.'
      });
    }

    const globalPercent = await fetchGlobalPercents(appId);
    const items: Achievement[] = blocks.flatMap((block) => {
      const apiName = cdata(block, 'apiname');
      if (!apiName) return [];
      const unlocked = block.startsWith('<achievement closed="1"');
      const timestamp = Number(cdata(block, 'unlockTimestamp') || 0);
      const iconClosed = cdata(block, 'iconClosed');
      const iconOpen = cdata(block, 'iconOpen');
      return [
        {
          id: apiName,
          name: cdata(block, 'name') || apiName,
          description: cdata(block, 'description'),
          iconUrl: isHttps(iconClosed) ? iconClosed : '',
          iconLockedUrl: isHttps(iconOpen) ? iconOpen : isHttps(iconClosed) ? iconClosed : '',
          unlocked,
          unlockedAt: unlocked && Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : undefined,
          globalPercent: globalPercent.get(apiName.toLowerCase())
        }
      ];
    });

    return { total: items.length, unlocked: items.filter((i) => i.unlocked).length, items };
  }

  // Com Web API Key: GetSchemaForGame (nomes e ícones) + GetPlayerAchievements (desbloqueios) + raridade global
  private async fetchWithApiKey(appId: string, key: string, steamId: string): Promise<Result> {
    const [schemaRes, playerRes, globalPercent] = await Promise.allSettled([
      httpRequest(`${STEAM_API}/ISteamUserStats/GetSchemaForGame/v2/?key=${encodeURIComponent(key)}&appid=${encodeURIComponent(appId)}&l=brazilian`, {
        ...STEAM,
        timeoutMs: API_TIMEOUT_MS
      }),
      httpRequest(
        `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(key)}&steamid=${encodeURIComponent(steamId)}&appid=${encodeURIComponent(appId)}&l=brazilian`,
        { ...STEAM, timeoutMs: API_TIMEOUT_MS }
      ),
      fetchGlobalPercents(appId)
    ]);

    if (schemaRes.status === 'rejected') return emptyResult({ retryable: true, warning: describeError(schemaRes.reason) });

    // Só limite e queda da Steam passam sozinhos: 400/403 (chave inválida, jogo sem dados) repetiriam para sempre
    const schema = schemaRes.value;
    if (schema.status === 429 || schema.status >= 500) {
      await schema.body?.cancel().catch(() => undefined);
      return emptyResult({ retryable: true, warning: `A Steam não respondeu agora (erro ${schema.status}).` });
    }

    let schemaList: SteamSchemaAchievement[] = [];
    if (schema.ok) {
      try {
        const data = (await schema.json()) as { game?: { availableGameStats?: { achievements?: unknown } } } | null;
        const list = data?.game?.availableGameStats?.achievements;
        schemaList = Array.isArray(list) ? (list as SteamSchemaAchievement[]).filter((s) => typeof s?.name === 'string' && s.name) : [];
      } catch {
        return emptyResult({ retryable: true, warning: 'A Steam mandou uma lista de conquistas que o Lazulium não entendeu.' });
      }
    } else {
      await schema.body?.cancel().catch(() => undefined);
    }

    if (schemaList.length === 0) {
      return emptyResult({ noList: true, warning: 'Este jogo não tem conquistas na Steam, ou ela não mandou a lista.' });
    }

    // Conquistas do jogador (resiliência contra perfil privado / 403 / 429 / 5xx)
    const playerMap = new Map<string, SteamPlayerAchievement>();
    let warning: string | undefined;
    let retryable: boolean | undefined;

    if (playerRes.status === 'fulfilled') {
      const res = playerRes.value;
      if (res.status === 401 || res.status === 403) {
        warning = 'Perfil da Steam privado ou conquistas ocultas nas configurações de privacidade.';
      } else if (res.status === 429 || res.status >= 500) {
        warning = `A Steam não respondeu agora (erro ${res.status}). O Lazulium tenta de novo mais tarde.`;
        retryable = true;
      } else if (res.ok) {
        try {
          const data = (await res.json()) as { playerstats?: { success?: boolean; error?: unknown; achievements?: unknown } } | null;
          if (data?.playerstats?.success === false) {
            warning = typeof data.playerstats.error === 'string' ? data.playerstats.error.slice(0, 200) : 'Perfil da Steam privado ou jogo não pertence à conta.';
          } else {
            const list = data?.playerstats?.achievements;
            for (const ach of Array.isArray(list) ? (list as SteamPlayerAchievement[]) : []) {
              if (typeof ach?.apiname === 'string') playerMap.set(ach.apiname, ach);
            }
          }
        } catch {
          warning = 'Não deu para ler suas conquistas desbloqueadas.';
          retryable = true;
        }
      } else {
        warning = `A Steam recusou o pedido (erro ${res.status}). Confira a privacidade do perfil.`;
      }
      if (!res.bodyUsed) await res.body?.cancel().catch(() => undefined);
    } else {
      warning = describeError(playerRes.reason);
      retryable = true;
    }

    const percents = globalPercent.status === 'fulfilled' ? globalPercent.value : new Map<string, number>();
    const items: Achievement[] = schemaList.map((s) => {
      const playerAch = playerMap.get(s.name);
      const unlocked = Number(playerAch?.achieved) === 1;
      const unlockTime = Number(playerAch?.unlocktime);
      return {
        id: s.name,
        name: typeof s.displayName === 'string' && s.displayName ? s.displayName : s.name,
        description: typeof s.description === 'string' ? s.description : '',
        iconUrl: isHttps(s.icon) ? s.icon : '',
        iconLockedUrl: isHttps(s.icongray) ? s.icongray : isHttps(s.icon) ? s.icon : '',
        unlocked,
        unlockedAt: Number.isFinite(unlockTime) && unlockTime > 0 ? new Date(unlockTime * 1000).toISOString() : undefined,
        globalPercent: percents.get(s.name.toLowerCase())
      };
    });

    return { total: items.length, unlocked: items.filter((i) => i.unlocked).length, items, retryable, warning };
  }

  /**
   * Conquistas de um jogo da Steam. Com Web API Key (opção avançada) usa a API oficial;
   * sem ela, a página pública de conquistas do perfil (só precisa do SteamID).
   */
  async fetchAchievements(game: Game, apiKey: string, steamId: string): Promise<GameAchievements> {
    const base = { gameId: game.id, source: 'steam' as const, syncedAt: new Date().toISOString() };
    const appId = game.platformGameId || game.id.replace('steam-', '');

    if (game.platform !== 'steam' || !/^\d+$/.test(appId)) {
      return { ...base, ...emptyResult({ warning: 'Este jogo não é da plataforma Steam.' }) };
    }

    const key = apiKey.trim();
    const id = steamId.trim();
    if (!/^7656\d{13}$/.test(id)) {
      return { ...base, ...emptyResult({ warning: 'Entre com sua conta Steam em Configurações → Contas para ver as conquistas.' }) };
    }

    try {
      return { ...base, ...(key ? await this.fetchWithApiKey(appId, key, id) : await this.fetchFromCommunity(appId, id)) };
    } catch (err) {
      return { ...base, ...emptyResult({ retryable: true, warning: err instanceof HttpError ? err.message : 'Algo deu errado ao atualizar as conquistas da Steam.' }) };
    }
  }
}

export const steamAchievementsService = new SteamAchievementsService();
