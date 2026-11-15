import { SyncSnapshot, SyncStatusState } from '@shared/types/sync';
import { applySyncSnapshot, buildSyncSnapshot, mergeSyncSnapshots } from '@shared/utils/library-sync';
import { db } from '../../database/db';
import { socialService } from './social.service';

// Sincronização opcional entre PCs (Diário, favoritos, listas e categorias).
// Fica desligada até a pessoa ativar neste PC; envia cópia privada para `/v1/me/sync` (amigos não veem).

export const SYNC_SETTING_KEYS = {
  enabled: 'socialSyncLibrary',
  revision: 'socialLibrarySyncRev',
  lastSyncAt: 'socialLibrarySyncAt'
} as const;

const SYNC_DEBOUNCE_MS = 15_000;
const MAX_CONFLICT_RETRIES = 3;

interface RemoteSyncPayload {
  revision: number;
  updatedAt: string | null;
  data: SyncSnapshot | null;
}

interface PutSyncResponse {
  revision?: number;
  updatedAt?: string;
  data?: SyncSnapshot | null;
  error?: string;
}

const SYNC_SERVER_ERRORS: Record<string, string> = {
  too_large: 'Sua cópia de sincronização passou do limite de quase 2 MB. Diminua resenhas muito longas ou listas enormes e tente de novo.',
  invalid_sync: 'Os dados de sincronização não estão no formato esperado.',
  invalid_revision: 'Versão de sincronização inválida.'
};

function syncErrorMessage(status: number, code?: string): string {
  if (code && SYNC_SERVER_ERRORS[code]) return SYNC_SERVER_ERRORS[code];
  if (status === 429) return 'Pedidos demais para sincronizar. Espere um pouco e tente de novo.';
  if (status >= 500) return `O servidor do Lazulium está fora do ar agora (erro ${status}).`;
  return `O servidor recusou a sincronização (erro ${status}).`;
}

class LibrarySyncService {
  private debounceTimer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | null = null;
  private lastError: string | null = null;
  private statusListener: (status: SyncStatusState) => void = () => {};
  private appliedListener: () => void = () => {};

  setStatusListener(listener: (status: SyncStatusState) => void): void {
    this.statusListener = listener;
  }

  setAppliedListener(listener: () => void): void {
    this.appliedListener = listener;
  }

  init(): void {
    socialService.setLibrarySyncHooks({
      schedule: () => this.scheduleSync(),
      sync: () => this.syncIfEnabled(),
      clearLocal: () => this.clearLocal()
    });
  }

  isEnabled(): boolean {
    return db.getSettings()[SYNC_SETTING_KEYS.enabled] === 'true';
  }

  getStatus(): SyncStatusState {
    const settings = db.getSettings();
    const rev = Number(settings[SYNC_SETTING_KEYS.revision]);
    return {
      enabled: settings[SYNC_SETTING_KEYS.enabled] === 'true',
      lastSyncAt: settings[SYNC_SETTING_KEYS.lastSyncAt] || null,
      lastError: this.lastError,
      revision: Number.isFinite(rev) && rev >= 0 ? rev : 0,
      syncing: Boolean(this.inFlight)
    };
  }

  private publishStatus(): void {
    this.statusListener(this.getStatus());
  }

  clearLocal(): void {
    clearTimeout(this.debounceTimer);
    db.setSetting(SYNC_SETTING_KEYS.enabled, 'false');
    db.setSetting(SYNC_SETTING_KEYS.revision, '');
    db.setSetting(SYNC_SETTING_KEYS.lastSyncAt, '');
    this.lastError = null;
    this.publishStatus();
  }

