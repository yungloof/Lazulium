import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

// Arquivo do banco no disco: leitura tolerante a travas, gravação atômica e cópias diárias.
// Não sabe nada do formato dos dados: quem valida o conteúdo é quem chama.

const BACKUPS_DIR = 'backups';
const MAX_DAILY_BACKUPS = 14;
// Antivírus e indexador do Windows seguram o arquivo por instantes (comum logo depois de ligar o PC)
const LOCK_RETRIES = 6;
const LOCK_RETRY_MS = 150;
const LOCK_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

export const backupsDirOf = (dataFile: string) => join(dirname(dataFile), BACKUPS_DIR);

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const isLockError = (err: unknown) => LOCK_CODES.has((err as NodeJS.ErrnoException)?.code ?? '');

// Lê o arquivo esperando um pouco se outro programa estiver com ele aberto. Erro de trava
// não é corrupção: tratar como corrompido abriria o app com a biblioteca vazia.
export function readTextWithRetry(path: string): string {
  for (let attempt = 0; ; attempt++) {
    try {
      return readFileSync(path, 'utf-8');
    } catch (err) {
      if (!isLockError(err) || attempt >= LOCK_RETRIES) throw err;
      sleepSync(LOCK_RETRY_MS * (attempt + 1));
    }
  }
}

// Grava num temporário, força a ida ao disco e troca de uma vez: queda de energia no meio
// deixa o arquivo antigo inteiro (sem o fsync, o NTFS pode trocar o nome antes dos dados chegarem).
export function writeAtomic(path: string, text: string): void {
  const tmpPath = `${path}.tmp`;
  const fd = openSync(tmpPath, 'w');
  try {
    writeFileSync(fd, text, 'utf-8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmpPath, path);
      return;
    } catch (err) {
      if (!isLockError(err) || attempt >= 2) throw err;
      sleepSync(LOCK_RETRY_MS);
    }
  }
}

// Cópias diárias, da mais recente para a mais antiga
export function listDailyBackups(dataFile: string): string[] {
  const dir = backupsDirOf(dataFile);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .map((f) => join(dir, f));
}

// Uma cópia por dia antes da primeira gravação do dia, mantendo as últimas MAX_DAILY_BACKUPS.
// Retorna o dia já garantido, para não consultar o disco a cada gravação.
export function ensureDailyBackup(dataFile: string, lastDay?: string): string | undefined {
  const day = new Date().toISOString().slice(0, 10);
  if (day === lastDay) return day;
  if (!existsSync(dataFile)) return lastDay;
  const dir = backupsDirOf(dataFile);
  const today = join(dir, `lazulium_db-${day}.json`);
  try {
    if (!existsSync(today)) {
      mkdirSync(dir, { recursive: true });
      copyFileSync(dataFile, today);
      for (const old of listDailyBackups(dataFile).slice(MAX_DAILY_BACKUPS)) unlinkSync(old);
    }
    return day;
  } catch (err) {
    console.warn('[Database] Falha na cópia diária:', err);
    return lastDay;
  }
}
