import { IPC_CHANNELS, IpcChannel } from '@shared/constants/ipc-channels';
import { db } from '../database/db';
import { notify } from '../app-shell';
import { playtimeService } from '../services/tracker/playtime.service';
import { steamNamesService } from '../services/scanners/steam-names.service';
import { artworkService } from '../services/metadata/artwork.service';
import { achievementsService } from '../services/achievements/achievements.service';
import { backupService } from '../services/cloudsync/backup.service';
import { screenshotCaptureService } from '../services/metadata/screenshot-capture.service';
import { socialService } from '../services/social/social.service';
import { WindowGetter } from './helpers';

let getWindow: WindowGetter = () => null;

// Evento main -> renderer. Sem janela (app na bandeja) o aviso é descartado: ao abrir, a interface relê tudo.
export function sendToRenderer(channel: IpcChannel, payload: unknown): void {
  const win = getWindow();
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

// Liga os serviços que trabalham em segundo plano aos avisos da interface
export function registerRendererEvents(getMainWindow: WindowGetter): void {
  getWindow = getMainWindow;
  const sendGame = (game: unknown) => sendToRenderer(IPC_CHANNELS.LIBRARY_GAME_UPDATED, game);

  screenshotCaptureService.setPidProvider((gameId) => playtimeService.getAlivePids(gameId));
  screenshotCaptureService.setListener((result) => sendToRenderer(IPC_CHANNELS.SCREENSHOTS_TAKEN, result));

  playtimeService.setStatusListener((status) => {
    sendToRenderer(IPC_CHANNELS.GAME_STATUS_CHANGED, status);
    if (status.state === 'running' || status.state === 'stopped') screenshotCaptureService.onGameStatus(status.gameId, status.state === 'running');
    // Sessão contabilizada (>= 15s): backup automático dos saves
    if (status.state === 'stopped' && (status.sessionSeconds ?? 0) > 0) backupService.onSessionEnded(status.gameId);
    // Conta Lazulium: "jogando agora" para os amigos e envio da sessão nova
    if (status.state === 'running' || status.state === 'stopped') socialService.onGameStatus(status.gameId, status.state === 'running', status.startTime);
  });

  socialService.setStatusListener((status) => sendToRenderer(IPC_CHANNELS.SOCIAL_STATUS_CHANGED, status));

  backupService.setBackupListener((event) => {
    sendToRenderer(IPC_CHANNELS.CLOUDSYNC_BACKUP_EVENT, event);
    const title = db.getGameById(event.gameId)?.title ?? 'Jogo';
    if (event.state === 'done' && event.record) {
      notify(`Saves de ${title} salvos`, event.record.driveFileId ? 'Backup feito neste PC e no Google Drive.' : 'Backup feito neste PC.');
    } else if (event.state === 'error') {
      notify(`Backup de ${title} falhou`, event.message ?? 'Não foi possível copiar os saves. Abra o jogo no Lazulium para ver o motivo.');
    }
  });

  steamNamesService.setGameUpdatedListener(sendGame);
  artworkService.setGameUpdatedListener(sendGame);
  achievementsService.setGameUpdatedListener(sendGame);
  achievementsService.setListUpdatedListener((gameId) => sendToRenderer(IPC_CHANNELS.ACHIEVEMENTS_UPDATED, gameId));
}
