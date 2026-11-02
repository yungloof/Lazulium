import { app } from 'electron';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, normalize } from 'path';
import {
  BackupEvent,
  BackupListResult,
  BackupReason,
  BackupRecord,
  GameSaveConfig,
  RestoreResult,
  SaveLocation,
  SaveLocationSuggestion
} from '@shared/types/cloudsync';
import { db } from '../../database/db';
import { buildArchive, readArchive, sha256, writeRestoreEntries } from './save-archive.service';
import { detectSaveLocations, sameLocation } from './save-locator.service';
import { googleDriveService } from './google-drive.service';

type BackupListener = (event: BackupEvent) => void;

const MAX_BACKUPS_PER_GAME = 10;
const AUTO_BACKUP_DELAY_MS = 3_000;      // Dá tempo do jogo/launcher terminar de gravar
const DRIVE_PROPS = {
  gameId: 'lazuliumGameId',
  backupId: 'lazuliumBackupId'
} as const;

function backupDir(gameId: string): string {
  return join(app.getPath('userData'), 'backups', gameId.replace(/[^a-z0-9._-]/gi, '_'));
}

function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

export class NoSaveFilesError extends Error {}

class BackupService {
  private listener: BackupListener = () => {};
  private locks = new Map<string, Promise<unknown>>();
  private retrying = false;

  setBackupListener(listener: BackupListener): void {
    this.listener = listener;
  }

  private emit(event: BackupEvent): void {
    try {
      this.listener(event);
    } catch (err) {
      console.warn('[Backup] Falha ao notificar evento:', err);
    }
  }

