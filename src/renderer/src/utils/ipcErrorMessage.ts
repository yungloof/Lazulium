// Remove o prefixo que o Electron adiciona em erros lançados por handlers IPC
export function ipcErrorMessage(err: unknown): string {
  return ((err as Error)?.message ?? String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
