import { app } from 'electron';
import { autoUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { UpdateStatus } from '@shared/types/ipc';
import { sendToRenderer } from '../../ipc';
import { isMainWindowVisible, markHiddenRelaunch, setQuitting, SILENT_MODE } from '../../app-shell';
import { fetchText } from '../metadata/http';
import { isNewerVersion } from '@shared/utils/version';
import { CHECK_INTERVAL_MS, FoundUpdate, QUIET_INSTALL_POLL_MS, canInstallQuietly, updateBeforeOpening } from './update-flow';
import { createUpdateWindow, UpdateWindow } from './update-window';

export type { UpdateStatus };

const RELEASES_URL = 'https://github.com/yungloof/Lazulium/releases/latest';
const LATEST_YML_URL = `${RELEASES_URL}/download/latest.yml`;
const FIRST_CHECK_DELAY_MS = 15_000;
const PROGRESS_STEP = 5;                 // Avisa a tela a cada 5% baixados, não a cada pedaço

class UpdaterService {
  private status: UpdateStatus = { checking: false, available: false, downloaded: false, checked: false };
  private initialized = false;
  private listening = false;
  private checkedAtStartup = false;
  private lastProgressSent = -1;
  private startupWindow: UpdateWindow | null = null;
  private openingCheck = false;           // Atualização ao abrir em andamento: ela decide, não a da bandeja
  private quietTimer: NodeJS.Timeout | undefined;
  private isGameRunning: () => boolean = () => false;

  // Quem sabe se tem jogo aberto é o rastreador; o index liga os dois
  public setGameRunningCheck(check: () => boolean): void {
    this.isGameRunning = check;
  }

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

    if (!this.checkedAtStartup) setTimeout(() => void this.checkForUpdates().catch(() => undefined), FIRST_CHECK_DELAY_MS).unref();
    setInterval(() => void this.checkForUpdates().catch(() => undefined), CHECK_INTERVAL_MS).unref();
  }

  // Ao abrir, antes da janela principal: tendo versão nova, baixa, instala e abre de novo (como o Discord).
  // Devolve true quando vai instalar (o app fecha sozinho; quem chamou não abre a janela).
  public async updateBeforeOpening(): Promise<boolean> {
    const fake = SILENT_MODE ? process.env.LAZULIUM_FAKE_UPDATE : undefined;   // Só para testes em modo silencioso
    if (!fake && !this.canAutoUpdate()) return false;
    if (!fake) this.listen();
    this.checkedAtStartup = true;
    this.openingCheck = true;
    const result = await updateBeforeOpening({
      check: () => (fake ? this.fakeCheck(fake) : this.checkAtStartup()),
      install: () => {
        if (fake) {
          console.log(`[Updater] (teste) instalaria a ${fake} agora`);
          setTimeout(() => app.quit(), 1_500);   // Como o instalador faria: o app fecha
          return;
        }
        this.status.downloaded = true;      // O download terminou (a promessa dele resolveu)
        this.quitAndInstall();
      },
      createUi: () => (this.startupWindow = createUpdateWindow())
    });
    this.openingCheck = false;
    if (result === 'open') this.startupWindow = null;
    console.log(`[Updater] Ao abrir: ${result === 'installing' ? 'instalando a versão nova' : 'abrindo normalmente'}`);
    return result === 'installing';
  }

  private async checkAtStartup(): Promise<FoundUpdate | null> {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable || !result.downloadPromise) return null;
    return { version: result.updateInfo.version, download: result.downloadPromise };
  }

  // LAZULIUM_FAKE_UPDATE=9.9.9 (só com LAZULIUM_SILENT=1): finge achar e baixar uma versão, sem instalar nada
  private async fakeCheck(version: string): Promise<FoundUpdate | null> {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const download = (async () => {
      for (let percent = 0; percent <= 100; percent += 20) {
        this.startupWindow?.progress(percent);
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    })();
    return { version, download };
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
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
        this.startupWindow?.progress(percent);
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
      this.watchQuietInstall();
    });
  }

  // Baixada com o app aberto: instala sozinho assim que ele estiver na bandeja sem jogo aberto.
  // Com a janela na tela continua o aviso de sempre (e instala ao fechar ou na próxima abertura).
  private watchQuietInstall(): void {
    const tryNow = () => {
      if (this.openingCheck) return;
      if (canInstallQuietly({ downloaded: this.status.downloaded, windowVisible: isMainWindowVisible(), gameRunning: this.isGameRunning(), uptimeMs: process.uptime() * 1000 })) {
        console.log(`[Updater] Instalando a ${this.status.version} com o app na bandeja`);
        this.quitAndInstall({ hidden: true });
      }
    };
    if (!this.quietTimer) this.quietTimer = setInterval(tryNow, QUIET_INSTALL_POLL_MS).unref();
    tryNow();
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

  public quitAndInstall(options: { hidden?: boolean } = {}): void {
    if (!this.status.downloaded) return;
    clearInterval(this.quietTimer);
    if (options.hidden) markHiddenRelaunch();
    setQuitting();
    // Instalação silenciosa e abre o Lazulium de novo no fim
    autoUpdater.quitAndInstall(true, true);
  }
}

export const updaterService = new UpdaterService();
