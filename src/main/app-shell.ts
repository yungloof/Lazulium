import { app, BrowserWindow, Menu, Notification, nativeImage, shell, Tray } from 'electron';
import { join } from 'path';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { TrayAction } from '@shared/types/ipc';
import { db } from './database/db';
import { attachRendererLogging } from './logger';

// Janela escondida na bandeja é destruída depois deste tempo para liberar a RAM do renderer
const HIDDEN_DESTROY_MS = 60_000;
export const HIDDEN_LAUNCH_ARG = '--hidden';
const APP_USER_MODEL_ID = 'com.lazulium.app';
// Testes automatizados: janela nunca aparece, sem bandeja/notificações (LAZULIUM_SILENT=1)
export const SILENT_MODE = process.env.LAZULIUM_SILENT === '1';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let destroyTimer: NodeJS.Timeout | undefined;
let rendererReady = false;
let pendingTrayActions: TrayAction[] = [];
let trayHintShown = false;

// Em produção os ícones ficam em resources/ (extraResources do electron-builder)
function resourcePath(file: string): string {
  return app.isPackaged ? join(process.resourcesPath, file) : join(app.getAppPath(), 'resources', file);
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setQuitting(): void {
  isQuitting = true;
}

export function shouldCloseToTray(): boolean {
  return db.getSettings().closeToTray !== 'false';
}

function createWindow(show: boolean): BrowserWindow {
  rendererReady = false;
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    frame: false, // Custom modern titlebar
    backgroundColor: '#090a0f',
    icon: resourcePath('icon.ico'),
    // Modo silencioso: janela "exibida" (para renderizar e permitir capturas) mas invisível,
    // fora da tela, sem foco e fora da barra de tarefas
    ...(SILENT_MODE ? { x: -32000, y: -32000, opacity: 0, focusable: false, skipTaskbar: true } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: !SILENT_MODE
    }
  });

  attachRendererLogging(win);

  win.on('ready-to-show', () => {
    if (!show) return;
    if (SILENT_MODE) win.showInactive();
    else win.show();
  });

  win.on('close', (event) => {
    if (isQuitting || !shouldCloseToTray()) return;
    event.preventDefault();
    hideToTray();
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    rendererReady = false;
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer based on electron-vite cli
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow = win;
  return win;
}

export function showMainWindow(): BrowserWindow {
  clearTimeout(destroyTimer);
  if (!mainWindow) return createWindow(true);
  if (SILENT_MODE) return mainWindow;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

function hideToTray(): void {
  if (!mainWindow) return;
  mainWindow.hide();
  if (!trayHintShown) {
    trayHintShown = true;
    notify('Lazulium continua aberto', 'O rastreador de horas e os backups seguem rodando na bandeja do sistema.');
  }
  clearTimeout(destroyTimer);
  destroyTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.destroy();
  }, HIDDEN_DESTROY_MS);
}

// Chamado pelo renderer depois de registrar os ouvintes (a janela pode ter acabado de ser criada)
export function markRendererReady(): void {
  rendererReady = true;
  const actions = pendingTrayActions;
  pendingTrayActions = [];
  for (const action of actions) mainWindow?.webContents.send(IPC_CHANNELS.APP_TRAY_ACTION, action);
}

function sendTrayAction(action: TrayAction): void {
  const win = showMainWindow();
  if (rendererReady) win.webContents.send(IPC_CHANNELS.APP_TRAY_ACTION, action);
  else pendingTrayActions.push(action);
}

export function createTray(): void {
  if (tray || SILENT_MODE) return;
  tray = new Tray(nativeImage.createFromPath(resourcePath('tray.ico')));
  tray.setToolTip('Lazulium');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Lazulium', click: () => showMainWindow() },
      { type: 'separator' },
      { label: 'Escanear Biblioteca', click: () => sendTrayAction('scan') },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() }
    ])
  );
  tray.on('click', () => showMainWindow());
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

// Notificação nativa só quando o usuário não está olhando para o app
export function notify(title: string, body: string): void {
  if (SILENT_MODE || !Notification.isSupported()) return;
  if (mainWindow?.isVisible() && mainWindow.isFocused()) return;
  const notification = new Notification({ title, body, icon: resourcePath('icon.png') });
  notification.on('click', () => showMainWindow());
  notification.show();
}

export function setupAppIdentity(): void {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

// "Iniciar com o Windows": abre direto na bandeja
export function applyLoginItem(enabled: boolean): void {
  if (!app.isPackaged) {
    console.log('[AppShell] Iniciar com o Windows só é aplicado na versão instalada.');
    return;
  }
  // Na versão portátil o executável real é o .exe que o usuário baixou, não a cópia temporária
  const exePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  app.setLoginItemSettings({ openAtLogin: enabled, path: exePath, args: [HIDDEN_LAUNCH_ARG] });
}

export function startApp(startHidden: boolean): void {
  createTray();
  if (!startHidden || !shouldCloseToTray()) createWindow(true);
}
