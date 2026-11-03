import { existsSync } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { basename, dirname, join, normalize } from 'path';
import { createHash } from 'crypto';
import { DEFAULT_EMULATOR_PROFILES } from '@shared/constants/emulators';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

// Pastas que geralmente não são jogos standalone (emuladores, BIOS, ferramentas, etc.)
const IGNORED_DIRECTORY_PATTERNS = [
  /^(dolphin|ryujinx|cemu|pcsx2|rpcs3|duckstation|retroarch|mgba|melonds|lime3ds|azahar|citra|yuzu|eden|suyu|citron|sudachi|ppsspp|emuhawk|bizhawk)/i,
  /^(roms|roms\s|.*_bios|_temp|_internal|commonredist|redist|\.git|\$recycle\.bin)/i,
  /^(steam|steamlibrary|epic games|gog games|gog galaxy|xboxgames|riot games)$/i,
  /\b(co-?op|trainer|mods?)\b/i
];

// Arquivos executáveis auxiliares que NÃO são o executável do jogo
const IGNORED_EXECUTABLE_PATTERNS = [
  /^unins\w*\.exe$/i,
  /^uninstall\w*\.exe$/i,
  /^unitycrashhandler\w*\.exe$/i,
  /^crashreport\w*\.exe$/i,
  /^crashpad_handler\w*\.exe$/i,
  /^dxwebsetup\w*\.exe$/i,
  /^vc_?redist\w*\.exe$/i,
  /^dotnetfx\w*\.exe$/i,
  /^directx\w*\.exe$/i,
  /^oalinst\w*\.exe$/i,
  /^easyanticheat\w*\.exe$/i,
  /^battleye\w*\.exe$/i,
  /^7z\w*\.exe$/i,
  /setup|instal|updater/i,
  /^(gerar|build|compile)/i,
  /^(ffmpeg|ffplay|ffprobe|cmake)/i
];

const EMULATOR_EXECUTABLES = new Set(Object.values(DEFAULT_EMULATOR_PROFILES).flatMap((p) => p.defaultExecutableNames.map((n) => n.toLowerCase())));
const COMMON_GAME_FOLDERS = ['Games', 'Jogos'];

