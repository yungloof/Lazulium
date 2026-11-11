import { app, shell } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { db } from '../database/db';
import { getLogsDir } from '../logger';
import { applyLoginItem, markRendererReady } from '../app-shell';
import { artworkService } from '../services/metadata/artwork.service';
import { backupService } from '../services/cloudsync/backup.service';
import { updaterService } from '../services/updater/updater.service';
import { DRIVE_SETTING_KEYS } from '../services/cloudsync/google-drive.service';
import { askOpenPaths, handle, WindowGetter } from './helpers';

// Gerenciadas só pelo main: o renderer nunca lê nem grava o token do Google
const PRIVATE_SETTING_KEYS: string[] = [DRIVE_SETTING_KEYS.refreshToken, DRIVE_SETTING_KEYS.email, DRIVE_SETTING_KEYS.folderId];

const DEFAULT_FILE_FILTERS = [{ name: 'Executáveis', extensions: ['exe', 'bat', 'cmd'] }];

// Configurações, janela, seletores de arquivo e ciclo de vida do app
export function registerSystemHandlers(getMainWindow: WindowGetter): void {
  handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    const settings = db.getSettings();
    for (const key of PRIVATE_SETTING_KEYS) delete settings[key];
    return settings;
  });

  handle(IPC_CHANNELS.SETTINGS_SET, (_event, key: string, value: string) => {
    if (typeof key !== 'string' || !key) throw new Error('Configuração inválida.');
    if (PRIVATE_SETTING_KEYS.includes(key)) throw new Error('Essa configuração é gerenciada pelo próprio Lazulium.');
    const text = typeof value === 'string' ? value : String(value ?? '');
    db.setSetting(key, text);
    if (key === 'steamGridDbApiKey' && text.trim()) artworkService.enqueueMissing();
    if (key === 'startWithWindows') applyLoginItem(text === 'true');
  });

  handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    getMainWindow()?.minimize();
  });

  handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    getMainWindow()?.close();
  });

  handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => getMainWindow()?.isMaximized() ?? false);

  handle(IPC_CHANNELS.APP_SELECT_FILE, async (event, filters?: { name: string; extensions: string[] }[]) => {
    const paths = await askOpenPaths(event, { properties: ['openFile'], filters: filters || DEFAULT_FILE_FILTERS });
    return paths?.[0] ?? null;
  });

  handle(IPC_CHANNELS.APP_SELECT_DIRECTORY, async (event) => {
    const paths = await askOpenPaths(event, { properties: ['openDirectory'] });
    return paths?.[0] ?? null;
  });

  handle(IPC_CHANNELS.APP_RENDERER_READY, () => {
    markRendererReady();
  });

  handle(IPC_CHANNELS.APP_GET_INFO, () => ({ version: app.getVersion(), logsDir: getLogsDir() }));

  handle(IPC_CHANNELS.APP_OPEN_LOGS, async () => {
    const error = await shell.openPath(getLogsDir());
    if (error) throw new Error(`O Windows não abriu a pasta de logs. Ela fica em ${getLogsDir()}.`);
  });

  // Conexão voltou: refaz buscas de artes e envios ao Drive pendentes
  handle(IPC_CHANNELS.APP_NETWORK_ONLINE, async () => {
    artworkService.enqueueMissing();
    await backupService.retryPendingUploads();
  });

  // Atualização automática do aplicativo
  handle(IPC_CHANNELS.UPDATER_CHECK, async () => {
    return await updaterService.checkForUpdates();
  });

  handle(IPC_CHANNELS.UPDATER_STATUS, () => {
    return updaterService.getStatus();
  });

  handle(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL, () => {
    updaterService.quitAndInstall();
  });
}
