import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedGame, PlatformScanResult } from '../../src/main/services/scanners/scanner.types';
import type { GamePlatform } from '@shared/types/game';
import { useTempUserData } from '../helpers/electron-mock';
import { makeAchievements, makeGame } from '../helpers/fixtures';

// O que cada scanner "encontra" neste teste: uma lista, ou um erro para simular o scanner quebrado
const scans = vi.hoisted(() => {
  const results: Record<string, PlatformScanResult | Error | undefined> = {};
  const scanner = (platform: string) => ({
    platform,
    scan: async (): Promise<PlatformScanResult> => {
      const result = results[platform];
      if (result instanceof Error) throw result;
      return result ?? { games: [], warnings: [] };
    }
  });
  return { results, scanner };
});

vi.mock('../../src/main/services/scanners/steam-scanner.service', () => ({ steamScanner: scans.scanner('steam'), findSteamPath: async () => null }));
vi.mock('../../src/main/services/scanners/epic-scanner.service', () => ({ epicScanner: scans.scanner('epic') }));
vi.mock('../../src/main/services/scanners/gog-scanner.service', () => ({ gogScanner: scans.scanner('gog') }));
vi.mock('../../src/main/services/scanners/riot-scanner.service', () => ({ riotScanner: scans.scanner('riot') }));
vi.mock('../../src/main/services/scanners/xbox-scanner.service', () => ({ xboxScanner: scans.scanner('xbox') }));
vi.mock('../../src/main/services/scanners/battlenet-scanner.service', () => ({ battlenetScanner: scans.scanner('battlenet') }));
vi.mock('../../src/main/services/scanners/ea-scanner.service', () => ({ eaScanner: scans.scanner('ea') }));
vi.mock('../../src/main/services/scanners/ubisoft-scanner.service', () => ({ ubisoftScanner: scans.scanner('ubisoft') }));
vi.mock('../../src/main/services/scanners/emulator-scanner.service', () => ({ createEmulatorScanner: () => scans.scanner('emulator') }));
vi.mock('../../src/main/services/scanners/emulator-detect.service', () => ({ detectEmulators: async () => [] }));
vi.mock('../../src/main/services/scanners/standalone-scanner.service', () => ({ createStandaloneScanner: () => scans.scanner('standalone'), commonGameFolders: () => [] }));
// A busca de nomes na loja da Steam sai para a rede: fica só a regra do nome provisório
vi.mock('../../src/main/services/scanners/steam-names.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/main/services/scanners/steam-names.service')>()),
  steamNamesService: { resolveMissing: async () => undefined }
}));

type Db = typeof import('../../src/main/database/db')['db'];
let db: Db;
let scanLibraries: typeof import('../../src/main/services/scanners')['scanLibraries'];

const detected = (overrides: Partial<DetectedGame> & Pick<DetectedGame, 'id'>): DetectedGame => ({
  title: overrides.id,
  platform: 'steam',
  executablePath: '',
  ...overrides
});

const found = (platform: GamePlatform, ...games: DetectedGame[]) => {
  scans.results[platform] = { games, warnings: [] };
};

beforeEach(async () => {
  for (const key of Object.keys(scans.results)) delete scans.results[key];
  useTempUserData();
  vi.resetModules();
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  ({ scanLibraries } = await import('../../src/main/services/scanners'));
});

describe('scan: jogo novo', () => {
  it('entra com os padrões e as horas que o launcher já contava', async () => {
    found('steam', detected({ id: 'steam-10', title: 'Hades', platformGameId: '10', initialPlaytimeSeconds: 7200, lastPlayedAt: '2026-10-01T00:00:00.000Z' }));
    const result = await scanLibraries();

    expect(result.added).toBe(1);
    expect(db.getGameById('steam-10')).toMatchObject({
      title: 'Hades',
      isInstalled: true,
      isFavorite: false,
      isHidden: false,
      tags: [],
      totalPlaytimeSeconds: 7200,
      sourcePlaytimeSeconds: 7200,
      lastPlayedAt: '2026-10-01T00:00:00.000Z'
    });
  });

  it('escanear de novo sem mudança não conta como atualização', async () => {
    found('steam', detected({ id: 'steam-10', title: 'Hades' }));
    await scanLibraries();
    const again = await scanLibraries();
    expect(again).toMatchObject({ added: 0, updated: 0, total: 1 });
  });
});

