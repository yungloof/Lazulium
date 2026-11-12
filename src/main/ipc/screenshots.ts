import { clipboard, ClipboardItem, nativeImage, shell } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { Game } from '@shared/types/game';
import { db } from '../database/db';
import { screenshotsService } from '../services/metadata/screenshots.service';
import { screenshotCaptureService } from '../services/metadata/screenshot-capture.service';
import { askOpenPaths, handle, requireGame } from './helpers';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

async function requireScreenshotPath(game: Game, screenshotId: string): Promise<string> {
  const path = await screenshotsService.resolvePath(game, screenshotId);
  if (!path) throw new Error('Essa captura não existe mais: abra a galeria de novo.');
  return path;
}

export function registerScreenshotHandlers(): void {
  handle(IPC_CHANNELS.SCREENSHOTS_LIST, (_event, gameId: string) => screenshotsService.list(requireGame(gameId)));
  handle(IPC_CHANNELS.SCREENSHOTS_BY_GAME, () => screenshotsService.listByGame(db.getGames().filter((g) => !g.isHidden)));

  handle(IPC_CHANNELS.SCREENSHOTS_IMPORT, async (event, gameId: string) => {
    const game = requireGame(gameId);
    const paths = await askOpenPaths(event, {
      title: `Anexar capturas a ${game.title}`,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagens', extensions: IMAGE_EXTENSIONS }]
    });
    return paths ? screenshotsService.importFiles(game, paths) : 0;
  });

  handle(IPC_CHANNELS.SCREENSHOTS_DELETE, async (_event, gameId: string, screenshotId: string) => {
    await screenshotsService.deleteScreenshot(requireGame(gameId), screenshotId);
  });

  handle(IPC_CHANNELS.SCREENSHOTS_MOVE, async (_event, fromGameId: string, screenshotIds: string[], toGameId: string) => {
    await screenshotsService.move(requireGame(fromGameId), screenshotIds, requireGame(toGameId));
  });

  handle(IPC_CHANNELS.SCREENSHOTS_TAKE, (_event, gameId: string) => screenshotCaptureService.capture(requireGame(gameId).id));
  handle(IPC_CHANNELS.SCREENSHOTS_GET_HOTKEY, () => screenshotCaptureService.getHotkey());
  handle(IPC_CHANNELS.SCREENSHOTS_SET_HOTKEY, (_event, key: string) => screenshotCaptureService.setHotkey(key));

  handle(IPC_CHANNELS.SCREENSHOTS_COPY, async (_event, gameId: string, screenshotId: string) => {
    const image = nativeImage.createFromPath(await requireScreenshotPath(requireGame(gameId), screenshotId));
    if (image.isEmpty()) throw new Error('Não foi possível ler essa imagem. Use Mostrar na pasta para abrir o arquivo.');
    // API da área de transferência no modelo W3C (Electron 44+): a imagem vai como PNG
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })]);
  });

  handle(IPC_CHANNELS.SCREENSHOTS_SHOW_IN_FOLDER, async (_event, gameId: string, screenshotId: string) => {
    shell.showItemInFolder(await requireScreenshotPath(requireGame(gameId), screenshotId));
  });
}
