import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAchievements } from '@shared/types/achievements';
import { useTempUserData } from '../helpers/electron-mock';
import { makeAchievements, makeGame } from '../helpers/fixtures';

const sleepCalls: number[] = [];

vi.mock('../../src/main/services/metadata/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/services/metadata/http')>();
  return {
    ...actual,
    sleep: vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    })
  };
});

type Db = typeof import('../../src/main/database/db')['db'];
type AchievementsService = typeof import('../../src/main/services/achievements/achievements.service')['achievementsService'];
type SteamAchievementsService = typeof import('../../src/main/services/achievements/steam-achievements.service')['steamAchievementsService'];
type ProfileService = typeof import('../../src/main/services/profile/profile.service')['profileService'];

const STEAM_ID = '76561198000000001';

let db: Db;
let achievementsService: AchievementsService;
let steamAchievementsService: SteamAchievementsService;
let profileService: ProfileService;

const xmlWithOneAchievement = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<playerstats>
  <privacyState>public</privacyState>
  <achievements>
    <achievement closed="1">
      <apiname>ACH_ONE</apiname>
      <name><![CDATA[Primeira Conquista]]></name>
      <description><![CDATA[Completa a fase]]></description>
      <iconClosed><![CDATA[https://cdn.fastly.steamstatic.com/icon1.jpg]]></iconClosed>
      <iconOpen><![CDATA[https://cdn.fastly.steamstatic.com/icon0.jpg]]></iconOpen>
      <unlockTimestamp>1700000000</unlockTimestamp>
    </achievement>
  </achievements>
</playerstats>`;

beforeEach(async () => {
  vi.resetModules();
  sleepCalls.length = 0;
  useTempUserData();
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  ({ steamAchievementsService } = await import('../../src/main/services/achievements/steam-achievements.service'));
  ({ achievementsService } = await import('../../src/main/services/achievements/achievements.service'));
  ({ profileService } = await import('../../src/main/services/profile/profile.service'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('conquistas da Steam pela página pública', () => {
  it('preserva ?xml=1 quando a Steam redireciona o AppID para nome curto (ex: Portal2)', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('/stats/620/achievements/')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://steamcommunity.com/id/Exemplo/stats/Portal2?tab=achievements' }
        });
      }
      if (url === 'https://steamcommunity.com/id/Exemplo/stats/Portal2/achievements/?xml=1&l=brazilian') {
        return new Response(xmlWithOneAchievement, { status: 200 });
      }
      if (url.includes('GetGlobalAchievementPercentagesForApp')) {
        return new Response(JSON.stringify({ achievementpercentages: { achievements: [{ name: 'ACH_ONE', percent: 42.5 }] } }), { status: 200 });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const game = makeGame({ id: 'steam-620', platform: 'steam', platformGameId: '620', totalPlaytimeSeconds: 3600 });
    const res = await steamAchievementsService.fetchAchievements(game, '', STEAM_ID);

    expect(requestedUrls).toContain('https://steamcommunity.com/id/Exemplo/stats/Portal2/achievements/?xml=1&l=brazilian');
    expect(res.retryable).toBeUndefined();
    expect(res.noList).toBeUndefined();
    expect(res.total).toBe(1);
    expect(res.unlocked).toBe(1);
    expect(res.items[0]?.globalPercent).toBe(42.5);
  });

  it('marca noList quando a Steam redireciona direto para a raiz do perfil (jogo sem estatísticas)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://steamcommunity.com/id/Exemplo' } }))
    );

    const game = makeGame({ id: 'steam-10', platform: 'steam', platformGameId: '10', totalPlaytimeSeconds: 600 });
    const res = await steamAchievementsService.fetchAchievements(game, '', STEAM_ID);

    expect(res.noList).toBe(true);
    expect(res.retryable).toBeUndefined();
  });

  it('identifica perfil privado na página HTML de erro sem marcar como sem conquistas', async () => {
    const html = `<!DOCTYPE html><html><head><title>Steam Community :: Error</title></head><body>
      <div class="profile_fatalerror_message">You do not have permission to view these game stats.</div>
    </body></html>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })));

    const game = makeGame({ id: 'steam-440', platform: 'steam', platformGameId: '440', totalPlaytimeSeconds: 1200 });
    const res = await steamAchievementsService.fetchAchievements(game, '', STEAM_ID);

    expect(res.warning).toMatch(/^Perfil da Steam privado/);
    expect(res.noList).toBeUndefined();
    expect(res.retryable).toBeUndefined();
  });

  it('trata HTML genérico "Steam Community :: Error" como falha passageira em vez de jogo sem lista', async () => {
    const html = `<!DOCTYPE html><html><head><title>Steam Community :: Error</title></head><body>
      <h3>An error was encountered while processing your request:</h3>
    </body></html>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })));

    const game = makeGame({ id: 'steam-500', platform: 'steam', platformGameId: '500', totalPlaytimeSeconds: 1200 });
    const res = await steamAchievementsService.fetchAchievements(game, '', STEAM_ID);

    expect(res.retryable).toBe(true);
    expect(res.noList).toBeUndefined();
  });

  it('retorna erro 429 claro e retryable quando a Steam limita pedidos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));

    const game = makeGame({ id: 'steam-730', platform: 'steam', platformGameId: '730', totalPlaytimeSeconds: 1200 });
    const res = await steamAchievementsService.fetchAchievements(game, '', STEAM_ID);

    expect(res.retryable).toBe(true);
    expect(res.warning).toContain('429');
  });
});

describe('sincronização completa de conquistas do perfil', () => {
  function seedPlayedSteamGames(count: number): void {
    for (let i = 1; i <= count; i++) {
      db.upsertGame(makeGame({ id: `steam-${i}`, title: `Jogo ${i}`, platform: 'steam', totalPlaytimeSeconds: 3600 }));
    }
  }

  it('faz pausa de 429, tenta o mesmo jogo de novo e reduz o ritmo após recuperar', async () => {
    seedPlayedSteamGames(3);
    let game2Attempts = 0;
    vi.spyOn(achievementsService, 'getAchievements').mockImplementation(async (gameId): Promise<GameAchievements> => {
      if (gameId === 'steam-2') {
        game2Attempts++;
        if (game2Attempts === 1) {
          return {
            gameId,
            source: 'steam',
            total: 0,
            unlocked: 0,
            items: [],
            syncedAt: new Date().toISOString(),
            retryable: true,
            warning: 'A Steam limitou os pedidos temporariamente (erro 429). Espere alguns minutos e tente de novo.'
          };
        }
      }
      return makeAchievements(gameId, 1);
    });

    const result = await profileService.syncAllAchievements();

    expect(result).toEqual({ synced: 3, failed: 0, privateGames: 0 });
    expect(game2Attempts).toBe(2);
    // Primeiro jogo em ritmo normal (450ms), depois pausa do 429 (10s), depois ritmo cauteloso (750ms)
    expect(sleepCalls).toEqual([450, 10_000, 750]);
  });

  it('interrompe após esgotar as esperas de 429, devolve o motivo e contabiliza os restantes', async () => {
    seedPlayedSteamGames(5);
    vi.spyOn(achievementsService, 'getAchievements').mockImplementation(async (gameId): Promise<GameAchievements> => {
      if (gameId === 'steam-1') return makeAchievements(gameId, 1);
      return {
        gameId,
        source: 'steam',
        total: 0,
        unlocked: 0,
        items: [],
        syncedAt: new Date().toISOString(),
        retryable: true,
        warning: 'A Steam limitou os pedidos temporariamente (erro 429). Espere alguns minutos e tente de novo.'
      };
    });

    const result = await profileService.syncAllAchievements();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(4);
    expect(result.reason).toContain('429');
    expect(sleepCalls).toEqual([450, 10_000, 20_000, 35_000]);
  });

  it('interrompe cedo após 8 falhas de rede seguidas sem aplicar espera longa de 429', async () => {
    seedPlayedSteamGames(10);
    const getSpy = vi.spyOn(achievementsService, 'getAchievements').mockImplementation(async (gameId): Promise<GameAchievements> => ({
      gameId,
      source: 'steam',
      total: 0,
      unlocked: 0,
      items: [],
      syncedAt: new Date().toISOString(),
      retryable: true,
      warning: 'Sem conexão com a Steam. Confira a internet.'
    }));

    const result = await profileService.syncAllAchievements();

    expect(getSpy).toHaveBeenCalledTimes(8);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(10);
    expect(result.reason).toBe('Sem conexão com a Steam. Confira a internet.');
    expect(sleepCalls.every((ms) => ms < 1000)).toBe(true);
  });

  it('não aplica pausa de rede quando as conquistas vêm do cache local válido', async () => {
    seedPlayedSteamGames(3);
    const now = new Date().toISOString();
    for (let i = 1; i <= 3; i++) {
      db.saveGameAchievements({ ...makeAchievements(`steam-${i}`, 1), syncedAt: now });
    }
    vi.spyOn(achievementsService, 'getAchievements').mockImplementation(async (gameId) => db.getGameAchievements(gameId));

    const result = await profileService.syncAllAchievements();

    expect(result).toEqual({ synced: 3, failed: 0, privateGames: 0 });
    expect(sleepCalls).toEqual([]);
  });
});
