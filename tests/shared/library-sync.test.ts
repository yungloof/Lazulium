import { describe, expect, it } from 'vitest';
import { Game } from '@shared/types/game';
import { GameList } from '@shared/types/lists';
import { GameCategory } from '@shared/types/categories';
import { SYNC_SCHEMA, SyncTombstones, SyncUnresolved } from '@shared/types/sync';
import {
  applySyncSnapshot,
  buildSyncSnapshot,
  gameSyncKey,
  mergeSyncSnapshots
} from '../../src/shared/utils/library-sync';

interface FakeDbState {
  games: Game[];
  gameLists: GameList[];
  gameCategories: GameCategory[];
  categoriesOrderUpdatedAt?: string;
  syncTombstones: SyncTombstones;
  syncUnresolved: SyncUnresolved;
}

const makeGame = (overrides: Partial<Game> & { id: string; title: string }): Game => ({
  platform: 'steam',
  executablePath: '',
  media: {},
  isFavorite: false,
  isHidden: false,
  tags: [],
  totalPlaytimeSeconds: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

const emptyState = (overrides: Partial<FakeDbState> = {}): FakeDbState => ({
  games: [],
  gameLists: [],
  gameCategories: [],
  syncTombstones: {},
  syncUnresolved: {},
  ...overrides
});

const syncTwoStates = (pcA: FakeDbState, pcB: FakeDbState, now = '2026-11-15T12:00:00.000Z') => {
  const snapA = buildSyncSnapshot(pcA, now);
  const snapB = buildSyncSnapshot(pcB, now);
  const res = mergeSyncSnapshots(snapA, snapB, now);
  return {
    snapA,
    snapB,
    merged: res.merged,
    nextA: applySyncSnapshot(pcA, res.merged, now),
    nextB: applySyncSnapshot(pcB, res.merged, now)
  };
};

describe('sincronização entre PCs (Diário, listas, categorias e favoritos)', () => {
  it('mescla edições simultâneas em PCs diferentes item a item sem perder mudanças', () => {
    const pcA = emptyState({
      games: [
        makeGame({
          id: 'steam-620',
          platformGameId: '620',
          title: 'Portal 2',
          isFavorite: true,
          favoriteUpdatedAt: '2026-11-10T10:05:00.000Z',
          log: { status: 'finished', rating: 4, review: 'Antiga' },
          logUpdatedAt: '2026-11-10T09:00:00.000Z'
        }),
        makeGame({
          id: 'steam-367520',
          platformGameId: '367520',
          title: 'Hollow Knight',
          log: { status: 'playing', notes: 'Pegar as asas primeiro' },
          logUpdatedAt: '2026-11-10T10:02:00.000Z'
        })
      ]
    });

    const pcB = emptyState({
      games: [
        makeGame({
          id: 'steam-620',
          platformGameId: '620',
          title: 'Portal 2',
          isFavorite: false,
          favoriteUpdatedAt: '2026-11-10T09:00:00.000Z',
          log: { status: 'completed', rating: 5, review: 'Nova resenha no notebook', notes: 'Anotação secreta' },
          logUpdatedAt: '2026-11-10T10:10:00.000Z'
        }),
        makeGame({
          id: 'steam-367520',
          platformGameId: '367520',
          title: 'Hollow Knight',
          isFavorite: true,
          favoriteUpdatedAt: '2026-11-10T10:03:00.000Z'
        })
      ]
    });

    const { nextA, nextB } = syncTwoStates(pcA, pcB);

    // Portal 2: favorito mais novo veio de A (10:05), Diário mais novo (com anotações) veio de B (10:10)
    const portalA = nextA.games.find((g) => g.id === 'steam-620')!;
    const portalB = nextB.games.find((g) => g.id === 'steam-620')!;
    expect(portalA.isFavorite).toBe(true);
    expect(portalA.log?.rating).toBe(5);
    expect(portalA.log?.review).toBe('Nova resenha no notebook');
    expect(portalA.log?.notes).toBe('Anotação secreta');
    expect(portalB.isFavorite).toBe(true);
    expect(portalB.log?.rating).toBe(5);

    // Hollow Knight: Diário veio de A, favorito veio de B
    const hkA = nextA.games.find((g) => g.id === 'steam-367520')!;
    const hkB = nextB.games.find((g) => g.id === 'steam-367520')!;
    expect(hkA.isFavorite).toBe(true);
    expect(hkA.log?.notes).toBe('Pegar as asas primeiro');
    expect(hkB.isFavorite).toBe(true);
    expect(hkB.log?.status).toBe('playing');
  });

  it('usa marca de exclusão (tombstone) para não ressuscitar lista, categoria ou jogo manual apagado', () => {
    const listDelId = '11111111-1111-4111-8111-111111111111';
    const catKeepId = '22222222-2222-4222-8222-222222222222';
    const manualId = 'log-33333333-3333-4333-8333-333333333333';

    // PC A apagou a lista às 10:05, apagou o jogo manual às 10:06, e renomeou a categoria às 10:10
    const pcA = emptyState({
      games: [makeGame({ id: 'steam-620', platformGameId: '620', title: 'Portal 2' })],
      gameLists: [],
      gameCategories: [
        {
          id: catKeepId,
          name: 'Favoritos Atualizados',
          gameIds: ['steam-620'],
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-10T10:10:00.000Z'
        }
      ],
      syncTombstones: {
        lists: { [listDelId]: '2026-11-10T10:05:00.000Z' },
        manualGames: { 't:jogops5': '2026-11-10T10:06:00.000Z' }
      }
    });

    // PC B ainda tinha a lista (10:00) e o jogo manual (10:00), mas tinha apagado a categoria antes (10:04 < 10:10)
    const pcB = emptyState({
      games: [
        makeGame({ id: 'steam-620', platformGameId: '620', title: 'Portal 2' }),
        makeGame({
          id: manualId,
          platform: 'standalone',
          manualEntry: true,
          manualPlatform: 'PS5',
          title: 'Jogo PS5',
          log: { status: 'finished' },
          logUpdatedAt: '2026-11-10T10:00:00.000Z'
        })
      ],
      gameLists: [
        {
          id: listDelId,
          title: 'Lista velha',
          ranked: false,
          featured: false,
          gameIds: ['steam-620'],
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-10T10:00:00.000Z'
        }
      ],
      gameCategories: [],
      syncTombstones: {
        categories: { [catKeepId]: '2026-11-10T10:04:00.000Z' }
      }
    });

    const { nextA, nextB } = syncTwoStates(pcA, pcB);

    // Lista apagada em A (10:05 > 10:00) some de B e não ressuscita em A
    expect(nextA.gameLists).toHaveLength(0);
    expect(nextB.gameLists).toHaveLength(0);
    expect(nextB.syncTombstones.lists?.[listDelId]).toBe('2026-11-10T10:05:00.000Z');

    // Jogo manual apagado em A (10:06 > 10:00) some de B e não ressuscita
    expect(nextA.games.some((g) => g.manualEntry)).toBe(false);
    expect(nextB.games.some((g) => g.manualEntry)).toBe(false);

    // Categoria editada em A depois de apagada em B (10:10 > 10:04) vence e volta em B
    expect(nextA.gameCategories).toHaveLength(1);
    expect(nextB.gameCategories).toHaveLength(1);
    expect(nextB.gameCategories[0].name).toBe('Favoritos Atualizados');
    expect(nextB.gameCategories[0].gameIds).toEqual(['steam-620']);
  });

  it('casa jogos avulsos, emuladores e lojas diferentes entre PCs pelo titleKey / steamKey e preserva jogos exclusivos de um PC', () => {
    const listId = '44444444-4444-4444-8444-444444444444';
    const tierListId = '55555555-5555-4555-8555-555555555555';

    const pcA = emptyState({
      games: [
        makeGame({
          id: 'emu-dolphin-zelda-pc1',
          platform: 'emulator',
          emulatorId: 'dolphin',
          title: 'The Legend of Zelda: Wind Waker',
          isFavorite: true,
          favoriteUpdatedAt: '2026-11-10T10:00:00.000Z',
          log: { status: 'finished', rating: 5 },
          logUpdatedAt: '2026-11-10T10:00:00.000Z'
        }),
        makeGame({
          id: 'epic-celeste-pc1',
          platform: 'epic',
          platformGameId: 'celeste-app',
          title: 'Celeste',
          log: { status: 'completed' },
          logUpdatedAt: '2026-11-10T10:00:00.000Z'
        }),
        makeGame({
          id: 'standalone-only-pc1',
          platform: 'standalone',
          title: 'Jogo Só Do Desktop',
          log: { status: 'playing', notes: 'Missão 4' },
          logUpdatedAt: '2026-11-10T10:00:00.000Z'
        }),
        makeGame({
          id: 'log-console-only',
          platform: 'standalone',
          manualEntry: true,
          manualPlatform: 'Switch',
          title: 'Metroid Dread',
          totalPlaytimeSeconds: 28800,
          log: { status: 'finished', finishedOn: '2026-11-05' },
          logUpdatedAt: '2026-11-10T10:00:00.000Z'
        })
      ],
      gameLists: [
        {
          id: listId,
          title: 'Zerar nas férias',
          ranked: true,
          featured: true,
          gameIds: ['emu-dolphin-zelda-pc1', 'standalone-only-pc1'],
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-10T10:00:00.000Z'
        },
        {
          id: tierListId,
          title: 'Tier Nintendo',
          ranked: false,
          featured: false,
          gameIds: ['emu-dolphin-zelda-pc1', 'log-console-only'],
          tiers: [
            { id: 't-s', label: 'S', color: '#f87171', gameIds: ['emu-dolphin-zelda-pc1'] },
            { id: 't-a', label: 'A', color: '#fb923c', gameIds: ['log-console-only'] }
          ],
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-10T10:00:00.000Z'
        }
      ]
    });

    // PC B tem outro id local de emulador, Celeste pela Steam, NÃO tem 'Jogo Só Do Desktop', e não tinha 'Metroid Dread'
    const pcB = emptyState({
      games: [
        makeGame({
          id: 'emu-dolphin-other-id-pc2',
          platform: 'emulator',
          emulatorId: 'dolphin',
          title: 'The Legend of Zelda: Wind Waker'
        }),
        makeGame({
          id: 'steam-504230',
          platform: 'steam',
          platformGameId: '504230',
          title: 'Celeste'
        })
      ]
    });

    const { nextB } = syncTwoStates(pcA, pcB);

    // Emulador casou pelo titleKey apesar de ids locais diferentes
    const zeldaB = nextB.games.find((g) => g.id === 'emu-dolphin-other-id-pc2')!;
    expect(zeldaB.isFavorite).toBe(true);
    expect(zeldaB.log?.rating).toBe(5);

    // Celeste casou entre Epic (A) e Steam (B) pelo titleKey
    const celesteB = nextB.games.find((g) => g.id === 'steam-504230')!;
    expect(celesteB.log?.status).toBe('completed');

    // Jogo manual de console foi criado automaticamente em B
    const metroidB = nextB.games.find((g) => g.manualEntry && g.title === 'Metroid Dread')!;
    expect(metroidB).toBeTruthy();
    expect(metroidB.manualPlatform).toBe('Switch');
    expect(metroidB.log?.finishedOn).toBe('2026-11-05');

    // Jogo exclusivo não-manual de A ('Jogo Só Do Desktop') NÃO vira jogo fantasma em B, mas fica guardado para não sumir
    expect(nextB.games.some((g) => g.title === 'Jogo Só Do Desktop')).toBe(false);
    expect(Object.keys(nextB.syncUnresolved.games ?? {})).toContain('t:jogosododesktop');

    // Listas em B resolvem os jogos que B tem e guardam o de A sem apagar!
    const listB = nextB.gameLists.find((l) => l.id === listId)!;
    expect(listB.gameIds).toEqual(['emu-dolphin-other-id-pc2']);

    const tierB = nextB.gameLists.find((l) => l.id === tierListId)!;
    expect(tierB.tiers?.[0].gameIds).toEqual(['emu-dolphin-other-id-pc2']);
    expect(tierB.tiers?.[1].gameIds).toEqual([metroidB.id]);

    // Se B editar a descrição da lista e sincronizar de volta com A, 'standalone-only-pc1' NÃO desaparece de A!
    const editedB: FakeDbState = {
      ...nextB,
      gameLists: nextB.gameLists.map((l) =>
        l.id === listId ? { ...l, description: 'Editada no notebook', updatedAt: '2026-11-11T10:00:00.000Z' } : l
      )
    };
    const roundTrip = syncTwoStates(pcA, editedB);
    const listAfterA = roundTrip.nextA.gameLists.find((l) => l.id === listId)!;
    expect(listAfterA.description).toBe('Editada no notebook');
    expect(listAfterA.gameIds).toEqual(['emu-dolphin-zelda-pc1', 'standalone-only-pc1']);
    expect(roundTrip.nextA.games.find((g) => g.id === 'standalone-only-pc1')?.log?.notes).toBe('Missão 4');
  });

  it('mescla bancos antigos sem timestamp explícito sem jogar fora dados existentes e respeita schema', () => {
    const pcA = emptyState({
      games: [
        makeGame({ id: 'steam-10', platformGameId: '10', title: 'CS', log: { rating: 4 } })
      ],
      gameCategories: [
        {
          id: 'cat-a',
          name: 'Indies',
          gameIds: ['steam-10'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z'
        }
      ]
    });
    const pcB = emptyState({
      games: [
        makeGame({ id: 'steam-10', platformGameId: '10', title: 'CS', isFavorite: true, log: { notes: 'Server antigo' } })
      ],
      gameCategories: [
        {
          id: 'cat-b',
          name: 'indies',
          gameIds: [],
          createdAt: '2026-10-02T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z'
        }
      ]
    });

    const { snapA, merged, nextA, nextB } = syncTwoStates(pcA, pcB);
    expect(snapA.schema).toBe(SYNC_SCHEMA);
    expect(merged.schema).toBe(SYNC_SCHEMA);
    expect(gameSyncKey(pcA.games[0])).toBe('steam:10');

    const csA = nextA.games[0];
    const csB = nextB.games[0];
    expect(csA.isFavorite).toBe(true);
    expect(csA.log?.rating).toBe(4);
    expect(csA.log?.notes).toBe('Server antigo');
    expect(csB.log?.rating).toBe(4);

    // Duas categorias independentes com mesmo nome ('Indies' vs 'indies') colapsam em uma só preservando os jogos
    expect(nextA.gameCategories).toHaveLength(1);
    expect(nextB.gameCategories).toHaveLength(1);
    expect(nextB.gameCategories[0].gameIds).toEqual(['steam-10']);
  });

  it('sincroniza ordem de categorias, limpeza intencional do Diário e evita gravação quando já está igual', () => {
    const cat1 = {
      id: 'cat-1',
      name: 'RPG',
      gameIds: [],
      rule: { genres: ['RPG'] },
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z'
    };
    const cat2 = {
      id: 'cat-2',
      name: 'Zerar',
      gameIds: ['steam-620'],
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z'
    };

    const pcA = emptyState({
      games: [
        makeGame({
          id: 'steam-620',
          platformGameId: '620',
          title: 'Portal 2',
          log: { status: 'finished', rating: 5 },
          logUpdatedAt: '2026-11-10T10:00:00.000Z'
        })
      ],
      gameCategories: [cat1, cat2],
      categoriesOrderUpdatedAt: '2026-11-10T09:00:00.000Z'
    });

    const pcB = emptyState({
      games: [
        makeGame({
          id: 'steam-620',
          platformGameId: '620',
          title: 'Portal 2',
          log: {},
          logUpdatedAt: '2026-11-10T10:20:00.000Z'
        })
      ],
      gameCategories: [cat2, cat1],
      categoriesOrderUpdatedAt: '2026-11-10T10:15:00.000Z'
    });

    const { nextA, nextB } = syncTwoStates(pcA, pcB);
    expect(nextA.gameCategories.map((c) => c.id)).toEqual(['cat-2', 'cat-1']);
    expect(nextB.gameCategories.map((c) => c.id)).toEqual(['cat-2', 'cat-1']);
    expect(nextA.games[0].log?.status).toBeUndefined();
    expect(nextA.games[0].log?.rating).toBeUndefined();

    // Segunda sincronização idêntica não reporta mudanças em nenhum lado
    const second = mergeSyncSnapshots(buildSyncSnapshot(nextA), buildSyncSnapshot(nextB));
    expect(second.changedLocal).toBe(false);
    expect(second.changedRemote).toBe(false);
  });
});

describe('registro do Diário de antes da sincronização', () => {
  const NOW = '2026-11-15T12:00:00.000Z';
  const portal = (log: Game['log'], logUpdatedAt?: string) =>
    makeGame({ id: 'steam-620', title: 'Portal 2', platformGameId: '620', log, ...(logUpdatedAt ? { logUpdatedAt } : {}) });

  it('a resenha que só existe no PC antigo não some quando o outro PC só deu nota depois', () => {
    const pc1 = emptyState({ games: [portal({ rating: 4 }, '2026-11-15T10:00:00.000Z')] });
    const pc2 = emptyState({ games: [portal({ review: 'Texto que só existe no PC2', status: 'completed' })] });

    // PC2 liga a sincronização depois do PC1
    const atPc2 = mergeSyncSnapshots(buildSyncSnapshot(pc2, NOW), buildSyncSnapshot(pc1, NOW), NOW);
    const applied2 = applySyncSnapshot(pc2, atPc2.merged, NOW);
    expect(applied2.games[0].log).toEqual({ rating: 4, review: 'Texto que só existe no PC2', status: 'completed' });
    // A junção ganha data nova, para o PC1 receber a resenha também
    expect(applied2.games[0].logUpdatedAt).toBe(NOW);
    expect(atPc2.changedRemote).toBe(true);

    const atPc1 = mergeSyncSnapshots(buildSyncSnapshot(pc1, NOW), atPc2.merged, NOW);
    const applied1 = applySyncSnapshot(pc1, atPc1.merged, NOW);
    expect(applied1.games[0].log).toEqual(applied2.games[0].log);

    // Depois disso os dois ficam iguais e param de mandar
    const again = mergeSyncSnapshots(buildSyncSnapshot({ ...pc1, ...applied1 }, NOW), atPc2.merged, NOW);
    expect(again.changedLocal).toBe(false);
    expect(again.changedRemote).toBe(false);
  });

  it('no conflito de campo, vale o registro com data', () => {
    const pc1 = emptyState({ games: [portal({ rating: 5, review: 'Nova' }, '2026-11-15T10:00:00.000Z')] });
    const pc2 = emptyState({ games: [portal({ rating: 2, review: 'Velha', notes: 'só no PC2' })] });
    const { merged } = mergeSyncSnapshots(buildSyncSnapshot(pc2, NOW), buildSyncSnapshot(pc1, NOW), NOW);
    expect(applySyncSnapshot(pc2, merged, NOW).games[0].log).toEqual({ rating: 5, review: 'Nova', notes: 'só no PC2' });
  });

  it('o PC antigo sem nada a acrescentar não muda a data de quem editou', () => {
    const pc1 = emptyState({ games: [portal({ rating: 4, review: 'Igual' }, '2026-11-15T10:00:00.000Z')] });
    const pc2 = emptyState({ games: [portal({ review: 'Igual' })] });
    const { merged } = mergeSyncSnapshots(buildSyncSnapshot(pc2, NOW), buildSyncSnapshot(pc1, NOW), NOW);
    expect(merged.games[0].logUpdatedAt).toBe('2026-11-15T10:00:00.000Z');
  });
});
