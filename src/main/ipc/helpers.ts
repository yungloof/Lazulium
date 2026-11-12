import { BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, OpenDialogOptions, SaveDialogOptions } from 'electron';
import { writeFile } from 'fs/promises';
import { Game } from '@shared/types/game';
import { IpcChannel } from '@shared/constants/ipc-channels';
import { db } from '../database/db';
import { isTrustedSender } from '../security';

export type WindowGetter = () => BrowserWindow | null;

// Erros do sistema (arquivo, rede) chegam ao jogador em português e sem jargão;
// mensagens que os serviços já escrevem para o jogador passam intactas.
function systemErrorMessage(err: NodeJS.ErrnoException): string | undefined {
  const where = err.path ? `: ${err.path}` : '';
  switch (err.code) {
    case 'ENOENT':
      return `Arquivo ou pasta não encontrado${where}. Ele pode ter sido movido ou apagado.`;
    case 'EACCES':
    case 'EPERM':
      return `O Windows não deixou acessar${where || ' o arquivo'}. Feche programas que estejam usando o arquivo ou escolha outra pasta.`;
    case 'EBUSY':
      return `O arquivo está em uso por outro programa${where}. Feche-o e tente de novo.`;
    case 'ENOSPC':
      return 'O disco está cheio. Libere espaço e tente de novo.';
    case 'EROFS':
      return `Essa pasta é somente leitura${where}. Escolha outra.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'ETIMEDOUT':
    case 'ENETUNREACH':
      return 'Não foi possível conectar. Verifique a internet e tente de novo.';
    default:
      return undefined;
  }
}

export function toUserError(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(typeof err === 'string' && err ? err : 'Algo deu errado. Tente de novo.');
  const system = err as NodeJS.ErrnoException;
  const cause = (err as { cause?: NodeJS.ErrnoException }).cause;
  const friendly =
    (system.syscall && systemErrorMessage(system)) ||
    (err.name === 'TimeoutError' || err.name === 'AbortError'
      ? 'O serviço demorou demais para responder. Tente de novo em instantes.'
      : err.message === 'fetch failed'
        ? (cause && systemErrorMessage(cause)) || 'Não foi possível conectar. Verifique a internet e tente de novo.'
        : undefined);
  return friendly ? new Error(friendly) : err;
}

// ipcMain.handle com tradução dos erros do sistema. O erro original fica no log para diagnóstico.
export function handle<Args extends unknown[], Result>(
  channel: IpcChannel,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => Result | Promise<Result>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    // Só a interface do próprio app (quadro principal da janela) chama o IPC
    if (!isTrustedSender(event)) {
      console.warn(`[Segurança] IPC ${channel} recusado: chamada de fora da interface do Lazulium`);
      throw new Error('Ação não permitida.');
    }
    try {
      return await handler(event, ...(args as Args));
    } catch (err) {
      const friendly = toUserError(err);
      if (friendly !== err) console.warn(`[IPC] ${channel}:`, err);
      throw friendly;
    }
  });
}

export function requireGame(gameId: string): Game {
  const game = db.getGameById(gameId);
  if (!game) throw new Error('Jogo não encontrado. Ele pode ter sido removido da biblioteca.');
  return game;
}

// Diálogos ficam presos à janela que pediu (modal de verdade, sem cair atrás do app)
function dialogParent(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow();
}

export async function askSavePath(event: IpcMainInvokeEvent, options: SaveDialogOptions): Promise<string | null> {
  const win = dialogParent(event);
  const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  return res.canceled || !res.filePath ? null : res.filePath;
}

// Caminhos escolhidos, ou null se o jogador cancelou
export async function askOpenPaths(event: IpcMainInvokeEvent, options: OpenDialogOptions): Promise<string[] | null> {
  const win = dialogParent(event);
  const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths;
}

// Pergunta onde salvar e grava o texto (montado só depois da escolha). Caminho salvo, ou null se cancelou.
export async function saveTextAs(
  event: IpcMainInvokeEvent,
  options: SaveDialogOptions,
  build: (path: string) => string | Promise<string>
): Promise<string | null> {
  const path = await askSavePath(event, options);
  if (!path) return null;
  await writeFile(path, await build(path), 'utf-8');
  return path;
}

// Nome de arquivo válido no Windows a partir de um título de jogo
export function safeFileName(name: string, fallback: string): string {
  const clean = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/, '')
    .trim();
  return clean || fallback;
}

// Caminho digitado ou colado ("Copiar como caminho" do Explorador vem entre aspas)
export function cleanPath(path: string | undefined): string | undefined {
  const trimmed = path?.trim().replace(/^"(.*)"$/, '$1').trim();
  if (!trimmed) return undefined;
  // Tira barras do fim, menos da raiz do disco (C:\)
  return /^[a-z]:[\\/]?$/i.test(trimmed) ? trimmed : trimmed.replace(/[\\/]+$/, '');
}
