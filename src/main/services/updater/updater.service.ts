import { app } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { UpdateStatus } from '@shared/types/ipc';
import { sendToRenderer } from '../../ipc';
import { setQuitting } from '../../app-shell';

export type { UpdateStatus };

class UpdaterService {
  private status: UpdateStatus = {
    checking: false,
    available: false,
    downloaded: false,
    checked: false
  };

  private initialized = false;

  private isSupported(): boolean {
    return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
  }

  private snapshot(): UpdateStatus {
    return { ...this.status, supported: this.isSupported() };
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Apenas executáveis instalados (NSIS) suportam atualização em segundo plano.
    // Modo de desenvolvimento e versão portátil não se atualizam sozinhos.
    if (!this.isSupported()) {
      return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      this.status.checking = true;
      this.status.error = undefined;
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.snapshot());
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.status.checking = false;
      this.status.available = true;
      this.status.checked = true;
      this.status.version = info.version;
      console.log(`[Updater] Nova versão encontrada: ${info.version}`);
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.snapshot());
    });

    autoUpdater.on('update-not-available', () => {
      this.status.checking = false;
      this.status.available = false;
      this.status.checked = true;
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.snapshot());
    });

    autoUpdater.on('error', (err: Error) => {
      this.status.checking = false;
      this.status.checked = true;
      this.status.error = err.message;
      console.warn('[Updater] Erro ao verificar atualizações:', err.message);
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.snapshot());
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.status.checking = false;
      this.status.available = true;
      this.status.downloaded = true;
      this.status.checked = true;
      this.status.version = info.version;
      console.log(`[Updater] Versão ${info.version} baixada e pronta para instalar`);
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.snapshot());
      sendToRenderer(IPC_CHANNELS.UPDATER_READY, { version: info.version });
    });

    // Espera a aplicação abrir e carregar a biblioteca antes de buscar updates
    setTimeout(() => {
      this.checkForUpdates().catch(() => {});
    }, 15_000).unref();

    // Verificação periódica a cada 4 horas
    setInterval(() => {
      this.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000).unref();
  }

  public async checkForUpdates(): Promise<UpdateStatus> {
    if (!this.isSupported()) {
      return { ...this.status, supported: false, checked: true };
    }
    if (this.status.checking) {
      return this.snapshot();
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.status.checking = false;
      this.status.checked = true;
      this.status.error ??= (err as Error).message;
      console.warn('[Updater] Falha ao consultar atualizações:', (err as Error).message);
      sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.snapshot());
    }
    return this.snapshot();
  }

  public getStatus(): UpdateStatus {
    return this.snapshot();
  }

  public quitAndInstall(): void {
    if (this.status.downloaded) {
      setQuitting();
      autoUpdater.quitAndInstall();
    }
  }
}

export const updaterService = new UpdaterService();