// Onde quase todo mundo deixa jogo solto, em cada disco: não depende de configurar pasta nenhuma
export function commonGameFolders(): string[] {
  const folders: string[] = [];
  for (let code = 67; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`;
    if (existsSync(drive)) folders.push(...COMMON_GAME_FOLDERS.map((name) => join(drive, name)));
  }
  return folders;
}

interface ScoredExecutable {
  path: string;
  score: number;
}

// Usa o nome expressivo do executável, quando ele tem um
function titleFromExecutable(exePath: string): string | null {
  const exeBase = basename(exePath).replace(/\.[^/.]+$/, '').trim();
  const genericExeNames = new Set(['game', 'jogar', 'launcher', 'app', 'main', 'run', 'start', 'play', 'client', 'shipping', '2ship', 'soh', 'tmc_pc']);
  
  // Se o executável tem um nome expressivo e descritivo (ex: "Link's Awakening DX HD" ou "God of War III")
  if (
    exeBase.length > 3 &&
    !genericExeNames.has(exeBase.toLowerCase()) &&
    !/^jogar[-_ ]/i.test(exeBase) &&
    !/^\w{1,3}\d?$/i.test(exeBase)
  ) {
    return exeBase
      .replace(/[-_]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return null;
}

// Limpa o nome da pasta
function titleFromFolder(folderName: string): string {
  return folderName
    .replace(/[-_]+/g, ' ')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s*v\d+.*$/i, '')
    .replace(/\s+(pc|port)$/i, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || folderName;
}

// Port baixado como repositório: o README tem o nome de verdade ("God of War: Ascension — port nativo"), a pasta só abrevia
async function titleFromReadme(gameDir: string, folderTitle: string): Promise<string | null> {
  const text = await readFile(join(gameDir, 'README.md'), 'utf-8').catch(() => '');
  const heading = /^#\s+(.+)$/m.exec(text)?.[1].split(/\s+[—–-]\s+/)[0].trim();
  if (!heading || heading.length > 60) return null;
  const words = folderTitle.toLowerCase().split(/\s+/).filter((word) => word.length >= 4);
  return words.some((word) => heading.toLowerCase().includes(word)) ? heading : null;
}

// Varre até 2 níveis de profundidade procurando o melhor executável/script
async function findBestExecutableInGameDir(gameDir: string): Promise<string | null> {
  const candidates: ScoredExecutable[] = [];

  async function inspectDir(currentDir: string, depth: number) {
    if (depth > 2) return;

    try {
      const entries = await readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory()) {
          const lowerName = entry.name.toLowerCase();
          if (
            !lowerName.startsWith('.') &&
            !lowerName.startsWith('_') &&
            lowerName !== 'redist' &&
            lowerName !== 'commonredist'
          ) {
            await inspectDir(fullPath, depth + 1);
          }
          continue;
        }

        if (!entry.isFile()) continue;

        const lowerName = entry.name.toLowerCase();
        const ext = lowerName.substring(lowerName.lastIndexOf('.'));
        if (ext !== '.exe' && ext !== '.bat' && ext !== '.cmd') continue;

        // Ignora desinstaladores e crash handlers
        if (EMULATOR_EXECUTABLES.has(lowerName) || IGNORED_EXECUTABLE_PATTERNS.some((pattern) => pattern.test(lowerName))) {
          continue;
        }

        let score = 0;
        const nameWithoutExt = lowerName.replace(/\.[^/.]+$/, '');
        const folderLower = basename(gameDir).toLowerCase().replace(/[-_]+/g, '');

        // Batches explícitos de lançamento (muito comum em ports e repacks: "Jogar-GOW3.bat", "Play.bat")
        if (ext === '.bat' || ext === '.cmd') {
          if (/^(jogar|play|start|launch)/i.test(nameWithoutExt)) {
            score += 1500;
          } else {
            score += 600;
          }
        } else if (ext === '.exe') {
          // Executáveis com prefixo de jogo
          if (/^(play|launch|start)\b/i.test(nameWithoutExt)) {
            score += 1000;
          }

          // Executável com nome similar ao nome da pasta do jogo
          if (nameWithoutExt.length > 2 && folderLower.includes(nameWithoutExt.replace(/[-_ ]+/g, ''))) {
            score += 800;
          }

          // Arquivos na raiz do diretório do jogo ganham prioridade sobre subpastas
          if (depth === 0) {
            score += 300;
          } else if (depth === 1) {
            score += 100;
          }

          // Tamanho do arquivo: executáveis reais de jogos normalmente são maiores que wrappers
          try {
            const fileStat = await stat(fullPath);
            const sizeInMb = fileStat.size / (1024 * 1024);
            score += Math.min(Math.round(sizeInMb), 250);
          } catch {
            // Ignora erro de stat
          }
        }

        candidates.push({ path: fullPath, score });
      }
    } catch {
      // Ignora erro de acesso a diretório específico
    }
  }

  await inspectDir(gameDir, 0);

  if (candidates.length === 0) return null;

  // Ordena por maior pontuação
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].path;
}

export function createStandaloneScanner(getDirectories: () => string[]): PlatformScanner {
  return {
    platform: 'standalone',

    async scan(): Promise<PlatformScanResult> {
      const directories = getDirectories();
      const warnings: string[] = [];
      const games = new Map<string, DetectedGame>();

      for (const rootDir of directories) {
        if (!rootDir || !existsSync(rootDir)) {
          continue;
        }

        try {
          const entries = await readdir(rootDir, { withFileTypes: true });

          for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const folderName = entry.name;

            // Ignora pastas que reconhecidamente não são jogos standalone
            if (IGNORED_DIRECTORY_PATTERNS.some((pattern) => pattern.test(folderName))) {
              continue;
            }

            const gameDir = join(rootDir, folderName);
            const executablePath = await findBestExecutableInGameDir(gameDir);

            if (!executablePath) {
              continue;
            }

            // ID determinístico baseado no caminho normalizado do executável
            const normalizedExe = normalize(executablePath).toLowerCase();
            const hash = createHash('sha1').update(normalizedExe).digest('hex').slice(0, 12);
            const id = `standalone-${hash}`;

            if (games.has(id)) continue;

            const folderTitle = titleFromFolder(folderName);
            const title = titleFromExecutable(executablePath) ?? (await titleFromReadme(gameDir, folderTitle)) ?? folderTitle;
            const workingDirectory = normalize(dirname(executablePath));
            const installPath = normalize(gameDir);

            games.set(id, {
              id,
              title,
              platform: 'standalone',
              executablePath: normalize(executablePath),
              workingDirectory,
              installPath
            });
          }
        } catch (err) {
          warnings.push(`Standalone: falha ao varrer pasta ${rootDir} (${(err as Error).message})`);
        }
      }

      console.log(`[Scanner:Standalone] ${games.size} jogos soltos encontrados`);
      return { games: [...games.values()], warnings };
    }
  };
}