describe('scan: o que é da pessoa não é sobrescrito', () => {
  it('favorito, nome escolhido, capa trocada, registro do Diário e horas ficam', async () => {
    db.upsertGame(
      makeGame({
        id: 'steam-10',
        title: 'Meu Hades',
        customTitle: 'Meu Hades',
        isFavorite: true,
        media: { coverUrl: 'lazulium-media://capa-escolhida' },
        log: { status: 'finished', rating: 4.5 },
        totalPlaytimeSeconds: 10_000,
        lastPlayedAt: '2026-11-01T00:00:00.000Z'
      })
    );
    found(
      'steam',
      detected({
        id: 'steam-10',
        title: 'Hades',
        installPath: 'D:\\Steam\\Hades',
        media: { coverUrl: 'https://cdn/capa-padrao.jpg', heroUrl: 'https://cdn/hero.jpg' },
        initialPlaytimeSeconds: 3600,
        lastPlayedAt: '2026-09-01T00:00:00.000Z'
      })
    );
    await scanLibraries();

    expect(db.getGameById('steam-10')).toMatchObject({
      title: 'Meu Hades',
      detectedTitle: 'Hades',
      isFavorite: true,
      installPath: 'D:\\Steam\\Hades',
      media: { coverUrl: 'lazulium-media://capa-escolhida', heroUrl: 'https://cdn/hero.jpg' },
      log: { status: 'finished', rating: 4.5 },
      totalPlaytimeSeconds: 10_000,
      lastPlayedAt: '2026-11-01T00:00:00.000Z'
    });
  });

  it('horas do launcher mais o ajuste manual valem quando passam do que estava contado', async () => {
    db.upsertGame(makeGame({ id: 'steam-10', totalPlaytimeSeconds: 100, playtimeAdjustmentSeconds: 500 }));
    found('steam', detected({ id: 'steam-10', initialPlaytimeSeconds: 3600 }));
    await scanLibraries();
    expect(db.getGameById('steam-10')?.totalPlaytimeSeconds).toBe(4100);
  });

  it('nome provisório da Steam não apaga o nome que já se sabia', async () => {
    db.upsertGame(makeGame({ id: 'steam-10', title: 'Hades' }));
    found('steam', detected({ id: 'steam-10', title: 'Jogo Steam 10' }));
    await scanLibraries();
    expect(db.getGameById('steam-10')?.title).toBe('Hades');
  });

  it('registro feito à mão nunca é tocado por scan', async () => {
    db.upsertGame(makeGame({ id: 'journal-1', title: 'Zelda de console', platform: 'standalone', manualEntry: true, manualPlatform: 'Switch' }));
    await scanLibraries();
    expect(db.getGameById('journal-1')).toMatchObject({ manualEntry: true, manualPlatform: 'Switch' });
    expect(db.getGameById('journal-1')?.isInstalled).toBeUndefined();
  });
});

describe('scan: um scanner com problema não atrapalha os outros', () => {
  it('scanner que quebra vira aviso; os jogos dele ficam como estavam e os outros entram', async () => {
    db.upsertGame(makeGame({ id: 'epic-fortnite', title: 'Fortnite', platform: 'epic' }));
    scans.results.epic = new Error('manifest ilegível');
    found('steam', detected({ id: 'steam-10', title: 'Hades' }));
    const result = await scanLibraries();

    expect(result.warnings.some((w) => w.startsWith('Epic Games'))).toBe(true);
    expect(db.getGameById('steam-10')).not.toBeNull();
    expect(db.getGameById('epic-fortnite')?.isInstalled).not.toBe(false);
  });

  it('lista vazia com aviso (launcher não encontrado) não marca os jogos como desinstalados', async () => {
    db.upsertGame(makeGame({ id: 'steam-10', title: 'Hades' }));
    scans.results.steam = { games: [], warnings: ['Steam não encontrada'] };
    await scanLibraries();
    expect(db.getGameById('steam-10')?.isInstalled).not.toBe(false);
  });
});

