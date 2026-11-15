import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYNC_SCHEMA, SyncSnapshot } from '../../src/shared/types/sync';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame, storageDir } from '../helpers/fixtures';

async function setupService() {
  vi.resetModules();
  const dir = useTempUserData();
  const { db } = await import('../../src/main/database/db');
  const { socialService } = await import('../../src/main/services/social/social.service');
  const { librarySyncService } = await import('../../src/main/services/social/sync.service');
  await db.init();
  librarySyncService.init();
  return { dir, db, socialService, librarySyncService };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sincronização entre PCs (serviço)', () => {
  it('começa desligada por padrão e não envia nada sem a pessoa ligar', async () => {
    const { socialService, librarySyncService } = await setupService();

    const apiSpy = vi.spyOn(socialService, 'apiRaw');
    vi.spyOn(socialService, 'isConnected').mockReturnValue(true);

    expect(librarySyncService.getStatus().enabled).toBe(false);
    await librarySyncService.syncIfEnabled();
    expect(apiSpy).not.toHaveBeenCalled();
  });

  it('ao ligar, baixa a cópia remota, faz backup local, mescla, envia de volta e refaz em conflito 409', async () => {
    const { dir, db, socialService, librarySyncService } = await setupService();

    db.upsertGame(makeGame({
      id: 'steam-100',
      title: 'Celeste',
      platform: 'steam',
      platformGameId: '100',
      isFavorite: true,
      favoriteUpdatedAt: '2026-06-02T10:00:00Z'
    }));
    db.flush();

    const remoteFirst: SyncSnapshot = {
      schema: SYNC_SCHEMA,
      games: [
        {
          key: 'steam:100',
          steamKey: 'steam:100',
          titleKey: 't:celeste',
          title: 'Celeste',
          log: { status: 'completed', rating: 10, notes: 'Nota secreta do outro PC' },
          logUpdatedAt: '2026-06-01T09:00:00Z'
        }
      ],
      lists: [],
      categories: []
    };
    const remoteConflict: SyncSnapshot = {
      ...remoteFirst,
      games: [
        ...remoteFirst.games,
        {
          key: 't:halflife',
          titleKey: 't:halflife',
          title: 'Half-Life',
          manualEntry: true,
          log: { status: 'finished', rating: 9 },
          logUpdatedAt: '2026-06-03T11:00:00Z'
        }
      ]
    };

    let putCalls = 0;
    const appliedSpy = vi.fn();
    librarySyncService.setAppliedListener(appliedSpy);
    vi.spyOn(socialService, 'isConnected').mockReturnValue(true);
    vi.spyOn(socialService, 'apiRaw').mockImplementation(async (method, path) => {
      if (method === 'GET' && path === '/v1/me/sync') {
        return { ok: true, status: 200, data: { revision: 1, updatedAt: '2026-06-01T09:00:00Z', data: remoteFirst } };
      }
      if (method === 'PUT' && path === '/v1/me/sync') {
        putCalls++;
        if (putCalls === 1) {
          return {
            ok: false,
            status: 409,
            data: { error: 'conflict', revision: 2, updatedAt: '2026-06-03T11:00:00Z', data: remoteConflict }
          };
        }
        return { ok: true, status: 200, data: { revision: 3, updatedAt: '2026-06-03T12:00:00Z' } };
      }
      return { ok: false, status: 404, data: null };
    });

    const status = await librarySyncService.setEnabled(true);
    expect(putCalls).toBe(2);
    expect(status.enabled).toBe(true);
    expect(status.revision).toBe(3);
    expect(status.lastError).toBeNull();
    expect(appliedSpy).toHaveBeenCalledTimes(1);

    const celeste = db.getGameById('steam-100');
    expect(celeste?.isFavorite).toBe(true);
    expect(celeste?.log?.notes).toBe('Nota secreta do outro PC');
    expect(db.getGames().some((g) => g.title === 'Half-Life' && g.manualEntry)).toBe(true);

    const syncBackups = join(storageDir(dir), 'backups', 'sync');
    expect(existsSync(syncBackups)).toBe(true);
    expect(readdirSync(syncBackups).length).toBeGreaterThanOrEqual(1);
  });

  it('apagar cópia na nuvem desliga a sincronização e mantém os dados neste PC', async () => {
    const { db, socialService, librarySyncService } = await setupService();
    db.upsertGame(makeGame({ id: 'steam-200', title: 'Hades', isFavorite: true }));
    db.setSetting('socialSyncLibrary', 'true');
    db.setSetting('socialLibrarySyncRev', '4');

    const apiSpy = vi.spyOn(socialService, 'apiRaw').mockResolvedValue({ ok: true, status: 200, data: { ok: true } as never });
    vi.spyOn(socialService, 'isConnected').mockReturnValue(true);

    const status = await librarySyncService.clearCloudCopy();
    expect(apiSpy).toHaveBeenCalledWith('DELETE', '/v1/me/sync');
    expect(status.enabled).toBe(false);
    expect(status.revision).toBe(0);
    expect(db.getGameById('steam-200')?.isFavorite).toBe(true);
  });
});
