import { shell } from 'electron';
import { spawn, execFile } from 'child_process';
import { existsSync } from 'fs';
import { dirname, extname } from 'path';
import { Game } from '@shared/types/game';

// Falha já explicada para o jogador (a mensagem vai direto para a interface)
export class LaunchError extends Error {}

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
  if (game.launchMode === 'launcher') return true;
  if (game.id.startsWith('steam-shortcut-') && game.executablePath && existsSync(game.executablePath)) return false;
  return true;
}

function splitArguments(commandLine: string): string[] {
  if (!commandLine || !commandLine.trim()) return [];
  const matches = commandLine.match(/(?:[^\s"]+|"[^"]*")+/g);
  // Tira também as aspas do meio (--rom="C:\\a b"): o Node já coloca as necessárias ao abrir o processo
  return matches ? matches.map((m) => m.replace(/"/g, '')) : [];
}

const COMMAND_TIMEOUT_MS = 60_000;

// Protocolos das lojas que os scanners usam para abrir jogos. Qualquer outro (file:, ms-*, search-ms: e afins)
// entregaria ao Windows um endereço capaz de rodar programas: o jogo é aberto pelo executável ou recusado.
const LAUNCH_URI_SCHEMES = new Set(['steam:', 'com.epicgames.launcher:', 'goggalaxy:', 'uplay:', 'battlenet:', 'origin:', 'origin2:', 'eadm:']);

export function isAllowedLaunchUri(uri: string | undefined): boolean {
  if (!uri) return false;
  try {
    return LAUNCH_URI_SCHEMES.has(new URL(uri).protocol.toLowerCase());
  } catch {
    return false;
  }
}

// "CHAVE=valor" por linha; linhas vazias, comentários (#) e nomes inválidos são ignorados
export function parseLaunchEnv(text: string | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of (text ?? '').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

// Comando do jogador (pré-lançamento ou pós-fechamento): roda escondido pelo cmd, com limite de tempo
export function runGameCommand(command: string | undefined, game: Game, label: string): Promise<void> {
  const clean = command?.trim();
  if (!clean) return Promise.resolve();
  const cwd = game.workingDirectory && existsSync(game.workingDirectory) ? game.workingDirectory : game.executablePath ? dirname(game.executablePath) : undefined;
  return new Promise((resolve) => {
    execFile('cmd.exe', ['/d', '/s', '/c', '"' + clean + '"'], { cwd, windowsHide: true, windowsVerbatimArguments: true, timeout: COMMAND_TIMEOUT_MS, env: { ...process.env, ...parseLaunchEnv(game.launchEnv) } }, (err) => {
      if (err) console.warn(`[Launcher] ${label} de ${game.title} falhou: ${err.message}`);
      else console.log(`[Launcher] ${label} de ${game.title} concluído`);
      resolve();
    });
  });
}

// Texto de um .bat que repete a abertura do jogo, para usar fora do Lazulium
export function buildLaunchScript(game: Game): string {
  const exe = game.executablePath ?? '';
  const args = (game.customLaunchArguments ?? game.launchArguments)?.trim() ?? '';
  const cwd = game.workingDirectory || (exe ? dirname(exe) : '');
  const lines = ['@echo off', `rem ${game.title} (gerado pelo Lazulium)`];
  if (cwd) lines.push(`cd /d "${cwd}"`);
  for (const [key, value] of Object.entries(parseLaunchEnv(game.launchEnv))) lines.push(`set "${key}=${value}"`);
  if (game.preLaunchCommand?.trim()) lines.push(game.preLaunchCommand.trim());
  const target = game.launchUri && !exe ? game.launchUri : `"${exe}"${args ? ' ' + args : ''}`;
  lines.push(game.postExitCommand?.trim() ? `start "" /wait ${target}` : `start "" ${target}`);
  if (game.postExitCommand?.trim()) lines.push(game.postExitCommand.trim());
  return lines.join('\r\n') + '\r\n';
}

function spawnDetached(game: Game): Promise<number> {
  const exe = game.executablePath;
  const rawArgs = (game.customLaunchArguments ?? game.launchArguments)?.trim() ?? '';
  const cwd = game.workingDirectory && existsSync(game.workingDirectory) ? game.workingDirectory : dirname(exe);
  const env = { ...process.env, ...parseLaunchEnv(game.launchEnv) };
  const isScript = ['.bat', '.cmd'].includes(extname(exe).toLowerCase());

  // Scripts (.bat/.cmd) rodam via cmd.exe. Executáveis normais recebem argumentos separados para evitar corrupção de aspas no Windows.
  const child = isScript
    ? spawn('cmd.exe', ['/d', '/s', '/c', `""${exe}"${rawArgs ? ' ' + rawArgs : ''}"`], {
        cwd,
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: true,
        env
      })
    : spawn(exe, splitArguments(rawArgs), {
        cwd,
        detached: true,
        stdio: 'ignore',
        env
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
  await runGameCommand(game.preLaunchCommand, game, 'Comando antes de abrir');
  const launchedAt = Date.now();

  if (shouldUseUri(game)) {
    if (!isAllowedLaunchUri(game.launchUri)) {
      throw new LaunchError(`${game.title} tem um endereço de abertura que o Lazulium não aceita. Edite o jogo e escolha o executável.`);
    }
    await shell.openExternal(game.launchUri!);
    console.log(`[Launcher] ${game.title} via URI ${game.launchUri}`);
    return { method: 'uri', launchedAt };
  }

  if (!game.executablePath) {
    throw new LaunchError(`${game.title} não tem um executável definido. Edite o jogo e escolha o arquivo que abre ele.`);
  }
  if (!existsSync(game.executablePath)) {
    throw new LaunchError(`O executável de ${game.title} não está mais em ${game.executablePath}. Ele pode ter sido movido ou apagado: clique em Escanear ou edite o jogo.`);
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
