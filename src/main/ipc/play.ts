import { shell } from 'electron';
import { statSync } from 'fs';
import { dirname } from 'path';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { db } from '../database/db';
import { playtimeService } from '../services/tracker/playtime.service';
import { buildLaunchScript } from '../services/tracker/launcher.service';
import { playLengthService } from '../services/metadata/play-length.service';
import { setManualPlaytime } from '../services/profile/journal.service';
import { handle, requireGame, safeFileName, saveTextAs } from './helpers';

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

// Execução, tempo de jogo e atalhos
export function registerPlayHandlers(): void {
  handle(IPC_CHANNELS.GAME_LAUNCH, (_event, gameId: string) => playtimeService.launch(gameId));
  handle(IPC_CHANNELS.GAME_STOP, (_event, gameId: string) => playtimeService.stop(gameId));

  handle(IPC_CHANNELS.GAME_OPEN_FOLDER, async (_event, gameId: string) => {
    const game = requireGame(gameId);
    // Emulador: a pasta da ROM. Steam: só a instalação (o executável seria o da própria Steam).
    const isSteamApp = game.platform === 'steam' && !game.id.startsWith('steam-shortcut-');
    const folder = [
      game.romPath && dirname(game.romPath),
      game.installPath,
      !isSteamApp && game.workingDirectory,
      !isSteamApp && game.executablePath && dirname(game.executablePath)
    ].find((path): path is string => !!path && isDirectory(path));
    if (!folder) throw new Error(`Pasta de ${game.title} não encontrada. Ela pode ter sido movida ou apagada: clique em Escanear para atualizar a biblioteca.`);
    const error = await shell.openPath(folder);
    if (error) throw new Error(`O Windows não abriu a pasta de ${game.title}. Tente abrir ${folder} pelo Explorador de Arquivos.`);
  });

  handle(IPC_CHANNELS.GAME_GET_PLAY_LENGTH, (_event, gameId: string) => {
    const game = db.getGameById(gameId);
    return game ? playLengthService.get(game) : null;
  });

  handle(IPC_CHANNELS.GAME_GET_PLAYTIME_SESSIONS, (_event, gameId: string) => db.getPlaytimeSessions(gameId));

  handle(IPC_CHANNELS.GAME_SET_PLAYTIME, (_event, gameId: string, totalSeconds: number, lastPlayedOn?: string) =>
    setManualPlaytime(gameId, totalSeconds, lastPlayedOn)
  );

  handle(IPC_CHANNELS.GAME_EXPORT_BAT, (event, gameId: string) => {
    const game = requireGame(gameId);
    return saveTextAs(
      event,
      { title: 'Salvar atalho .bat', defaultPath: `${safeFileName(game.title, 'jogo')}.bat`, filters: [{ name: 'Script do Windows', extensions: ['bat'] }] },
      () => buildLaunchScript(game)
    );
  });
}
