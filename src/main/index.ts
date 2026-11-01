import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { registerIpcHandlers } from './ipc';
import { db } from './database/db';
import { playtimeService } from './services/tracker/playtime.service';
import { registerMediaProtocol, registerMediaScheme } from './services/metadata/media-cache.service';

// Esquema das artes em cache local (precisa ser registrado antes do app ficar pronto)
registerMediaScheme();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    frame: false, // Custom modern titlebar
    backgroundColor: '#090a0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer based on electron-vite cli
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  // Initialize local database
  await db.init();
  registerMediaProtocol();
  playtimeService.recoverInterruptedSessions();

  // Register all typed IPC channels
  registerIpcHandlers(() => mainWindow);

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Contabiliza sessões em andamento e encerra o worker de processos
app.on('before-quit', () => {
  playtimeService.shutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
