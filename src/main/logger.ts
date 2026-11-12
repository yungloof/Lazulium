import { app, BrowserWindow } from 'electron';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { format } from 'util';

// Log em arquivo para diagnóstico em PCs de outras pessoas: o que sai no console do main
// (e erros do renderer) também vai para userData/logs/lazulium.log, que o usuário pode enviar.
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const LOG_FILE = 'lazulium.log';

let logPath: string | undefined;

export function getLogsDir(): string {
  return join(app.getPath('userData'), 'logs');
}

function rotateIfNeeded(path: string): void {
  try {
    if (existsSync(path) && statSync(path).size > MAX_LOG_BYTES) {
      const old = `${path}.old`;
      if (existsSync(old)) unlinkSync(old);
      renameSync(path, old);
    }
  } catch {
    // Sem rotação: segue escrevendo
  }
}

function write(level: string, args: unknown[]): void {
  if (!logPath) return;
  try {
    const line = `${new Date().toISOString()} [${level}] ${format(...args)}\n`;
    appendFileSync(logPath, line, 'utf-8');
  } catch {
    // Disco cheio/sem permissão: o app continua funcionando sem log
  }
}

// Chamado depois que a pasta de dados está definida (inclusive a do modo silencioso)
export function setupFileLogging(): void {
  const dir = getLogsDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return;
  }
  logPath = join(dir, LOG_FILE);
  rotateIfNeeded(logPath);

  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      write(level.toUpperCase(), args);
    };
  }

  process.on('uncaughtException', (err) => console.error('[Crash] Exceção não tratada:', err));
  process.on('unhandledRejection', (reason) => console.error('[Crash] Promise rejeitada sem tratamento:', reason));

  write('INFO', [`Lazulium ${app.getVersion()} iniciado (Electron ${process.versions.electron}, ${process.platform} ${process.arch})`]);
}

// Erros da interface e travamentos do renderer também vão para o arquivo
export function attachRendererLogging(win: BrowserWindow): void {
  // Electron 35+: os dados vêm no próprio evento e o nível é texto ('info', 'warning', 'error', 'debug')
  win.webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event;
    if (level === 'warning' || level === 'error') write(level === 'error' ? 'RENDERER-ERROR' : 'RENDERER-WARN', [`${message} (${sourceId}:${lineNumber})`]);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Crash] Interface encerrada:', details.reason, details.exitCode);
  });
}
