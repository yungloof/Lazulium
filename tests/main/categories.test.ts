import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';

type Db = typeof import('../../src/main/database/db')['db'];
type Service = typeof import('../../src/main/services/library/categories.service');

let db: Db;
let service: Service;

// O serviço usa o banco único do app: cada teste recarrega os módulos com uma pasta de dados nova
beforeEach(async () => {
  useTempUserData();
  vi.resetModules();
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  service = await import('../../src/main/services/library/categories.service');
  db.upsertGames([makeGame({ id: 'a' }), makeGame({ id: 'b' }), makeGame({ id: 'c' })]);
});

const names = () => db.getGameCategories().map((c) => c.name);

describe('categorias da biblioteca', () => {
  it('cria no fim da lista, com o nome limpo e só jogos que existem', () => {
    service.createCategory('  Zelda  ');
    const result = service.createCategory('Para   zerar', ['a', 'fantasma', 'a', 'b']);
    expect(names()).toEqual(['Zelda', 'Para zerar']);
    expect(result[1].gameIds).toEqual(['a', 'b']);
    expect(result[1].id).not.toBe(result[0].id);
  });

  it('recusa nome vazio e nome repetido (sem diferenciar maiúsculas e acentos)', () => {
    service.createCategory('Pokémon');
    expect(() => service.createCategory('   ')).toThrow('Dê um nome');
    expect(() => service.createCategory('POKEMON')).toThrow('Já existe');
    expect(names()).toEqual(['Pokémon']);
  });

  it('corta nomes longos demais', () => {
    const [category] = service.createCategory('x'.repeat(200));
    expect(category.name).toHaveLength(40);
  });

  it('renomeia, aceita mudar só a caixa e recusa o nome de outra', () => {
    const [zelda] = service.createCategory('zelda');
    service.createCategory('Multiplayer');
    service.renameCategory(zelda.id, 'Zelda');
    expect(names()).toEqual(['Zelda', 'Multiplayer']);
    expect(() => service.renameCategory(zelda.id, 'multiplayer')).toThrow('Já existe');
    expect(() => service.renameCategory('nao-existe', 'Outra')).toThrow('não encontrada');
  });

  it('põe e tira jogos sem repetir', () => {
    const [category] = service.createCategory('Zelda');
    service.setCategoryGames(category.id, ['a', 'b'], true);
    service.setCategoryGames(category.id, ['b', 'c', 'fantasma'], true);
    expect(db.getGameCategories()[0].gameIds).toEqual(['a', 'b', 'c']);
    service.setCategoryGames(category.id, ['a', 'c'], false);
    expect(db.getGameCategories()[0].gameIds).toEqual(['b']);
  });

  it('um jogo pode ficar em várias categorias', () => {
    const first = service.createCategory('Zelda', ['a'])[0];
    const second = service.createCategory('Nintendo', ['a'])[1];
    expect(db.getGameCategories().filter((c) => c.gameIds.includes('a')).map((c) => c.id)).toEqual([first.id, second.id]);
  });

  it('reordena, e quem não veio na lista fica no fim na ordem de antes', () => {
    service.createCategory('A');
    service.createCategory('B');
    service.createCategory('C');
    const [a, b, c] = db.getGameCategories();
    service.reorderCategories([c.id, a.id]);
    expect(names()).toEqual(['C', 'A', 'B']);
    service.reorderCategories([b.id, a.id, c.id]);
    expect(names()).toEqual(['B', 'A', 'C']);
  });

  it('apagar a categoria não apaga os jogos', () => {
    const [category] = service.createCategory('Zelda', ['a', 'b']);
    expect(service.deleteCategory(category.id)).toEqual([]);
    expect(db.getGames()).toHaveLength(3);
  });

  it('tudo sobrevive a fechar e abrir o app', async () => {
    service.createCategory('Zelda', ['a']);
    service.createCategory('Multiplayer', ['b', 'c']);
    db.flush();

    vi.resetModules();
    const reopened = (await import('../../src/main/database/db')).db;
    await reopened.init();
    expect(reopened.getGameCategories().map((c) => [c.name, c.gameIds])).toEqual([
      ['Zelda', ['a']],
      ['Multiplayer', ['b', 'c']]
    ]);
  });
});
