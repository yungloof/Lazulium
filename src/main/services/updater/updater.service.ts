import { app } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { sendToRenderer } from '../../ipc';

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  version?: string;
  error?: string;
}

class UpdaterService {
  private status: UpdateStatus = {
    checking: false,
    available: false,
    downloaded: false
  };

  private initialized = false;

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Apenas executáveis instalados (NSIS) suportam atualização em segundo plano.
    // Modo de desenvolvimento e versão portátil não se atualizam sozinhos.
    if (!app.isPackaged || !!process.env.PORTABLE_EXECUTABLE_DIR) {
      return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      this.status.checking = true;
      this.status.error = undefined;
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.status);
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.status.checking = false;
      this.status.available = true;
      this.status.version = info.version;
      console.log(`[Updater] Nova versão encontrada: ${info.version}`);
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.status);
    });

    autoUpdater.on('update-not-available', () => {
      this.status.checking = false;
      this.status.available = false;
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.status);
    });

    autoUpdater.on('error', (err: Error) => {
      this.status.checking = false;
      this.status.error = err.message;
      console.warn('[Updater] Erro ao verificar atualizações:', err.message);
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.status);
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.status.downloaded = true;
      this.status.version = info.version;
      console.log(`[Updater] Versão ${info.version} baixada e pronta para instalar`);
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.status);
      sendToRenderer(IPC_CHANNELS.UPDATER_READY, { version: info.version });
    });

    // Espera a aplicação abrir e carregar a biblioteca antes de buscar updates
    setTimeout(() => {
      this.checkForUpdates().catch(() => {});
    }, 15_000);

    // Verificação periódica a cada 4 horas
    setInterval(() => {
      this.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  }

  public async checkForUpdates(): Promise<UpdateStatus> {
    if (!app.isPackaged || !!process.env.PORTABLE_EXECUTABLE_DIR) {
      return this.status;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      console.warn('[Updater] Falha ao consultar o GitHub:', (err as Error).message);
    }
    return this.status;
  }

  public getStatus(): UpdateStatus {
    return this.status;
  }

  public quitAndInstall(): void {
    if (this.status.downloaded) {
      autoUpdater.quitAndInstall();
    }
  }
}

export const updaterService = new UpdaterService();
