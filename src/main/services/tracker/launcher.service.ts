import { shell } from 'electron';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, extname } from 'path';
import { Game } from '@shared/types/game';

export interface LaunchHandle {
  method: 'uri' | 'spawn';
  pid?: number;                     // Apenas para 'spawn' (processo raiz)
  launchedAt: number;               // epoch ms
}

// O GOG Galaxy só abre a página do jogo via `goggalaxy://openGameView`, sem iniciar.
// Como os jogos GOG são DRM-free, o executável direto é a melhor opção.
// Emuladores e atalhos não-Steam cujo executável já existe no disco também abrem direto,
// evitando que a Steam intercepte e falhe com "Configuração do jogo indisponível".
function shouldUseUri(game: Game): boolean {
  if (!game.launchUri) return false;
  if (game.platform === 'gog' && game.executablePath && existsSync(game.executablePath)) return false;
  if (game.platform === 'emulator' && game.executablePath && existsSync(game.executablePath)) return false;
  if (game.id.startsWith('steam-shortcut-') && game.executablePath && existsSync(game.executablePath)) return false;
  return true;
}

function splitArguments(commandLine: string): string[] {
  if (!commandLine || !commandLine.trim()) return [];
  const matches = commandLine.match(/(?:[^\s"]+|"[^"]*")+/g);
  return matches ? matches.map((m) => m.replace(/^"|"$/g, '')) : [];
}

function spawnDetached(game: Game): Promise<number> {
  const exe = game.executablePath;
  const rawArgs = game.launchArguments?.trim() ?? '';
  const cwd = game.workingDirectory && existsSync(game.workingDirectory) ? game.workingDirectory : dirname(exe);
  const isScript = ['.bat', '.cmd'].includes(extname(exe).toLowerCase());

  // Scripts (.bat/.cmd) rodam via cmd.exe. Executáveis normais recebem argumentos separados para evitar corrupção de aspas no Windows.
  const child = isScript
    ? spawn('cmd.exe', ['/d', '/s', '/c', `""${exe}"${rawArgs ? ' ' + rawArgs : ''}"`], {
        cwd,
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: true
      })
    : spawn(exe, splitArguments(rawArgs), {
        cwd,
        detached: true,
        stdio: 'ignore'
      });

  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      if (child.pid === undefined) reject(new Error('Processo iniciado sem PID'));
      else resolve(child.pid);
    });
  });
}

export async function launchGame(game: Game): Promise<LaunchHandle> {
  const launchedAt = Date.now();

  if (shouldUseUri(game)) {
    await shell.openExternal(game.launchUri!);
    console.log(`[Launcher] ${game.title} via URI ${game.launchUri}`);
    return { method: 'uri', launchedAt };
  }

  if (!game.executablePath || !existsSync(game.executablePath)) {
    throw new Error(`Executável não encontrado: ${game.executablePath || '(vazio)'}`);
  }

  const pid = await spawnDetached(game);

  // O lançador (Riot Client, explorer.exe) segue vivo ou morre logo: o processo dele não é o jogo.
  // Sem PID raiz, o monitor espera o jogo aparecer na pasta de instalação (como num lançamento por URI).
  if (game.opensViaLauncher) {
    console.log(`[Launcher] ${game.title} via lançador (PID ${pid}), rastreando pela pasta do jogo`);
    return { method: 'uri', launchedAt };
  }

  console.log(`[Launcher] ${game.title} via spawn (PID ${pid})`);
  return { method: 'spawn', pid, launchedAt };
}