  scheduleSync(): void {
    if (!this.isEnabled() || !socialService.isConnected()) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.syncNow().catch(() => undefined);
    }, SYNC_DEBOUNCE_MS);
    this.debounceTimer.unref();
  }

  async syncIfEnabled(): Promise<void> {
    if (!this.isEnabled() || !socialService.isConnected()) return;
    await this.syncNow();
  }

  async setEnabled(enabled: boolean): Promise<SyncStatusState> {
    if (!enabled) {
      clearTimeout(this.debounceTimer);
      db.setSetting(SYNC_SETTING_KEYS.enabled, 'false');
      this.lastError = null;
      this.publishStatus();
      return this.getStatus();
    }
    if (!socialService.isConnected()) throw new Error('Entre na conta Lazulium primeiro.');
    db.setSetting(SYNC_SETTING_KEYS.enabled, 'true');
    this.lastError = null;
    this.publishStatus();
    return await this.syncNow();
  }

  async syncNow(): Promise<SyncStatusState> {
    if (this.inFlight) {
      await this.inFlight;
      return this.getStatus();
    }
    if (!socialService.isConnected()) throw new Error('Entre na conta Lazulium primeiro.');

    clearTimeout(this.debounceTimer);
    this.lastError = null;
    this.inFlight = this.runSync();
    this.publishStatus();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
      this.publishStatus();
    }
    return this.getStatus();
  }

  async clearCloudCopy(): Promise<SyncStatusState> {
    clearTimeout(this.debounceTimer);
    if (this.inFlight) await this.inFlight;
    if (socialService.isConnected()) {
      const res = await socialService.apiRaw<{ ok?: boolean; error?: string }>('DELETE', '/v1/me/sync');
      if (!res.ok) throw new Error(syncErrorMessage(res.status, res.data?.error));
    }
    db.setSetting(SYNC_SETTING_KEYS.enabled, 'false');
    db.setSetting(SYNC_SETTING_KEYS.revision, '');
    db.setSetting(SYNC_SETTING_KEYS.lastSyncAt, '');
    this.lastError = null;
    this.publishStatus();
    return this.getStatus();
  }

  private async runSync(): Promise<void> {
    let didApplyLocal = false;
    try {
      const firstGet = await socialService.apiRaw<RemoteSyncPayload>('GET', '/v1/me/sync');
      if (!firstGet.ok || !firstGet.data) throw new Error(syncErrorMessage(firstGet.status, firstGet.data?.error));
      let remote: RemoteSyncPayload = firstGet.data;
      let finalRevision = Number(remote.revision) || 0;
      let finalAt = new Date().toISOString();

      for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
        const nowIso = new Date().toISOString();
        const localState = db.getSyncState();
        const localSnapshot = buildSyncSnapshot(localState, nowIso);
        const { merged, changedLocal, changedRemote } = mergeSyncSnapshots(localSnapshot, remote.data, nowIso);

        if (changedLocal) {
          db.applySyncState(applySyncSnapshot(localState, merged, nowIso));
          didApplyLocal = true;
        }

        const shouldUpload = changedRemote || !remote.data;
        if (!shouldUpload) {
          finalRevision = Number(remote.revision) || finalRevision;
          finalAt = nowIso;
          break;
        }

        const putRes = await socialService.apiRaw<PutSyncResponse>('PUT', '/v1/me/sync', {
          baseRevision: Number(remote.revision) || 0,
          data: merged
        });

        if (putRes.status === 409 && putRes.data) {
          if (attempt === MAX_CONFLICT_RETRIES) {
            throw new Error('Outro PC salvou alterações ao mesmo tempo. Tente sincronizar de novo.');
          }
          remote = {
            revision: Number(putRes.data.revision) || 0,
            updatedAt: putRes.data.updatedAt ?? null,
            data: putRes.data.data ?? null
          };
          continue;
        }

        if (!putRes.ok || !putRes.data) {
          throw new Error(syncErrorMessage(putRes.status, putRes.data?.error));
        }

        finalRevision = Number(putRes.data.revision) || finalRevision;
        finalAt = putRes.data.updatedAt || nowIso;
        break;
      }

      db.setSetting(SYNC_SETTING_KEYS.revision, String(finalRevision));
      db.setSetting(SYNC_SETTING_KEYS.lastSyncAt, finalAt);
      this.lastError = null;
    } catch (err) {
      this.lastError = (err as Error).message;
      console.warn('[Sync] Falha ao sincronizar entre PCs:', this.lastError);
    } finally {
      if (didApplyLocal) this.appliedListener();
    }
  }
}

export const librarySyncService = new LibrarySyncService();
