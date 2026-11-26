import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';

type Db = typeof import('../../src/main/database/db')['db'];
type ActivityService = typeof import('../../src/main/services/profile/activity.service');

let db: Db;
let activity: ActivityService;

beforeEach(async () => {
  useTempUserData();
  vi.resetModules();
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  activity = await import('../../src/main/services/profile/activity.service');
});

describe('linha do tempo de atividades do diário', () => {
  it('mantém um único evento de resenha com o mesmo id ao editar dentro ou fora da janela de 6h', () => {
    const t0 = new Date('2026-11-20T10:00:00.000Z');
    const t1 = new Date('2026-11-20T10:05:00.000Z');
    const t2 = new Date('2026-11-22T18:00:00.000Z');

    db.upsertGame(makeGame({ id: 'gta', title: 'GTA San Andreas' }));
    activity.recordLogChange('gta', undefined, { review: 'Primeiro rascunho' }, t0);
    const firstId = db.getActivityLog()[0].id;

    activity.recordLogChange('gta', { review: 'Primeiro rascunho' }, { review: 'Segundo rascunho' }, t1);
    activity.recordLogChange('gta', { review: 'Segundo rascunho' }, { review: 'Resenha final' }, t2);

    const log = db.getActivityLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual({ id: firstId, kind: 'reviewed', gameId: 'gta', at: t2.toISOString() });
  });

  it('mantém um único evento de nota com o mesmo id ao alterar a nota dentro ou fora da janela de 6h', () => {
    const t0 = new Date('2026-11-20T10:00:00.000Z');
    const t1 = new Date('2026-11-20T11:00:00.000Z');
    const t2 = new Date('2026-11-21T20:00:00.000Z');

    db.upsertGame(makeGame({ id: 'gta', title: 'GTA San Andreas' }));
    activity.recordLogChange('gta', undefined, { rating: 3 }, t0);
    const firstId = db.getActivityLog()[0].id;

    activity.recordLogChange('gta', { rating: 3 }, { rating: 4 }, t1);
    activity.recordLogChange('gta', { rating: 4 }, { rating: 3.5 }, t2);

    const log = db.getActivityLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual({ id: firstId, kind: 'rated', gameId: 'gta', at: t2.toISOString(), rating: 3.5 });
  });

  it('reaproveita o id de mudança de status dentro de 6h e cria novo id após 6h', () => {
    const t0 = new Date('2026-11-20T10:00:00.000Z');
    const t1 = new Date('2026-11-20T12:00:00.000Z');
    const t2 = new Date('2026-11-20T19:00:00.000Z');

    db.upsertGame(makeGame({ id: 'hades', title: 'Hades' }));
    activity.recordLogChange('hades', undefined, { status: 'finished' }, t0);
    const firstId = db.getActivityLog()[0].id;

    activity.recordLogChange('hades', { status: 'playing' }, { status: 'finished' }, t1);
    expect(db.getActivityLog()).toHaveLength(1);
    expect(db.getActivityLog()[0].id).toBe(firstId);
    expect(db.getActivityLog()[0].at).toBe(t1.toISOString());

    activity.recordLogChange('hades', { status: 'playing' }, { status: 'finished' }, t2);
    const log = db.getActivityLog();
    expect(log).toHaveLength(2);
    expect(log[0].id).not.toBe(firstId);
    expect(log[1].id).toBe(firstId);
  });

  it('deduplica entradas antigas repetidas de reviewed e rated em getRecentActivity mantendo só a mais recente', () => {
    db.upsertGame(
      makeGame({
        id: 'gta',
        title: 'GTA San Andreas',
        log: { rating: 3.5, review: 'Texto atual da resenha' }
      })
    );
    db.replaceActivity([], [
      { id: 'rev-old', kind: 'reviewed', gameId: 'gta', at: '2026-11-18T10:00:00.000Z' },
      { id: 'rev-new', kind: 'reviewed', gameId: 'gta', at: '2026-11-20T12:00:00.000Z' },
      { id: 'rev-mid', kind: 'reviewed', gameId: 'gta', at: '2026-11-19T11:00:00.000Z' },
      { id: 'rat-old', kind: 'rated', gameId: 'gta', at: '2026-11-18T10:00:00.000Z', rating: 2 },
      { id: 'rat-new', kind: 'rated', gameId: 'gta', at: '2026-11-20T10:00:00.000Z', rating: 3.5 }
    ]);

    const recent = activity.getRecentActivity();
    expect(recent.map((e) => e.id)).toEqual(['rev-new', 'rat-new']);
    expect(recent[0].text).toBe('Texto atual da resenha');
  });

  it('remove eventos de resenha e nota ao apagar do diário e devolve os ids para exclusão no servidor', () => {
    const t0 = new Date('2026-11-20T10:00:00.000Z');
    const t1 = new Date('2026-11-20T10:30:00.000Z');

    db.upsertGame(makeGame({ id: 'gta', title: 'GTA San Andreas' }));
    activity.recordLogChange('gta', undefined, { rating: 4, review: 'Texto inicial' }, t0);
    const idsByKind = new Map(db.getActivityLog().map((e) => [e.kind, e.id]));

    const removed = activity.recordLogChange('gta', { rating: 4, review: 'Texto inicial' }, {}, t1);
    expect(new Set(removed)).toEqual(new Set([idsByKind.get('rated'), idsByKind.get('reviewed')]));
    expect(db.getActivityLog()).toHaveLength(0);
    expect(activity.getRecentActivity()).toHaveLength(0);
  });

  it('omite evento órfão de nota quando o jogo não tem mais nota no diário', () => {
    db.upsertGame(makeGame({ id: 'gta', title: 'GTA San Andreas', log: {} }));
    db.replaceActivity([], [{ id: 'rat-orphan', kind: 'rated', gameId: 'gta', at: '2026-11-20T10:00:00.000Z', rating: 4 }]);

    expect(activity.getRecentActivity()).toHaveLength(0);
  });
});