  // Operações do mesmo jogo rodam em fila (backup automático x restauração manual)
  private withLock<T>(gameId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(gameId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.locks.set(gameId, next);
    void next.finally(() => {
      if (this.locks.get(gameId) === next) this.locks.delete(gameId);
    }).catch(() => undefined);
    return next;
  }

  getConfig(gameId: string): GameSaveConfig | null {
    return db.getSaveConfig(gameId);
  }

  setConfig(gameId: string, config: GameSaveConfig): GameSaveConfig {
    if (!db.getGameById(gameId)) throw new Error('Jogo não encontrado.');
    const locations: SaveLocation[] = [];
    for (const loc of config.locations) {
      const path = loc.path?.trim();
      if (!path || !isAbsolute(path)) throw new Error(`Caminho inválido: ${loc.path}`);
      const clean: SaveLocation = { path: normalize(path), filePrefix: loc.filePrefix?.trim() || undefined };
      if (!locations.some((l) => sameLocation(l, clean))) locations.push(clean);
    }
    return db.setSaveConfig(gameId, { locations, autoBackup: !!config.autoBackup });
  }

  async detect(gameId: string): Promise<SaveLocationSuggestion[]> {
    const game = db.getGameById(gameId);
    return game ? detectSaveLocations(game) : [];
  }

  backupNow(gameId: string, reason: BackupReason = 'manual'): Promise<BackupRecord> {
    return this.withLock(gameId, async () => {
      const record = await this.createBackup(gameId, reason);
      if (!record) throw new NoSaveFilesError('Nenhum arquivo de save encontrado nas pastas configuradas.');
      return record;
    });
  }

  // Retorna null quando não há arquivos ou quando nada mudou desde o último backup automático
  private async createBackup(gameId: string, reason: BackupReason): Promise<BackupRecord | null> {
    const game = db.getGameById(gameId);
    if (!game) throw new Error('Jogo não encontrado.');
    const config = db.getSaveConfig(gameId);
    if (!config?.locations.length) throw new Error('Nenhuma pasta de saves configurada para este jogo.');

    const archive = await buildArchive(game.id, game.title, config.locations);
    if (!archive) return null;

    const [latest] = db.getSaveBackups(gameId);
    if (reason === 'auto' && latest?.contentHash === archive.contentHash) {
      console.log(`[Backup] ${game.title}: saves sem alteração, backup ignorado`);
      return null;
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const dir = backupDir(gameId);
    await mkdir(dir, { recursive: true });
    const localPath = join(dir, `${fileStamp(createdAt)}_${id.slice(0, 8)}.zip`);
    await writeFile(`${localPath}.tmp`, archive.data);
    await rename(`${localPath}.tmp`, localPath);

    const record: BackupRecord = {
      id,
      gameId,
      gameTitle: game.title,
      createdAt,
      reason,
      fileCount: archive.fileCount,
      sizeBytes: archive.data.byteLength,
      sha256: archive.sha256,
      contentHash: archive.contentHash,
      localPath
    };

    if (googleDriveService.isConnected()) await this.uploadRecord(record, archive.data);

    db.upsertSaveBackup(record);
    console.log(`[Backup] ${game.title}: ${record.fileCount} arquivo(s), ${record.sizeBytes} bytes${record.driveFileId ? ' (+Drive)' : ''}`);
    await this.applyRetention(gameId);
    return record;
  }

  // Preenche driveFileId ou driveError no próprio registro
  private async uploadRecord(record: BackupRecord, data: Uint8Array): Promise<void> {
    try {
      record.driveFileId = await googleDriveService.uploadFile(
        `${record.gameTitle.replace(/[\\/:*?"<>|]/g, '')} - ${fileStamp(record.createdAt)}.zip`,
        data,
        {
          [DRIVE_PROPS.gameId]: record.gameId,
          [DRIVE_PROPS.backupId]: record.id,
          sha256: record.sha256,
          contentHash: record.contentHash,
          fileCount: String(record.fileCount),
          reason: record.reason,
          createdAt: record.createdAt
        }
      );
      record.driveError = undefined;
    } catch (err) {
      record.driveError = (err as Error).message;
      console.warn(`[Backup] ${record.gameTitle}: envio ao Drive falhou: ${record.driveError}`);
    }
  }

  // Reenvia ao Drive backups locais cujo upload falhou (ex: feitos sem internet)
  async retryPendingUploads(): Promise<number> {
    if (this.retrying || !googleDriveService.isConnected()) return 0;
    this.retrying = true;
    let sent = 0;
    try {
      const pending = db
        .getAllSaveBackups()
        .filter((r) => r.driveError && !r.driveFileId && r.localPath && existsSync(r.localPath));
      for (const record of pending) {
        await this.withLock(record.gameId, async () => {
          await this.uploadRecord(record, await readFile(record.localPath!));
          db.upsertSaveBackup(record);
          if (record.driveFileId) sent++;
        });
        // Continua sem conexão: tenta de novo numa próxima oportunidade
        if (record.driveError?.startsWith('Sem conexão')) break;
      }
    } finally {
      this.retrying = false;
    }
    if (sent > 0) console.log(`[Backup] ${sent} backup(s) pendente(s) enviados ao Drive`);
    return sent;
  }

  private async applyRetention(gameId: string): Promise<void> {
    const expired = db.getSaveBackups(gameId).slice(MAX_BACKUPS_PER_GAME);
    for (const record of expired) {
      if (record.localPath) await unlink(record.localPath).catch(() => undefined);
      if (record.driveFileId && googleDriveService.isConnected()) {
        await googleDriveService.deleteFile(record.driveFileId).catch((err) =>
          console.warn(`[Backup] Falha ao remover backup antigo do Drive: ${(err as Error).message}`)
        );
      }
    }
    db.removeSaveBackups(expired.map((r) => r.id));
  }

  // Chamado quando uma sessão de jogo termina (tempo contabilizado)
  onSessionEnded(gameId: string): void {
    setTimeout(() => void this.runAutoBackup(gameId), AUTO_BACKUP_DELAY_MS);
  }

  private async runAutoBackup(gameId: string): Promise<void> {
    try {
      let config = db.getSaveConfig(gameId);
      if (!config) {
        // Primeira vez: adota só as pastas de alta confiança (Steam Cloud local, saves do RetroArch)
        const high = (await this.detect(gameId)).filter((s) => s.confidence === 'high');
        if (high.length === 0) return;
        config = this.setConfig(gameId, {
          locations: high.map(({ path, filePrefix }) => ({ path, filePrefix })),
          autoBackup: true
        });
      }
      if (!config.autoBackup || config.locations.length === 0) return;

      this.emit({ gameId, state: 'started' });
      const record = await this.withLock(gameId, () => this.createBackup(gameId, 'auto'));
      this.emit({
        gameId,
        state: 'done',
        record: record ?? undefined,
        message: record ? undefined : 'Saves sem alteração desde o último backup.'
      });
    } catch (err) {
      console.warn(`[Backup] Backup automático de ${gameId} falhou: ${(err as Error).message}`);
      this.emit({ gameId, state: 'error', message: (err as Error).message });
    }
  }

  // Histórico local + backups que só existem no Drive (ex: feitos em outro PC)
  async listBackups(gameId: string): Promise<BackupListResult> {
    const local = db.getSaveBackups(gameId).filter((r) => r.driveFileId || (r.localPath && existsSync(r.localPath)));
    if (!googleDriveService.isConnected()) return { backups: local };

    try {
      const knownIds = new Set(local.map((r) => r.id));
      const title = db.getGameById(gameId)?.title ?? gameId;
      const remote: BackupRecord[] = (await googleDriveService.listFiles(DRIVE_PROPS.gameId, gameId))
        .filter((f) => !knownIds.has(f.appProperties[DRIVE_PROPS.backupId]))
        .map((f) => ({
          id: f.appProperties[DRIVE_PROPS.backupId] || f.id,
          gameId,
          gameTitle: title,
          createdAt: f.appProperties.createdAt || f.createdTime,
          reason: (f.appProperties.reason as BackupReason) || 'manual',
          fileCount: Number(f.appProperties.fileCount || 0),
          sizeBytes: f.size,
          sha256: f.appProperties.sha256 ?? '',
          contentHash: f.appProperties.contentHash ?? '',
          driveFileId: f.id
        }));
      const backups = [...local, ...remote].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { backups };
    } catch (err) {
      return { backups: local, driveError: (err as Error).message };
    }
  }

  restore(gameId: string, backupId: string): Promise<RestoreResult> {
    return this.withLock(gameId, async () => {
      const { backups } = await this.listBackups(gameId);
      const record = backups.find((b) => b.id === backupId);
      if (!record) throw new Error('Backup não encontrado.');

      let data: Uint8Array;
      if (record.localPath && existsSync(record.localPath)) {
        data = await readFile(record.localPath);
      } else if (record.driveFileId) {
        data = await googleDriveService.downloadFile(record.driveFileId);
      } else {
        throw new Error('O arquivo deste backup não está mais disponível.');
      }
      if (record.sha256 && sha256(data) !== record.sha256) {
        throw new Error('O arquivo do backup não confere com o hash registrado (corrompido). Restauração cancelada.');
      }

      // Valida tudo antes de mexer nos saves atuais
      const entries = await readArchive(data, gameId);

      // Cópia de segurança do estado atual; se falhar, não arriscamos sobrescrever
      let safetyBackupId: string | undefined;
      if (db.getSaveConfig(gameId)?.locations.length) {
        safetyBackupId = (await this.createBackup(gameId, 'pre-restore'))?.id;
      }

      await writeRestoreEntries(entries);
      console.log(`[Backup] ${record.gameTitle}: ${entries.length} arquivo(s) restaurados de ${record.createdAt}`);
      return { restoredFiles: entries.length, safetyBackupId };
    });
  }
}

export const backupService = new BackupService();
