import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { normalizeIgdbGenres } from '@shared/utils/genres';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';

type Db = typeof import('../../src/main/database/db')['db'];
type ServiceMod = typeof import('../../src/main/services/metadata/game-metadata.service');

let db: Db;
let cleanQueryTitle: ServiceMod['cleanQueryTitle'];
let fetchGameMetadataRemote: ServiceMod['fetchGameMetadataRemote'];
let gameMetadataService: ServiceMod['gameMetadataService'];
let server: Server;
let requests: string[];
let nextStatus: number;
let nextPayload: Record<string, unknown>;

beforeEach(async () => {
  vi.resetModules();
  useTempUserData();
  requests = [];
  nextStatus = 200;
  nextPayload = {
    found: true,
    gameId: 72,
    name: 'Portal 2',
    year: 2011,
    genres: ['Shooter', 'Puzzle'],
    themes: ['Action', 'Sci-fi'],
    series: 'Portal'
  };

  server = createServer((req: IncomingMessage, res) => {
    requests.push(req.url ?? '/');
    res.writeHead(nextStatus, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(nextStatus >= 400 ? { error: 'bad_request' } : nextPayload));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  process.env.LAZULIUM_IGDB_PROXY_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  ({ cleanQueryTitle, fetchGameMetadataRemote, gameMetadataService } = await import('../../src/main/services/metadata/game-metadata.service'));
});

afterEach(async () => {
  delete process.env.LAZULIUM_IGDB_PROXY_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('normalização de consulta e gêneros IGDB', () => {
  it('limpa sufixos entre parênteses, símbolos e espaços excessivos do título', () => {
    expect(cleanQueryTitle('Portal 2™ (GOTY) [PT-BR]®   Edition')).toBe('Portal 2 Edition');
    expect(cleanQueryTitle('[1999]')).toBe('[1999]');
    expect(cleanQueryTitle('a'.repeat(200)).length).toBeLessThanOrEqual(120);
  });

  it('traduz gêneros e temas principais para português sem duplicar', () => {
    expect(normalizeIgdbGenres(['Shooter', 'Role-playing (RPG)', 'Puzzle'], ['Action', 'Horror', 'Science fiction'])).toEqual([
      'Ação',
      'Terror',
      'Tiro',
      'RPG',
      'Quebra-cabeça'
    ]);
  });
});

describe('gameMetadataService', () => {
  it('busca por steamAppId + título para jogos Steam e omite steamAppId em outras lojas ou atalhos', async () => {
    const remoteSteam = await fetchGameMetadataRemote({ id: 'steam-620', platform: 'steam', platformGameId: '620', title: 'Portal 2™' });
    expect(remoteSteam).toEqual({
      genres: ['Ação', 'Tiro', 'Quebra-cabeça'],
      releaseYear: 2011,
      series: 'Portal'
    });
    expect(requests[0]).toContain('steamAppId=620');
    expect(requests[0]).toContain('title=Portal+2');

    await fetchGameMetadataRemote({ id: 'steam-shortcut-12345', platform: 'steam', platformGameId: '3123456789', title: 'Celeste (Switch)' });
    expect(requests[1]).not.toContain('steamAppId=');
    expect(requests[1]).toContain('title=Celeste');

    await fetchGameMetadataRemote({ platform: 'gog', platformGameId: '1234', title: 'Control (Ultimate)' });
    expect(requests[2]).not.toContain('steamAppId=');
    expect(requests[2]).toContain('title=Control');
  });

  it('salva gêneros/ano/série ao chamar ensure, usa cache e retorna objeto limpo via forget', async () => {
    db.upsertGames([makeGame({ id: 'steam_620', title: 'Portal 2', platform: 'steam', platformGameId: '620' })]);
    const notified: string[] = [];
    gameMetadataService.setGameUpdatedListener((g) => notified.push(g.id));

    const first = await gameMetadataService.ensure('steam_620');
    expect(first?.genres).toEqual(['Ação', 'Tiro', 'Quebra-cabeça']);
    expect(first?.releaseYear).toBe(2011);
    expect(first?.series).toBe('Portal');
    expect(first?.metadataCheckedAt).toBeTypeOf('number');
    expect(notified).toEqual(['steam_620']);
    expect(requests).toHaveLength(1);

    const second = await gameMetadataService.ensure('steam_620');
    expect(second?.series).toBe('Portal');
    expect(requests).toHaveLength(1);

    const forgotten = gameMetadataService.forget('steam_620');
    expect(forgotten?.series).toBeUndefined();
    expect(db.getGameById('steam_620')?.series).toBeUndefined();
    expect(db.getGameById('steam_620')?.metadataCheckedAt).toBeUndefined();

    nextPayload = { found: true, gameId: 72, name: 'Portal 2', year: 2012, genres: ['Puzzle'], themes: [], series: 'Portal Series' };
    const refreshed = await gameMetadataService.ensure('steam_620');
    expect(refreshed?.releaseYear).toBe(2012);
    expect(refreshed?.series).toBe('Portal Series');
    expect(requests).toHaveLength(2);
  });

  it('marca metadataCheckedAt em HTTP 400 para evitar repetir consultas inválidas', async () => {
    db.upsertGames([makeGame({ id: 'bad', title: 'XX', platform: 'standalone' })]);
    nextStatus = 400;
    const result = await gameMetadataService.ensure('bad');
    expect(result?.metadataCheckedAt).toBeTypeOf('number');
    expect(result?.genres).toBeUndefined();
    expect(requests).toHaveLength(1);

    await gameMetadataService.ensure('bad');
    expect(requests).toHaveLength(1);
  });
});
