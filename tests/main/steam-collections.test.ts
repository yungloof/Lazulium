import { mkdirSync, utimesSync, writeFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';

const steamMockState: { steamPath?: string; accountDirs: string[] } = {
  steamPath: undefined,
  accountDirs: []
};

vi.mock('../../src/main/services/scanners/steam-scanner.service', () => ({
  findSteamPath: vi.fn(async () => steamMockState.steamPath),
  getAccountDirs: vi.fn(async () => steamMockState.accountDirs)
}));

type Db = typeof import('../../src/main/database/db')['db'];
type SteamCollectionsMod = typeof import('../../src/main/services/library/steam-collections.service');

let db: Db;
let parseSteamCloudStorage: SteamCollectionsMod['parseSteamCloudStorage'];
let importSteamCollections: SteamCollectionsMod['importSteamCollections'];
let userDataDir: string;

const makeStorageEntry = (key: string, value: Record<string, unknown>, extra: Record<string, unknown> = {}) => [
  key,
  {
    key,
    timestamp: 1700000000,
    value: JSON.stringify(value),
    version: '1',
    ...extra
  }
];

function writeCloudStorage(accountDir: string, entries: unknown[]): void {
  const dir = join(accountDir, 'config', 'cloudstorage');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cloud-storage-namespace-1.json'), JSON.stringify(entries), 'utf-8');
}

beforeEach(async () => {
  vi.resetModules();
  userDataDir = useTempUserData();
  steamMockState.steamPath = undefined;
  steamMockState.accountDirs = [];
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  ({ parseSteamCloudStorage, importSteamCollections } = await import('../../src/main/services/library/steam-collections.service'));
});

describe('parseSteamCloudStorage', () => {
  it('interpreta coleções válidas, favoritos, ocultos, dinâmicas e ignora apagadas ou corrompidas', () => {
    const raw = [
      ['other-key.1', { value: '{}' }],
      ['user-collections.deleted', { is_deleted: true, value: JSON.stringify({ id: 'deleted', name: 'Apagada', added: [10] }) }],
      ['user-collections.broken', { value: '{not-json' }],
      makeStorageEntry('user-collections.favorite', { id: 'favorite', added: [620, '440'], removed: [440] }),
      makeStorageEntry('user-collections.hidden', { id: 'hidden', added: [100] }),
      makeStorageEntry('user-collections.uc-rpg', { id: 'uc-rpg', name: 'RPGs   Bons', added: [220, 320, 420], removed: ['320'] }),
      makeStorageEntry('user-collections.uc-dyn', { id: 'uc-dyn', name: 'Steam Dinâmica', added: [], filterSpec: { nFormatVersion: 2 } })
    ];

    const parsed = parseSteamCloudStorage(raw);
    expect(parsed).toEqual([
      {
        key: 'user-collections.favorite',
        id: 'favorite',
        name: 'Favoritos',
        steamAppIds: ['620'],
        isFavorite: true,
        isHidden: false,
        isDynamic: false
      },
      {
        key: 'user-collections.hidden',
        id: 'hidden',
        name: 'Ocultos',
        steamAppIds: ['100'],
        isFavorite: false,
        isHidden: true,
        isDynamic: false
      },
      {
        key: 'user-collections.uc-rpg',
        id: 'uc-rpg',
        name: 'RPGs Bons',
        steamAppIds: ['220', '420'],
        isFavorite: false,
        isHidden: false,
        isDynamic: false
      },
      {
        key: 'user-collections.uc-dyn',
        id: 'uc-dyn',
        name: 'Steam Dinâmica',
        steamAppIds: [],
        isFavorite: false,
        isHidden: false,
        isDynamic: true
      }
    ]);
  });
});

describe('importSteamCollections', () => {
  it('falha com mensagem clara quando a Steam ou o cloudstorage não existe neste PC', async () => {
    await expect(importSteamCollections()).rejects.toThrow('Pasta da Steam não encontrada');

    steamMockState.steamPath = join(userDataDir, 'steam');
    steamMockState.accountDirs = [join(userDataDir, 'steam', 'userdata', '111')];
    await expect(importSteamCollections()).rejects.toThrow('Nenhuma coleção da Steam');
  });

  it('promove favoritos, mescla categorias manuais, protege dinâmicas existentes e contabiliza ignoradas', async () => {
    db.upsertGames([
      makeGame({ id: 'steam_620', title: 'Portal 2', platform: 'steam', platformGameId: '620', isFavorite: false }),
      makeGame({ id: 'steam_440', title: 'TF2', platform: 'steam', platformGameId: '440', isFavorite: true }),
      makeGame({ id: 'steam_220', title: 'Half-Life 2', platform: 'steam', platformGameId: '220' }),
      makeGame({ id: 'steam_10', title: 'Counter-Strike', platform: 'steam', platformGameId: '10' })
    ]);

    const { createCategory } = await import('../../src/main/services/library/categories.service');
    createCategory('Ação', ['steam_10']);
    createCategory('Coop', undefined, { genres: ['Ação'] });

    const account1 = join(userDataDir, 'steam', 'userdata', '111');
    const account2 = join(userDataDir, 'steam', 'userdata', '222');
    steamMockState.steamPath = join(userDataDir, 'steam');
    steamMockState.accountDirs = [account1, account2];

    writeCloudStorage(account2, [
      makeStorageEntry('user-collections.favorite', { id: 'favorite', added: [620, 440] }),
      makeStorageEntry('user-collections.hidden', { id: 'hidden', added: [10] }),
      makeStorageEntry('user-collections.uc-acao', { id: 'uc-acao', name: 'acao', added: [10, 220] }),
      makeStorageEntry('user-collections.uc-coop', { id: 'uc-coop', name: 'Coop', added: [620] }),
      makeStorageEntry('user-collections.uc-nova', { id: 'uc-nova', name: 'Zerar depois', added: [620, 999999] }),
      makeStorageEntry('user-collections.uc-vazia', { id: 'uc-vazia', name: 'Sem jogos no PC', added: [888888] }),
      makeStorageEntry('user-collections.uc-din', { id: 'uc-din', name: 'Filtro Steam', added: [], filterSpec: { nFormatVersion: 2 } })
    ]);

    const { result, updatedGames } = await importSteamCollections();
    expect(updatedGames.map((g) => g.id)).toEqual(['steam_620']);
    expect(db.getGameById('steam_620')?.isFavorite).toBe(true);

    expect(result).toMatchObject({
      created: 2,
      merged: 1,
      linksAdded: 3,
      favoritesAdded: 1,
      skippedDynamic: 1,
      skippedEmpty: 1
    });

    const saved = db.getGameCategories();
    expect(saved.find((c) => c.name === 'Ação')?.gameIds).toEqual(['steam_10', 'steam_220']);
    expect(saved.find((c) => c.name === 'Coop')?.rule).toEqual({ genres: ['Ação'] });
    expect(saved.find((c) => c.name === 'Coop (Steam)')?.gameIds).toEqual(['steam_620']);
    expect(saved.find((c) => c.name === 'Zerar depois')?.gameIds).toEqual(['steam_620']);
  });

  it('quando há múltiplas contas locais, prioriza o cloudstorage alterado mais recentemente', async () => {
    db.upsertGames([
      makeGame({ id: 'steam_620', title: 'Portal 2', platform: 'steam', platformGameId: '620' }),
      makeGame({ id: 'steam_220', title: 'Half-Life 2', platform: 'steam', platformGameId: '220' })
    ]);

    const olderAccount = join(userDataDir, 'steam', 'userdata', '111');
    const newerAccount = join(userDataDir, 'steam', 'userdata', '222');
    steamMockState.steamPath = join(userDataDir, 'steam');
    steamMockState.accountDirs = [olderAccount, newerAccount];

    writeCloudStorage(olderAccount, [makeStorageEntry('user-collections.uc-old', { id: 'uc-old', name: 'Conta Antiga', added: [220] })]);
    writeCloudStorage(newerAccount, [makeStorageEntry('user-collections.uc-new', { id: 'uc-new', name: 'Conta Atual', added: [620] })]);

    const oldFile = join(olderAccount, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json');
    const newFile = join(newerAccount, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json');
    utimesSync(oldFile, new Date('2025-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'));
    utimesSync(newFile, new Date('2026-11-13T00:00:00Z'), new Date('2026-11-13T00:00:00Z'));

    const { result } = await importSteamCollections();
    expect(result.categories.map((c) => c.name)).toEqual(['Conta Atual']);
  });
});
