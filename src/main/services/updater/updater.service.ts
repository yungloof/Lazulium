import { app } from 'electron';
import { autoUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { UpdateStatus } from '@shared/types/ipc';
import { sendToRenderer } from '../../ipc';
import { setQuitting } from '../../app-shell';
import { fetchText } from '../metadata/http';
import { isNewerVersion } from '@shared/utils/version';

export type { UpdateStatus };

const RELEASES_URL = 'https://github.com/yungloof/Lazulium/releases/latest';
const LATEST_YML_URL = `${RELEASES_URL}/download/latest.yml`;
const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const PROGRESS_STEP = 5;                 // Avisa a tela a cada 5% baixados, não a cada pedaço

class UpdaterService {
  private status: UpdateStatus = { checking: false, available: false, downloaded: false, checked: false };
  private initialized = false;
  private lastProgressSent = -1;

  // Instalado pelo instalador (NSIS): baixa e instala sozinho
  private canAutoUpdate(): boolean {
    return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
  }

  // Versão portátil: só avisa e leva ao download
  private isPortable(): boolean {
    return app.isPackaged && !!process.env.PORTABLE_EXECUTABLE_DIR;
  }

  private snapshot(): UpdateStatus {
    return { ...this.status, supported: this.canAutoUpdate(), manualDownload: this.isPortable() || undefined };
  }

  private publish(): void {
    sendToRenderer(IPC_CHANNELS.UPDATER_STATUS, this.snapshot());
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;
    if (!this.canAutoUpdate() && !this.isPortable()) return;   // Modo de desenvolvimento

    if (this.canAutoUpdate()) this.listen();

    setTimeout(() => void this.checkForUpdates().catch(() => undefined), FIRST_CHECK_DELAY_MS).unref();
    setInterval(() => void this.checkForUpdates().catch(() => undefined), CHECK_INTERVAL_MS).unref();
  }

  private listen(): void {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      this.status.checking = true;
      this.status.error = undefined;
      this.publish();
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      Object.assign(this.status, { checking: false, available: true, checked: true, version: info.version, progress: 0 });
      this.lastProgressSent = 0;
      console.log(`[Updater] Nova versão encontrada: ${info.version}`);
      this.publish();
    });

    autoUpdater.on('download-progress', (info: ProgressInfo) => {
      const percent = Math.max(0, Math.min(100, Math.floor(info.percent)));
      this.status.progress = percent;
      if (percent - this.lastProgressSent >= PROGRESS_STEP || percent === 100) {
        this.lastProgressSent = percent;
        this.publish();
      }
    });

    autoUpdater.on('update-not-available', () => {
      Object.assign(this.status, { checking: false, available: false, checked: true });
      this.publish();
    });

    autoUpdater.on('error', (err: Error) => {
      Object.assign(this.status, { checking: false, checked: true, error: err.message, progress: undefined });
      console.warn('[Updater] Erro ao verificar atualizações:', err.message);
      this.publish();
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      Object.assign(this.status, { checking: false, available: true, downloaded: true, checked: true, version: info.version, progress: 100 });
      console.log(`[Updater] Versão ${info.version} baixada e pronta para instalar`);
      this.publish();
      sendToRenderer(IPC_CHANNELS.UPDATER_READY, { version: info.version });
    });
  }

  // Portátil: lê o latest.yml da última Release e compara com a versão aberta
  private async checkPortable(): Promise<void> {
    this.status.checking = true;
    this.status.error = undefined;
    this.publish();
    try {
      const yml = await fetchText(LATEST_YML_URL, { timeoutMs: 15_000, service: 'o GitHub' });
      const version = yml.match(/^version:\s*['"]?([0-9][0-9A-Za-z.\-]*)['"]?\s*$/m)?.[1];
      if (!version) throw new Error('Resposta inesperada do GitHub.');
      const newer = isNewerVersion(version, app.getVersion());
      Object.assign(this.status, { available: newer, version: newer ? version : undefined, downloadUrl: newer ? RELEASES_URL : undefined });
      if (newer) console.log(`[Updater] Nova versão para baixar (portátil): ${version}`);
    } catch (err) {
      this.status.error = (err as Error).message;
      console.warn('[Updater] Falha ao consultar atualizações (portátil):', (err as Error).message);
    } finally {
      this.status.checking = false;
      this.status.checked = true;
      this.publish();
    }
  }

  public async checkForUpdates(): Promise<UpdateStatus> {
    if (this.status.checking) return this.snapshot();
    if (this.isPortable()) {
      await this.checkPortable();
      return this.snapshot();
    }
    if (!this.canAutoUpdate()) return { ...this.snapshot(), checked: true };
    if (this.status.downloaded) return this.snapshot();   // Já tem uma versão esperando para instalar
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.status.checking = false;
      this.status.checked = true;
      this.status.error ??= (err as Error).message;
      console.warn('[Updater] Falha ao consultar atualizações:', (err as Error).message);
      this.publish();
    }
    return this.snapshot();
  }

  public getStatus(): UpdateStatus {
    return this.snapshot();
  }

  public quitAndInstall(): void {
    if (!this.status.downloaded) return;
    setQuitting();
    // Instalação silenciosa e abre o Lazulium de novo no fim
    autoUpdater.quitAndInstall(true, true);
  }
}

export const updaterService = new UpdaterService();
