import { describe, expect, it } from 'vitest';
import { buildOwnedEpicGame, epicLauncherUri, isPlayableGame, usableRecords } from '../../src/main/services/accounts/epic-library';
import { canInstallFromStore } from '../../src/shared/utils/install';

describe('biblioteca da conta da Epic', () => {
  it('fica com os registros que podem ser jogo, um por nome interno', () => {
    const records = usableRecords([
      { appName: 'Fortnite', namespace: 'fn', catalogItemId: 'a', sandboxType: 'PUBLIC' },
      { appName: 'fortnite', namespace: 'fn', catalogItemId: 'a2' }, // repetido (caixa diferente)
      { appName: 'UE_5.4', namespace: 'ue', catalogItemId: 'b' }, // pacote da Unreal
      { appName: 'Beta', namespace: 'x', catalogItemId: 'c', sandboxType: 'PRIVATE' }, // versão de teste
      { appName: 'SemCatalogo', namespace: 'y' },
      { namespace: 'z', catalogItemId: 'd' }
    ]);
    expect([...records.keys()]).toEqual(['fortnite']);
    expect(records.get('fortnite')?.catalogItemId).toBe('a');
  });

  it('só jogo de Windows de verdade: sem DLC, sem programa e sem jogo só de Mac', () => {
    expect(isPlayableGame({ title: 'GTA V', categories: [{ path: 'games' }, { path: 'games/edition/base' }], releaseInfo: [{ platform: ['Windows'] }] })).toBe(true);
    expect(isPlayableGame({ title: 'Sem dados de categoria' })).toBe(true);
    expect(isPlayableGame({ title: 'Pacote de skins', categories: [{ path: 'addons' }], mainGameItem: { id: 'x' } })).toBe(false);
    expect(isPlayableGame({ title: 'Unreal Engine', categories: [{ path: 'applications' }] })).toBe(false);
    expect(isPlayableGame({ title: 'Só Mac', categories: [{ path: 'games' }], releaseInfo: [{ platform: ['Mac'] }] })).toBe(false);
    expect(isPlayableGame({ title: '  ' })).toBe(false);
    expect(isPlayableGame(undefined)).toBe(false);
  });

  it('jogo da conta entra como não instalado, com horas, capa da loja e o endereço de instalar do launcher', () => {
    const game = buildOwnedEpicGame(
      { appName: '9d2d0eb64d5c44529cece33fe2a46482', namespace: '0584d2013f0149a791e7b9bad0eec102', catalogItemId: '6e563a2c0f5f46e3b4e88b5f4ed50cca' },
      {
        title: 'Grand Theft Auto V ',
        keyImages: [
          { type: 'DieselGameBoxTall', url: 'https://cdn1.epicgames.com/capa.jpg' },
          { type: 'DieselGameBox', url: 'https://cdn1.epicgames.com/larga.jpg' },
          { type: 'Thumbnail', url: 'http://inseguro.jpg' }
        ]
      },
      7200,
      '2026-11-14T00:00:00.000Z'
    );
    expect(game).toMatchObject({
      id: 'epic-9d2d0eb64d5c44529cece33fe2a46482',
      title: 'Grand Theft Auto V',
      platform: 'epic',
      platformGameId: '9d2d0eb64d5c44529cece33fe2a46482',
      isInstalled: false,
      totalPlaytimeSeconds: 7200,
      sourcePlaytimeSeconds: 7200,
      media: { coverUrl: 'https://cdn1.epicgames.com/capa.jpg', heroUrl: 'https://cdn1.epicgames.com/larga.jpg' }
    });
    expect(game.launchUri).toBe(
      'com.epicgames.launcher://apps/0584d2013f0149a791e7b9bad0eec102%3A6e563a2c0f5f46e3b4e88b5f4ed50cca%3A9d2d0eb64d5c44529cece33fe2a46482?action=install&silent=true'
    );
  });

  it('endereço do launcher sem namespace usa só o nome interno', () => {
    expect(epicLauncherUri(undefined, undefined, 'Fortnite', 'launch')).toBe('com.epicgames.launcher://apps/Fortnite?action=launch&silent=true');
  });
});

describe('instalar pela loja', () => {
  it('Steam e Epic instalam em um clique; outras plataformas e registros manuais não', () => {
    expect(canInstallFromStore({ platform: 'steam', isInstalled: false })).toBe(true);
    expect(canInstallFromStore({ platform: 'epic', isInstalled: false, launchUri: 'com.epicgames.launcher://apps/x?action=install' })).toBe(true);
    expect(canInstallFromStore({ platform: 'epic', isInstalled: false })).toBe(false); // sem endereço do launcher
    expect(canInstallFromStore({ platform: 'epic', isInstalled: true, launchUri: 'com.epicgames.launcher://apps/x' })).toBe(false);
    expect(canInstallFromStore({ platform: 'gog', isInstalled: false })).toBe(false);
    expect(canInstallFromStore({ platform: 'standalone', isInstalled: false, manualEntry: true })).toBe(false);
  });
});
