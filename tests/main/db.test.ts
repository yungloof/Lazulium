import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { DatabaseService } from '../../src/main/database/db';
import { fake, useTempUserData } from '../helpers/electron-mock';
import { achievementsFile, dbFile, makeAchievements, makeGame, readJson, settle, storageDir, writeDbFile } from '../helpers/fixtures';

async function openDb(): Promise<DatabaseService> {
  const db = new DatabaseService();
  await db.init();
  return db;
}

const decode = (stored: string) => Buffer.from(stored.slice('enc:'.length), 'base64').toString('utf-8');

describe('banco: abrir e gravar', () => {
  it('primeira execução cria o arquivo com um banco vazio', async () => {
    const dir = useTempUserData();
    const db = await openDb();
    expect(db.getGames()).toEqual([]);
    expect(readJson(dbFile(dir)).games).toEqual([]);
  });

  it('o que foi gravado volta ao abrir de novo', async () => {
    const dir = useTempUserData();
    const db = await openDb();
    db.upsertGame(makeGame({ id: 'steam-1', title: 'Hades', isFavorite: true }));
    db.setSetting('theme', 'azul');
    db.flush();

    const reopened = await openDb();
    expect(reopened.getGameById('steam-1')?.title).toBe('Hades');
    expect(reopened.getSettings().theme).toBe('azul');
    expect(existsSync(dbFile(dir))).toBe(true);
  });

  it('arquivo corrompido é guardado à parte e a cópia diária mais recente assume', async () => {
    const dir = useTempUserData();
    const backups = join(storageDir(dir), 'backups');
    mkdirSync(backups, { recursive: true });
    writeFileSync(join(backups, 'lazulium_db-2026-11-10.json'), JSON.stringify({ games: [makeGame({ id: 'antigo' })], settings: {} }));
    writeFileSync(join(backups, 'lazulium_db-2026-11-11.json'), JSON.stringify({ games: [makeGame({ id: 'recente' })], settings: {} }));
    writeFileSync(dbFile(dir), '{"games": [ isto não é json');

    const db = await openDb();
    expect(db.getGames().map((g) => g.id)).toEqual(['recente']);
    expect(readdirSync(storageDir(dir)).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('arquivo sumido com cópias guardadas volta da cópia, não começa do zero', async () => {
    const dir = useTempUserData();
    const backups = join(storageDir(dir), 'backups');
    mkdirSync(backups, { recursive: true });
    writeFileSync(join(backups, 'lazulium_db-2026-11-11.json'), JSON.stringify({ games: [makeGame({ id: 'salvo' })], settings: {} }));

    const db = await openDb();
    expect(db.getGames().map((g) => g.id)).toEqual(['salvo']);
  });
});

describe('banco: conquistas em arquivo próprio', () => {
  it('banco antigo: as conquistas saem do arquivo principal e nada se perde', async () => {
    const dir = useTempUserData();
    writeDbFile(dir, { games: [makeGame({ id: 'steam-1' })], gameAchievements: { 'steam-1': makeAchievements('steam-1') } });

    const db = await openDb();
    expect(db.getGameAchievements('steam-1')?.unlocked).toBe(1);
    db.flush();

    expect(readJson(dbFile(dir)).gameAchievements).toBeUndefined();
    expect(readJson(achievementsFile(dir)).gameAchievements['steam-1'].unlocked).toBe(1);
    // A cópia diária feita antes da troca ainda tem o banco inteiro
    const [backup] = readdirSync(join(storageDir(dir), 'backups'));
    expect(readJson(join(storageDir(dir), 'backups', backup)).gameAchievements['steam-1']).toBeDefined();

    const reopened = await openDb();
    expect(reopened.getGameAchievements('steam-1')?.unlocked).toBe(1);
    expect(reopened.getGameById('steam-1')).not.toBeNull();
  });

  it('sincronizar conquistas não regrava o arquivo principal', async () => {
    const dir = useTempUserData();
    const db = await openDb();
    db.upsertGame(makeGame({ id: 'steam-1' }));
    db.flush();
    unlinkSync(dbFile(dir));

    db.saveGameAchievements(makeAchievements('steam-1', 2));
    db.flush();

    expect(existsSync(dbFile(dir))).toBe(false);
    expect(readJson(achievementsFile(dir)).gameAchievements['steam-1'].unlocked).toBe(2);
  });

  it('mudar a biblioteca não regrava o arquivo de conquistas', async () => {
    const dir = useTempUserData();
    const db = await openDb();
    db.saveGameAchievements(makeAchievements('steam-1'));
    db.flush();
    unlinkSync(achievementsFile(dir));

    db.upsertGame(makeGame({ id: 'steam-2' }));
    db.flush();

    expect(existsSync(achievementsFile(dir))).toBe(false);
    expect(readJson(dbFile(dir)).games).toHaveLength(1);
  });

  it('com os dois lugares preenchidos, o arquivo próprio vence e o que só existe no principal é mantido', async () => {
    const dir = useTempUserData();
    writeDbFile(dir, { gameAchievements: { 'steam-1': makeAchievements('steam-1', 1), 'steam-2': makeAchievements('steam-2', 1) } });
    writeFileSync(achievementsFile(dir), JSON.stringify({ gameAchievements: { 'steam-1': makeAchievements('steam-1', 2) } }));

    const db = await openDb();
    expect(db.getGameAchievements('steam-1')?.unlocked).toBe(2);
    expect(db.getGameAchievements('steam-2')?.unlocked).toBe(1);
  });

  it('arquivo de conquistas ilegível não derruba a biblioteca', async () => {
    const dir = useTempUserData();
    writeDbFile(dir, { games: [makeGame({ id: 'steam-1' })] });
    writeFileSync(achievementsFile(dir), 'lixo');

    const db = await openDb();
    expect(db.getGames()).toHaveLength(1);
    expect(db.getGameAchievements('steam-1')).toBeNull();
    expect(readdirSync(storageDir(dir)).some((f) => f.startsWith('lazulium_achievements.json.corrupt-'))).toBe(true);
  });

  it('sair de uma conta limpa só as conquistas daquela fonte', async () => {
    useTempUserData();
    const db = await openDb();
    db.saveGameAchievementsBatch([makeAchievements('steam-1'), { ...makeAchievements('emu-1'), source: 'retroachievements' }]);
    db.clearGameAchievements('steam');
    db.flush();

    const reopened = await openDb();
    expect(reopened.getGameAchievements('steam-1')).toBeNull();
    expect(reopened.getGameAchievements('emu-1')).not.toBeNull();
  });
});

describe('banco: credenciais cifradas', () => {
  it('a credencial vai cifrada para o disco e volta ao abrir', async () => {
    const dir = useTempUserData();
    const db = await openDb();
    db.setSetting('socialToken', 'segredo-123');
    await settle();
    db.flush();

    const stored: string = readJson(dbFile(dir)).settings.socialToken;
    expect(stored.startsWith('enc:')).toBe(true);
    expect(readFileSync(dbFile(dir), 'utf-8')).not.toContain('segredo-123');
    expect((await openDb()).getSettings().socialToken).toBe('segredo-123');
  });

  it('gravação no mesmo instante da troca nunca deixa a credencial em texto puro', async () => {
    const dir = useTempUserData();
    const db = await openDb();
    db.setSetting('socialToken', 'segredo-123');
    db.flush(); // a cifragem ainda não terminou
    expect(readFileSync(dbFile(dir), 'utf-8')).not.toContain('segredo-123');

    await settle();
    db.flush();
    expect(decode(readJson(dbFile(dir)).settings.socialToken)).toContain('segredo-123');
  });

  it('credencial em texto puro de versão antiga é cifrada na gravação seguinte', async () => {
    const dir = useTempUserData();
    writeDbFile(dir, { settings: { steamWebApiKey: 'chave-antiga', theme: 'azul' } });

    const db = await openDb();
    expect(db.getSettings().steamWebApiKey).toBe('chave-antiga');
    await settle();
    db.flush();

    const settings = readJson(dbFile(dir)).settings;
    expect(settings.steamWebApiKey.startsWith('enc:')).toBe(true);
    expect(settings.theme).toBe('azul');
  });

  it('credencial que este PC não abre fica intacta no arquivo até a pessoa conectar de novo', async () => {
    const dir = useTempUserData();
    const first = await openDb();
    first.setSetting('socialToken', 'do-outro-pc');
    await settle();
    first.flush();
    const original: string = readJson(dbFile(dir)).settings.socialToken;

    fake.keyId = 'pc-2';
    const db = await openDb();
    expect(db.getSettings().socialToken).toBe('');
    db.setSetting('theme', 'claro');
    await settle();
    db.flush();
    expect(readJson(dbFile(dir)).settings.socialToken).toBe(original);

    db.setSetting('socialToken', 'conectou-de-novo');
    await settle();
    db.flush();
    expect(decode(readJson(dbFile(dir)).settings.socialToken)).toBe('cifrado-pc-2:conectou-de-novo');
  });

  it('chave do sistema trocada: a credencial é cifrada de novo com a atual', async () => {
    const dir = useTempUserData();
    const first = await openDb();
    first.setSetting('socialToken', 'segredo');
    await settle();
    first.flush();
    const before: string = readJson(dbFile(dir)).settings.socialToken;

    fake.staleKeys = true;
    const db = await openDb();
    expect(db.getSettings().socialToken).toBe('segredo');
    await settle();
    db.flush();
    // O dublê cifra igual; o que importa é que passou pela cifragem de novo e continua legível
    expect(readJson(dbFile(dir)).settings.socialToken).toBe(before);
    fake.staleKeys = false;
    expect((await openDb()).getSettings().socialToken).toBe('segredo');
  });

  it('sair da conta apaga a credencial do arquivo', async () => {
    const dir = useTempUserData();
    const db = await openDb();
    db.setSetting('socialToken', 'segredo');
    await settle();
    db.flush();
    db.setSetting('socialToken', '');
    db.flush();
    expect(readJson(dbFile(dir)).settings.socialToken).toBe('');
  });

  it('sem cifragem disponível, a credencial fica em texto puro como antes', async () => {
    const dir = useTempUserData();
    fake.encryptionAvailable = false;
    const db = await openDb();
    db.setSetting('socialToken', 'sem-cofre');
    await settle();
    db.flush();
    expect(readJson(dbFile(dir)).settings.socialToken).toBe('sem-cofre');
  });
});

describe('banco: jogo apagado ou que muda de id', () => {
  it('apagar um jogo o tira das categorias', async () => {
    useTempUserData();
    const db = await openDb();
    db.upsertGames([makeGame({ id: 'a' }), makeGame({ id: 'b' })]);
    db.setGameCategories([{ id: 'c1', name: 'Zelda', gameIds: ['a', 'b'], createdAt: '', updatedAt: '' }]);
    expect(db.deleteGame('a')).toBe(true);
    expect(db.getGameCategories()[0].gameIds).toEqual(['b']);
    expect(db.deleteGame('nao-existe')).toBe(false);
  });

  it('jogo com id novo leva sessões, conquistas, listas e categorias', async () => {
    useTempUserData();
    const db = await openDb();
    db.upsertGames([makeGame({ id: 'velho' }), makeGame({ id: 'novo' })]);
    db.addPlaytimeSession({ id: 's1', gameId: 'velho', startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T11:00:00Z', durationSeconds: 3600 });
    db.saveGameAchievements(makeAchievements('velho', 2));
    db.saveGameList({ id: 'l1', title: 'Lista', ranked: false, featured: false, gameIds: ['velho', 'novo'], createdAt: '', updatedAt: '' });
    db.setGameCategories([{ id: 'c1', name: 'Zelda', gameIds: ['velho'], createdAt: '', updatedAt: '' }]);

    db.moveGameData('velho', 'novo');

    expect(db.getGameById('velho')).toBeNull();
    expect(db.getPlaytimeSessions('novo')).toHaveLength(1);
    expect(db.getGameAchievements('novo')).toMatchObject({ gameId: 'novo', unlocked: 2 });
    expect(db.getGameAchievements('velho')).toBeNull();
    expect(db.getGameLists()[0].gameIds).toEqual(['novo']);
    expect(db.getGameCategories()[0].gameIds).toEqual(['novo']);
    expect(db.isGameOrganized('novo')).toBe(true);
  });
});
