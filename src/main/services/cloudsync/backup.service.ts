import { app } from 'electron';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, rename, statfs, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, normalize } from 'path';
import {
  BackupEvent,
  BackupListResult,
  BackupOverview,
  BackupReason,
  BackupRecord,
  GameSaveConfig,
  RestoreResult,
  SaveLocation,
  SaveLocationSuggestion
} from '@shared/types/cloudsync';
import { db } from '../../database/db';
import { gameDirName } from '../metadata/media-cache.service';
import { buildArchive, readArchive, sha256, writeRestoreEntries } from './save-archive.service';
import { detectSaveLocations, sameLocation } from './save-locator.service';
import { DriveError, googleDriveService, isDriveConnectionError } from './google-drive.service';

type BackupListener = (event: BackupEvent) => void;

const MAX_BACKUPS_PER_GAME = 10;
const AUTO_BACKUP_DELAY_MS = 3_000;      // Dá tempo do jogo/launcher terminar de gravar
const SWEEP_SETTING = 'savesSweepAt';
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SWEEP_PAUSE_MS = 200;              // Entre um jogo e outro: nunca disputa o PC com quem está jogando
const MAX_GUESSED_FOLDER_BYTES = 200 * 1024 * 1024; // Pasta achada pelo nome, sem certeza de ser só de saves
const CONSENT_SETTING = 'autoBackupConsent';        // 'on' | 'off' | ausente (ainda não perguntou)
const LIMIT_SETTING = 'backupLimitGb';
const DEFAULT_LIMIT_GB = 3;
const MIN_FREE_DISK_BYTES = 512 * 1024 * 1024;      // Folga que o backup nunca come: o Windows e os jogos precisam do disco
const DRIVE_OFFLINE_PAUSE_MS = 5 * 60_000;          // Sem internet: os próximos backups nem tentam o Drive por alguns minutos
const DRIVE_OFFLINE_MESSAGE = 'Sem conexão com o Google Drive. O envio é feito sozinho quando a internet voltar.';
const DRIVE_PROPS = {
  gameId: 'lazuliumGameId',
  backupId: 'lazuliumBackupId'
} as const;

function backupDir(gameId: string): string {
  return join(app.getPath('userData'), 'backups', gameDirName(gameId));
}

function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

const formatMb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;

// Espaço livre no disco da pasta de dados (undefined se o Windows não informar)
async function freeDiskBytes(dir: string): Promise<number | undefined> {
  try {
    const info = await statfs(dir);
    return Number(info.bavail) * Number(info.bsize);
  } catch {
    return undefined;
  }
}

export class NoSaveFilesError extends Error {}

class BackupService {
  private listener: BackupListener = () => {};
  private locks = new Map<string, Promise<unknown>>();
  private retrying = false;
  private sweeping = false;
  private driveOfflineUntil = 0;

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

  // Operações do mesmo jogo rodam em fila (backup automático x restauração manual x reenvio ao Drive)
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
    for (const loc of Array.isArray(config?.locations) ? config.locations : []) {
      const path = typeof loc?.path === 'string' ? loc.path.trim() : '';
      if (!path || !isAbsolute(path)) throw new Error(`Caminho inválido: ${loc?.path ?? ''}`);
      const clean: SaveLocation = { path: normalize(path), filePrefix: typeof loc.filePrefix === 'string' ? loc.filePrefix.trim() || undefined : undefined };
      if (!locations.some((l) => sameLocation(l, clean))) locations.push(clean);
    }
    return db.setSaveConfig(gameId, { locations, autoBackup: !!config?.autoBackup });
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

