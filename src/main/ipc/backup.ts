import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { GameSaveConfig } from '@shared/types/cloudsync';
import { playtimeService } from '../services/tracker/playtime.service';
import { backupService } from '../services/cloudsync/backup.service';
import { googleDriveService } from '../services/cloudsync/google-drive.service';
import { handle, WindowGetter } from './helpers';

// Backup de saves (neste PC e no Google Drive)
export function registerBackupHandlers(getMainWindow: WindowGetter): void {
  handle(IPC_CHANNELS.BACKUP_OVERVIEW, () => backupService.getOverview());
  handle(IPC_CHANNELS.BACKUP_SET_AUTO, (_event, enabled: boolean) => backupService.setAutoEnabled(!!enabled));
  handle(IPC_CHANNELS.BACKUP_RUN_SWEEP, async () => {
    await backupService.autoBackupSweep(true);
    return backupService.getOverview();
  });

  handle(IPC_CHANNELS.CLOUDSYNC_STATUS, () => googleDriveService.getStatus());
  handle(IPC_CHANNELS.CLOUDSYNC_AUTH, async () => {
    const status = await googleDriveService.connect();
    getMainWindow()?.focus(); // O login acontece no navegador: traz o app de volta
    return status;
  });
  handle(IPC_CHANNELS.CLOUDSYNC_DISCONNECT, () => googleDriveService.disconnect());

  handle(IPC_CHANNELS.CLOUDSYNC_GET_SAVE_CONFIG, (_event, gameId: string) => backupService.getConfig(gameId));
  handle(IPC_CHANNELS.CLOUDSYNC_SET_SAVE_CONFIG, (_event, gameId: string, config: GameSaveConfig) => backupService.setConfig(gameId, config));
  handle(IPC_CHANNELS.CLOUDSYNC_DETECT_SAVES, (_event, gameId: string) => backupService.detect(gameId));
  handle(IPC_CHANNELS.CLOUDSYNC_BACKUP, (_event, gameId: string) => backupService.backupNow(gameId, 'manual'));
  handle(IPC_CHANNELS.CLOUDSYNC_LIST_BACKUPS, (_event, gameId: string) => backupService.listBackups(gameId));
  handle(IPC_CHANNELS.CLOUDSYNC_RETRY_UPLOADS, () => backupService.retryPendingUploads());

  handle(IPC_CHANNELS.CLOUDSYNC_RESTORE, (_event, gameId: string, backupId: string) => {
    if (playtimeService.getState(gameId) !== 'stopped') throw new Error('Feche o jogo antes de restaurar um save.');
    return backupService.restore(gameId, backupId);
  });
}