describe('scan: jogo que saiu do PC', () => {
  it('fica guardado como não instalado, com horas e conquistas, e volta ao reinstalar', async () => {
    db.upsertGame(makeGame({ id: 'steam-10', title: 'Hades', totalPlaytimeSeconds: 5000 }));
    db.saveGameAchievements(makeAchievements('steam-10', 2));
    found('steam', detected({ id: 'steam-20', title: 'Outro jogo' }));
    await scanLibraries();

    expect(db.getGameById('steam-10')).toMatchObject({ isInstalled: false, totalPlaytimeSeconds: 5000 });
    expect(db.getGameAchievements('steam-10')?.unlocked).toBe(2);

    found('steam', detected({ id: 'steam-10', title: 'Hades' }), detected({ id: 'steam-20', title: 'Outro jogo' }));
    await scanLibraries();
    expect(db.getGameById('steam-10')).toMatchObject({ isInstalled: true, totalPlaytimeSeconds: 5000 });
  });

  it('escanear só uma plataforma não mexe nos jogos das outras', async () => {
    db.upsertGame(makeGame({ id: 'epic-fortnite', platform: 'epic' }));
    found('steam', detected({ id: 'steam-10' }));
    await scanLibraries(['steam']);
    expect(db.getGameById('epic-fortnite')?.isInstalled).not.toBe(false);
  });

  it('ROM que sumiu sem nada da pessoa é apagada; com categoria, favorito ou horas, fica', async () => {
    db.upsertGames([
      makeGame({ id: 'emu-vazia', platform: 'emulator' }),
      makeGame({ id: 'emu-categoria', platform: 'emulator' }),
      makeGame({ id: 'emu-favorita', platform: 'emulator', isFavorite: true }),
      makeGame({ id: 'emu-jogada', platform: 'emulator', totalPlaytimeSeconds: 600 })
    ]);
    db.setGameCategories([{ id: 'c1', name: 'Zelda', gameIds: ['emu-categoria'], createdAt: '', updatedAt: '' }]);
    found('emulator', detected({ id: 'emu-outra', platform: 'emulator' }));
    await scanLibraries();

    expect(db.getGameById('emu-vazia')).toBeNull();
    for (const id of ['emu-categoria', 'emu-favorita', 'emu-jogada']) expect(db.getGameById(id)).toMatchObject({ isInstalled: false });
    expect(db.getGameCategories()[0].gameIds).toEqual(['emu-categoria']);
  });
});

describe('scan: mesmo jogo em outra instalação', () => {
  it('reinstalado em outra pasta, herda horas, favorito, registro, conquistas e categorias', async () => {
    db.upsertGame(
      makeGame({
        id: 'standalone-antiga',
        title: 'Celeste',
        platform: 'standalone',
        executablePath: 'C:\\pasta-que-nao-existe\\Celeste.exe',
        isFavorite: true,
        totalPlaytimeSeconds: 9000,
        log: { status: 'completed' }
      })
    );
    db.saveGameAchievements(makeAchievements('standalone-antiga', 2));
    db.setGameCategories([{ id: 'c1', name: 'Plataforma', gameIds: ['standalone-antiga'], createdAt: '', updatedAt: '' }]);

    found('standalone', detected({ id: 'standalone-nova', title: 'Celeste', platform: 'standalone', executablePath: 'D:\\Jogos\\Celeste\\Celeste.exe' }));
    await scanLibraries();

    expect(db.getGameById('standalone-antiga')).toBeNull();
    expect(db.getGameById('standalone-nova')).toMatchObject({
      isFavorite: true,
      totalPlaytimeSeconds: 9000,
      log: { status: 'completed' },
      executablePath: 'D:\\Jogos\\Celeste\\Celeste.exe'
    });
    expect(db.getGameAchievements('standalone-nova')?.unlocked).toBe(2);
    expect(db.getGameCategories()[0].gameIds).toEqual(['standalone-nova']);
  });

  it('registro do Diário com o mesmo nome não é engolido por um jogo detectado', async () => {
    db.upsertGame(makeGame({ id: 'journal-1', title: 'Celeste', platform: 'standalone', manualEntry: true, totalPlaytimeSeconds: 100 }));
    found('standalone', detected({ id: 'standalone-nova', title: 'Celeste', platform: 'standalone' }));
    await scanLibraries();
    expect(db.getGameById('journal-1')).not.toBeNull();
    expect(db.getGameById('standalone-nova')?.totalPlaytimeSeconds).toBe(0);
  });
});