    const size = archive.data.byteLength;
    // Uma cópia sozinha maior que o limite de espaço apagaria todas as outras: a automática não entra
    if (reason === 'auto' && size > this.getLimitBytes()) {
      throw new Error(`Os saves de ${game.title} ocupam ${formatMb(size)}, mais que o limite de espaço dos backups. Aumente o limite em Configurações ou faça o backup à mão.`);
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const dir = backupDir(gameId);
    await mkdir(dir, { recursive: true });
    const free = await freeDiskBytes(dir);
    if (free !== undefined && free - size < MIN_FREE_DISK_BYTES) {
      throw new Error(`Pouco espaço livre no disco para o backup de ${game.title} (${formatMb(size)}). Libere espaço e tente de novo.`);
    }

    const localPath = join(dir, `${fileStamp(createdAt)}_${id.slice(0, 8)}.zip`);
    try {
      await writeFile(`${localPath}.tmp`, archive.data);
      await rename(`${localPath}.tmp`, localPath);
    } catch (err) {
      // Disco cheio no meio da gravação: não deixa um .tmp pela metade ocupando espaço
      await unlink(`${localPath}.tmp`).catch(() => undefined);
      throw new Error(`Não foi possível gravar o backup de ${game.title} neste PC (${(err as NodeJS.ErrnoException).code ?? 'erro de disco'}).`);
    }

    const record: BackupRecord = {
      id,
      gameId,
      gameTitle: game.title,
      createdAt,
      reason,
      fileCount: archive.fileCount,
      sizeBytes: size,
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
    // Acabou de faltar internet: não espera a falha de novo a cada jogo, só marca como pendente
    if (Date.now() < this.driveOfflineUntil) {
      record.driveError = DRIVE_OFFLINE_MESSAGE;
      return;
    }
    try {
      // Um envio que caiu depois de o Google receber o arquivo não pode virar cópia dobrada no Drive
      if (record.driveError) {
        const existing = await googleDriveService.listFiles(DRIVE_PROPS.backupId, record.id);
        if (existing[0]) {
          record.driveFileId = existing[0].id;
          record.driveError = undefined;
          return;
        }
      }
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
        },
        record.gameTitle
      );
      record.driveError = undefined;
      this.driveOfflineUntil = 0;
    } catch (err) {
      if (isDriveConnectionError(err)) {
        // Sem internet é esperado: um aviso no log por queda, e o reenvio acontece sozinho depois
        if (!this.driveOfflineUntil) console.warn(`[Backup] ${(err as Error).message} Os backups ficam neste PC até a conexão voltar.`);
        this.driveOfflineUntil = Date.now() + DRIVE_OFFLINE_PAUSE_MS;
        record.driveError = DRIVE_OFFLINE_MESSAGE;
        return;
      }
      record.driveError = (err as Error).message;
      console.warn(`[Backup] ${record.gameTitle}: envio ao Drive falhou: ${record.driveError}`);
    }
  }

  // Envia ao Drive o que ainda só está neste PC (feito sem internet ou antes de conectar a conta)
  async retryPendingUploads(): Promise<number> {
    if (this.retrying || !googleDriveService.isConnected()) return 0;
    this.retrying = true;
    // Pedido explícito (internet voltou, botão "Tentar enviar de novo"): tenta agora mesmo
    this.driveOfflineUntil = 0;
    let sent = 0;
    try {
      const pendingIds = db
        .getAllSaveBackups()
        .filter((r) => !r.driveFileId && r.localPath && existsSync(r.localPath))
        .map((r) => ({ id: r.id, gameId: r.gameId }));
      for (const { id, gameId } of pendingIds) {
        const stillOffline = await this.withLock(gameId, async () => {
          // Relido dentro da fila: a retenção pode ter apagado este backup, e ele não pode voltar ao banco
          const record = db.getSaveBackups(gameId).find((r) => r.id === id);
          if (!record || record.driveFileId || !record.localPath || !existsSync(record.localPath)) return false;
          let data: Uint8Array;
          try {
            data = await readFile(record.localPath);
          } catch {
            return false;
          }
          const updated = { ...record };
          await this.uploadRecord(updated, data);
          db.upsertSaveBackup(updated);
          if (updated.driveFileId) sent++;
          return updated.driveError === DRIVE_OFFLINE_MESSAGE;
        }).catch(() => false);
        // Continua sem conexão (ou a conta caiu): tenta de novo numa próxima oportunidade
        if (stillOffline || !googleDriveService.isConnected()) break;
      }
    } finally {
      this.retrying = false;
    }
    if (sent > 0) console.log(`[Backup] ${sent} backup(s) pendente(s) enviados ao Drive`);
    return sent;
  }

  // Quem já tinha backups ou pastas configuradas antes de existir a pergunta continua como estava
  migrateConsent(): void {
    if (db.getSettings()[CONSENT_SETTING]) return;
    if (db.getAllSaveBackups().length > 0) db.setSetting(CONSENT_SETTING, 'on');
  }

  isAutoEnabled(): boolean {
    return db.getSettings()[CONSENT_SETTING] === 'on';
  }

  getLimitBytes(): number {
    const gb = Number(db.getSettings()[LIMIT_SETTING]);
    return (Number.isFinite(gb) && gb > 0 ? gb : DEFAULT_LIMIT_GB) * 1024 ** 3;
  }

  setAutoEnabled(enabled: boolean): BackupOverview {
    db.setSetting(CONSENT_SETTING, enabled ? 'on' : 'off');
    // Ligar começa a conferir agora, sem segurar quem clicou
    if (enabled) void this.autoBackupSweep(true).catch((err) => console.warn(`[Backup] Passada de backups falhou: ${(err as Error).message}`));
    return this.getOverview();
  }

  // Passou do limite de espaço: tira primeiro as cópias mais antigas deste PC, sempre guardando a mais nova de cada jogo.
  // O que já está no Drive continua no histórico, só sem o arquivo local.
  private async enforceSpaceLimit(): Promise<void> {
    const limit = this.getLimitBytes();
    const local = db.getAllSaveBackups().filter((r) => r.localPath && existsSync(r.localPath));
    let total = local.reduce((sum, r) => sum + r.sizeBytes, 0);
    if (total <= limit) return;

    const newestPerGame = new Map<string, BackupRecord>();
    for (const r of local) {
      const newest = newestPerGame.get(r.gameId);
      if (!newest || r.createdAt > newest.createdAt) newestPerGame.set(r.gameId, r);
    }
    const keep = new Set([...newestPerGame.values()].map((r) => r.id));
    const removable = local.filter((r) => !keep.has(r.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const dropped: string[] = [];
    let handled = 0;
    for (const record of removable) {
      if (total <= limit) break;
      await unlink(record.localPath!).catch(() => undefined);
      total -= record.sizeBytes;
      handled++;
      if (record.driveFileId) db.upsertSaveBackup({ ...record, localPath: undefined });
      else dropped.push(record.id);
    }
    db.removeSaveBackups(dropped);
    if (total > limit) console.warn('[Backup] O limite de espaço é menor que a cópia mais recente de cada jogo: aumente o limite em Configurações.');
    else console.log(`[Backup] Limite de espaço: ${handled} cópias antigas tratadas`);
  }

  private async applyRetention(gameId: string): Promise<void> {
    const expired = db.getSaveBackups(gameId).slice(MAX_BACKUPS_PER_GAME);
    const removed: string[] = [];
    for (const record of expired) {
      if (record.localPath) await unlink(record.localPath).catch(() => undefined);
      if (record.driveFileId && googleDriveService.isConnected()) {
        try {
          await googleDriveService.deleteFile(record.driveFileId);
        } catch (err) {
          // Já sumiu do Drive: some daqui também. Outra falha (sem internet): o registro fica e a próxima retenção tenta
          // de novo; tirá-lo agora deixaria o arquivo esquecido no Drive, voltando à lista como "backup de outro PC".
          if (!(err instanceof DriveError && err.status === 404)) {
            if (record.localPath) db.upsertSaveBackup({ ...record, localPath: undefined });
            if (!isDriveConnectionError(err)) console.warn(`[Backup] Falha ao remover backup antigo do Drive: ${(err as Error).message}`);
            continue;
          }
        }
      }
      removed.push(record.id);
    }
    db.removeSaveBackups(removed);
    await this.enforceSpaceLimit();
  }

  // Chamado quando uma sessão de jogo termina (tempo contabilizado)
  onSessionEnded(gameId: string): void {
    setTimeout(() => void this.runAutoBackup(gameId), AUTO_BACKUP_DELAY_MS);
  }

  // Jogos abertos fora do Lazulium (pela Steam, pelo atalho) também entram: uma passada por dia, só no que mudou
  async autoBackupSweep(force = false): Promise<void> {
    const last = Number(db.getSettings()[SWEEP_SETTING] ?? 0);
    if (!this.isAutoEnabled() || this.sweeping || (!force && Date.now() - last < SWEEP_INTERVAL_MS)) return;
    this.sweeping = true;
    try {
      const games = db.getGames().filter((g) => !g.isHidden && !g.manualEntry && (g.totalPlaytimeSeconds > 0 || g.platform === 'emulator' || db.getSaveConfig(g.id)));
      for (const game of games) {
        await this.runAutoBackup(game.id, true);
        await new Promise((resolve) => setTimeout(resolve, SWEEP_PAUSE_MS));
      }
      // Só conta como feita se chegou ao fim: fechar o app no meio não pula jogos até amanhã
      db.setSetting(SWEEP_SETTING, String(Date.now()));
      console.log(`[Backup] Passada diária: ${games.length} jogos conferidos`);
      await this.retryPendingUploads();
    } finally {
      this.sweeping = false;
    }
  }

  private async runAutoBackup(gameId: string, silent = false): Promise<void> {
    try {
      let config = db.getSaveConfig(gameId);
      if (!config) {
        // Sem consentimento o app não procura nem copia pasta nenhuma: só vale o que o jogador configurou no painel do jogo
        if (!this.isAutoEnabled()) return;
        // Primeira vez: pastas confiáveis (Steam Cloud local, emuladores) e as achadas pelo nome, se forem de tamanho razoável
        const found = (await this.detect(gameId)).filter((s) => s.confidence === 'high' || s.sizeBytes <= MAX_GUESSED_FOLDER_BYTES);
        if (found.length === 0) return;
        config = this.setConfig(gameId, {
          locations: found.map(({ path, filePrefix }) => ({ path, filePrefix })),
          autoBackup: true
        });
      }
      if (!config.autoBackup || config.locations.length === 0) return;

      if (silent) {
        await this.withLock(gameId, () => this.createBackup(gameId, 'auto'));
        return;
      }
      this.emit({ gameId, state: 'started' });
      const record = await this.withLock(gameId, () => this.createBackup(gameId, 'auto'));
      this.emit({
        gameId,
        state: 'done',
        record: record ?? undefined,
        message: record ? undefined : 'Saves sem alteração desde o último backup.'
      });
    } catch (err) {
      console.warn(`[Backup] Backup automático de ${db.getGameById(gameId)?.title ?? gameId} falhou: ${(err as Error).message}`);
      if (!silent) this.emit({ gameId, state: 'error', message: (err as Error).message });
    }
  }

  getOverview(): BackupOverview {
    const backups = db.getAllSaveBackups();
    const last = Number(db.getSettings()[SWEEP_SETTING] ?? 0);
    return {
      games: new Set(backups.map((b) => b.gameId)).size,
      backups: backups.length,
      sizeBytes: backups.reduce((sum, b) => sum + b.sizeBytes, 0),
      onDrive: backups.filter((b) => b.driveFileId).length,
      pendingUpload: backups.filter((b) => !b.driveFileId && b.localPath && existsSync(b.localPath)).length,
      driveConnected: googleDriveService.isConnected(),
      lastSweepAt: last ? new Date(last).toISOString() : undefined,
      autoEnabled: this.isAutoEnabled(),
      limitBytes: this.getLimitBytes()
    };
  }

  private gamesSharingFolder(gameId: string): string[] {
    const own = db.getSaveConfig(gameId)?.locations ?? [];
    if (own.length === 0) return [];
    return db
      .getGames()
      .filter((g) => g.id !== gameId && db.getSaveConfig(g.id)?.locations.some((l) => own.some((o) => sameLocation(o, l))))
      .map((g) => g.title);
  }

  // Histórico local + backups que só existem no Drive (ex: feitos em outro PC)
  async listBackups(gameId: string): Promise<BackupListResult> {
    const local = db.getSaveBackups(gameId).filter((r) => r.driveFileId || (r.localPath && existsSync(r.localPath)));
    const sharedWith = this.gamesSharingFolder(gameId);
    if (!googleDriveService.isConnected()) return { backups: local, sharedWith };

    try {
      const knownIds = new Set(local.map((r) => r.id));
      const knownFiles = new Set(local.map((r) => r.driveFileId).filter(Boolean));
      const title = db.getGameById(gameId)?.title ?? gameId;
      const remote: BackupRecord[] = (await googleDriveService.listFiles(DRIVE_PROPS.gameId, gameId))
        .filter((f) => !knownIds.has(f.appProperties[DRIVE_PROPS.backupId]) && !knownFiles.has(f.id))
        .map((f) => ({
          id: f.appProperties[DRIVE_PROPS.backupId] || f.id,
          gameId,
          gameTitle: title,
          createdAt: f.appProperties.createdAt || f.createdTime,
          reason: (['auto', 'manual', 'pre-restore'].includes(f.appProperties.reason) ? f.appProperties.reason : 'manual') as BackupReason,
          fileCount: Number(f.appProperties.fileCount || 0) || 0,
          sizeBytes: f.size,
          sha256: f.appProperties.sha256 ?? '',
          contentHash: f.appProperties.contentHash ?? '',
          driveFileId: f.id
        }));
      const backups = [...local, ...remote].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { backups, sharedWith };
    } catch (err) {
      return { backups: local, sharedWith, driveError: (err as Error).message };
    }
  }

  restore(gameId: string, backupId: string): Promise<RestoreResult> {
    return this.withLock(gameId, async () => {
      // Backup deste PC não depende da internet: só procura no Drive o que não está no histórico local
      const record = db.getSaveBackups(gameId).find((b) => b.id === backupId) ?? (await this.listBackups(gameId)).backups.find((b) => b.id === backupId);
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
        throw new Error('O arquivo do backup está corrompido. Nada foi restaurado.');
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
