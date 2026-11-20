import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createStandaloneScanner } from '../../src/main/services/scanners/standalone-scanner.service';

// Pastas de verdade num temporário; os .exe são arquivos vazios (o scanner só olha nome e lugar)
let base: string;
let root: string;

function game(dir: string, exe: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, exe), '');
}

const scan = () => createStandaloneScanner(() => [root]).scan();

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'lazulium-soltos-'));
  root = join(base, 'Jogos');
  mkdirSync(root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('jogos soltos', () => {
  it('Pokémon Sword (PC Recomp): o executável SwShRecomp não vira o nome do jogo', async () => {
    game(join(root, 'Pokemon Sword'), 'SwShRecomp.exe');
    const { games } = await scan();
    expect(games).toHaveLength(1);
    expect(games[0].executablePath.toLowerCase()).toContain('swshrecomp.exe');
    expect(games[0].title).not.toMatch(/swsh/i);
    expect(games[0].title).toMatch(/Pokemon Sword/);
  });

  it('pasta de jogo que é um atalho de pasta (junction) também entra', async () => {
    const elsewhere = join(base, 'Outro disco', 'Celeste');
    game(elsewhere, 'Celeste.exe');
    symlinkSync(elsewhere, join(root, 'Celeste'), 'junction');
    const { games } = await scan();
    expect(games.map((g) => g.title)).toEqual(['Celeste']);
    expect(games[0].installPath).toBe(join(root, 'Celeste'));
  });

  it('atalho de pasta dentro do jogo também é olhado (até 2 níveis)', async () => {
    const binaries = join(base, 'Binarios do Hades');
    game(binaries, 'Hades.exe');
    mkdirSync(join(root, 'Hades'));
    symlinkSync(binaries, join(root, 'Hades', 'x64'), 'junction');
    const { games } = await scan();
    expect(games).toHaveLength(1);
    expect(games[0].executablePath).toBe(join(root, 'Hades', 'x64', 'Hades.exe'));
  });

  it('atalho de pasta que aponta para a própria pasta não trava o Escanear', async () => {
    game(join(root, 'Loop'), 'Loop.exe');
    symlinkSync(join(root, 'Loop'), join(root, 'Loop', 'de novo'), 'junction');
    const { games, warnings } = await scan();
    expect(games).toHaveLength(1);
    expect(warnings).toEqual([]);
  });
});
