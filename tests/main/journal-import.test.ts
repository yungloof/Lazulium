import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalImportItem } from '../../src/shared/types/journal-import';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';

type Db = typeof import('../../src/main/database/db')['db'];
type Service = typeof import('../../src/main/services/profile/journal-import.service');

let db: Db;
let service: Service;

beforeEach(async () => {
  useTempUserData();
  vi.resetModules();
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  service = await import('../../src/main/services/profile/journal-import.service');
  db.upsertGames([
    makeGame({ id: 'steam-1', title: 'Cyberpunk 2077', platformGameId: '1091500' }),
    makeGame({ id: 'steam-2', title: 'Hades', platformGameId: '1145360', log: { status: 'playing', rating: 3 } }),
    makeGame({ id: 'epic-1', title: 'Skate.', platform: 'epic' })
  ]);
});

const item = (title: string, log: JournalImportItem['log'], extra: Partial<JournalImportItem> = {}): JournalImportItem => ({ key: `t:${title}`, title, log, ...extra });
const keep = { replaceExisting: false };
const replace = { replaceExisting: true };

describe('importação para o Diário', () => {
  it('casa pelo nome (sem diferenciar caixa, acento ou pontuação) e preenche o que está vazio', () => {
    const [first, second] = service.previewJournalImport([item('cyberpunk 2077', { status: 'finished', rating: 5 }), item('SKATE', { status: 'dropped' })], keep);
    expect(first).toMatchObject({ action: 'update', matchedTitle: 'Cyberpunk 2077', changes: ['status', 'rating'], kept: [] });
    expect(second).toMatchObject({ action: 'update', matchedTitle: 'Skate.' });
  });

  it('casa pelo id da Steam quando a cópia traz', () => {
    const [row] = service.previewJournalImport([item('Nome diferente', { rating: 4 }, { steamAppId: '1091500' })], keep);
    expect(row).toMatchObject({ action: 'update', matchedTitle: 'Cyberpunk 2077' });
  });

  it('por padrão não sobrescreve status, nota nem resenha já preenchidos', () => {
    const [row] = service.previewJournalImport([item('Hades', { status: 'finished', rating: 5, review: 'Ótimo', finishedOn: '2026-01-01' })], keep);
    expect(row.action).toBe('update');
    expect(row.changes).toEqual(['finishedOn', 'review']);
    expect(row.kept).toEqual(['status', 'rating']);

    service.applyJournalImport([item('Hades', { status: 'finished', rating: 5, review: 'Ótimo' })], keep);
    expect(db.getGameById('steam-2')!.log).toMatchObject({ status: 'playing', rating: 3, review: 'Ótimo' });
  });

  it('com "substituir" o arquivo vence nos campos que trouxer e preserva o resto', () => {
    db.upsertGame({ ...db.getGameById('steam-2')!, log: { status: 'playing', rating: 3, notes: 'minha nota' } });
    service.applyJournalImport([item('Hades', { status: 'finished', rating: 5 })], replace);
    expect(db.getGameById('steam-2')!.log).toMatchObject({ status: 'finished', rating: 5, notes: 'minha nota' });
  });

  it('jogo que não está na biblioteca vira entrada manual com plataforma e horas', () => {
    const result = service.applyJournalImport(
      [item('Wavetale', { status: 'completed', rating: 4.5, startedOn: '2026-01-27' }, { platform: 'PC (Steam)', playtimeSeconds: 15060 })],
      keep
    );
    expect(result).toMatchObject({ created: 1, updated: 0, unchanged: 0 });
    const created = db.getGames().find((g) => g.title === 'Wavetale')!;
    expect(created).toMatchObject({ manualEntry: true, platform: 'standalone', manualPlatform: 'PC (Steam)', totalPlaytimeSeconds: 15060 });
    expect(created.id.startsWith('log-')).toBe(true);
    expect(created.log).toMatchObject({ status: 'completed', rating: 4.5, startedOn: '2026-01-27' });
    expect(result.games.map((g) => g.id)).toEqual([created.id]);
  });

  it('aceita o status Contínuo (jogos sem fim, como multiplayer)', () => {
    service.applyJournalImport([item('Skate.', { status: 'endless' })], keep);
    expect(db.getGameById('epic-1')!.log?.status).toBe('endless');
  });

  it('importar de novo não duplica nem muda nada', () => {
    const items = [item('Wavetale', { status: 'completed', rating: 5 }), item('Cyberpunk 2077', { status: 'finished' })];
    service.applyJournalImport(items, keep);
    const total = db.getGames().length;
    const again = service.applyJournalImport(items, keep);
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    expect(db.getGames()).toHaveLength(total);
  });

  it('descarta valores inválidos em vez de gravar lixo', () => {
    const result = service.applyJournalImport([item('Cyberpunk 2077', { status: 'zoado' as never, rating: 9, startedOn: 'ontem' })], keep);
    expect(result).toMatchObject({ updated: 0, created: 0, unchanged: 1 });
    expect(db.getGameById('steam-1')!.log).toBeUndefined();
  });

  it('não gera atividade no feed (centenas de "zerou" antigos não devem aparecer para os amigos)', () => {
    service.applyJournalImport([item('Cyberpunk 2077', { status: 'finished', rating: 5, review: 'Bom' }), item('Wavetale', { status: 'completed' })], keep);
    expect(db.getActivityLog()).toHaveLength(0);
  });
});
