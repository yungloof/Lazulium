import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { egstoreAncestor, findEgstoreFolders, gameFromEgstoreFolder } from '../../src/main/services/scanners/epic-scanner.service';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lazulium-epic-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const gameFolder = (...parts: string[]) => {
  const dir = join(root, ...parts);
  mkdirSync(join(dir, '.egstore'), { recursive: true });
  return dir;
};
const farFuture = () => Date.now() + 10_000;

describe('jogos da Epic fora das pastas padrão', () => {
  it('acha a pasta do jogo (.egstore) em qualquer lugar até a profundidade pedida', async () => {
    const a = gameFolder('Jogos', 'Epic Games', 'Fortnite');
    const b = gameFolder('Outro', 'disco', 'Rocket League');
    gameFolder('a', 'b', 'c', 'Fundo Demais');
    const found = await findEgstoreFolders([{ path: root, depth: 3 }], farFuture());
    expect(found.sort()).toEqual([a, b].sort());
  });

  it('não entra em pastas do sistema nem em bibliotecas da Steam', async () => {
    gameFolder('Windows', 'Jogo');
    gameFolder('steamapps', 'common', 'Jogo');
    gameFolder('ProgramData', 'Jogo');
    const certo = gameFolder('Jogos', 'Hades');
    expect(await findEgstoreFolders([{ path: root, depth: 3 }], farFuture())).toEqual([certo]);
  });

  it('para a busca no limite de pastas e não repete a mesma pasta de duas raízes', async () => {
    const dir = gameFolder('Jogos', 'Celeste');
    const found = await findEgstoreFolders([{ path: root, depth: 3 }, { path: join(root, 'Jogos'), depth: 1 }], farFuture());
    expect(found).toEqual([dir]);
    expect(await findEgstoreFolders([{ path: root, depth: 3 }], farFuture(), 1)).toEqual([]);
  });

  it('lê o AppName do .mancpn e abre pelo executável quando o launcher não conhece a instalação', async () => {
    const dir = gameFolder('Jogos', 'MeuJogo');
    writeFileSync(join(dir, '.egstore', 'ABC.mancpn'), JSON.stringify({ FormatVersion: 0, AppName: 'Sugar', CatalogItemId: 'item1', CatalogNamespace: 'ns1' }));
    writeFileSync(join(dir, '.egstore', 'ABC.item'), JSON.stringify({ DisplayName: 'Meu Jogo', LaunchExecutable: 'Game.exe' }));
    writeFileSync(join(dir, 'Game.exe'), '');
    const game = (await gameFromEgstoreFolder(dir))!;
    expect(game).toMatchObject({ id: 'epic-Sugar', platform: 'epic', platformGameId: 'Sugar', title: 'Meu Jogo', executablePath: join(dir, 'Game.exe') });
    expect(game.launchUri).toBeUndefined();
  });

  it('sem executável, cai no endereço do launcher da Epic com os ids do catálogo', async () => {
    const dir = gameFolder('Jogos', 'SemExe');
    writeFileSync(join(dir, '.egstore', 'X.mancpn'), JSON.stringify({ AppName: 'Foo', CatalogItemId: 'i', CatalogNamespace: 'n' }));
    const game = (await gameFromEgstoreFolder(dir))!;
    expect(game).toMatchObject({ id: 'epic-Foo', title: 'SemExe' });
    expect(game.launchUri).toBe('com.epicgames.launcher://apps/n%3Ai%3AFoo?action=launch&silent=true');
  });

  it('a pasta do jogo sai do executável que a pessoa já adicionou, mesmo bem no fundo', () => {
    const dir = gameFolder('Jogos', 'Fortnite');
    const exe = join(dir, 'FortniteGame', 'Binaries', 'Win64', 'FortniteClient-Win64-Shipping.exe');
    mkdirSync(join(dir, 'FortniteGame', 'Binaries', 'Win64'), { recursive: true });
    writeFileSync(exe, '');
    expect(egstoreAncestor(exe)).toBe(dir);
    expect(egstoreAncestor(join(root, 'Jogos', 'Sem Epic', 'a.exe'))).toBeUndefined();
  });

  it('sem nenhum manifesto, usa o nome da pasta como id', async () => {
    const dir = gameFolder('Jogos', 'Pasta Solta');
    const game = (await gameFromEgstoreFolder(dir))!;
    expect(game).toMatchObject({ id: 'epic-Pasta Solta', title: 'Pasta Solta', platformGameId: 'Pasta Solta' });
  });
});
