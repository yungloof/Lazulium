import { app, desktopCapturer, globalShortcut, NativeImage, Notification, screen } from 'electron';
import { execFile } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { ScreenshotTaken } from '@shared/types/screenshots';
import { db } from '../../database/db';

// Quadro direto da tela: o mesmo pixel do jogo, em PNG sem perda. Um fluxo de vídeo seria instantâneo, mas
// comprime as cores (medido: só 18% dos pixels iguais); este leva cerca de 0,5 s e sai idêntico.
const HOTKEY_SETTING = 'screenshotHotkey';
export const DEFAULT_SCREENSHOT_HOTKEY = 'Control+F12'; // F12 e Print Screen já ficam com a Steam e o Windows
const THUMB_WIDTH = 480;
const THUMB_QUALITY = 85;
const FOREGROUND_TIMEOUT_MS = 3_000;
const BLACK_FRAME_BRIGHTNESS = 2;
const SILENT_MODE = process.env.LAZULIUM_SILENT === '1';

// Janela em primeiro plano, em pixels físicos
const FOREGROUND_SCRIPT = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class LazuliumForeground {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static string Read() {
    SetProcessDPIAware();
    var h = GetForegroundWindow(); Rect r; uint pid;
    GetWindowThreadProcessId(h, out pid); GetWindowRect(h, out r);
    return pid + " " + r.L + " " + r.T + " " + r.R + " " + r.B;
  }
}
"@
[LazuliumForeground]::Read()
`;

interface ForegroundWindow {
  pid: number;
  rect: { x: number; y: number; width: number; height: number };
}

function readForegroundWindow(): Promise<ForegroundWindow | null> {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', FOREGROUND_SCRIPT], { timeout: FOREGROUND_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
      const parts = err ? [] : stdout.trim().split(/\s+/).map(Number);
      if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) return resolve(null);
      const [pid, left, top, right, bottom] = parts;
      resolve({ pid, rect: { x: left, y: top, width: right - left, height: bottom - top } });
    });
  });
}

function isBlackFrame(image: NativeImage): boolean {
  const bitmap = image.toBitmap();
  let sum = 0;
  let samples = 0;
  for (let i = 0; i < bitmap.length; i += 4 * 211) {
    sum += bitmap[i] + bitmap[i + 1] + bitmap[i + 2];
    samples += 3;
  }
  return samples > 0 && sum / samples < BLACK_FRAME_BRIGHTNESS;
}

const physicalBounds = (display: Electron.Display) => screen.dipToScreenRect(null, display.bounds);

// Lembra: os arquivos entram na galeria do jogo como capturas anexadas (screenshots.service)
function gameFolder(gameId: string): string {
  return join(app.getPath('userData'), 'screenshots', gameId.replace(/[^a-z0-9._-]/gi, '_'));
}

function fileStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

type TakenListener = (result: ScreenshotTaken) => void;

class ScreenshotCaptureService {
  private registeredKey: string | null = null;
  private runningGames = new Set<string>();
  private pidsOf: (gameId: string) => number[] = () => [];
  private listener: TakenListener = () => {};
  private capturing = false;

  setListener(listener: TakenListener): void {
    this.listener = listener;
  }

  setPidProvider(provider: (gameId: string) => number[]): void {
    this.pidsOf = provider;
  }

  getHotkey(): string {
    return db.getSettings()[HOTKEY_SETTING] || DEFAULT_SCREENSHOT_HOTKEY;
  }

  // A tecla só fica presa com um jogo aberto: fora dele, ela continua sendo de quem usa o PC
  private refreshHotkey(): boolean {
    const wanted = this.runningGames.size > 0 && this.getHotkey() !== 'off' ? this.getHotkey() : null;
    if (wanted === this.registeredKey) return true;
    if (this.registeredKey) globalShortcut.unregister(this.registeredKey);
    this.registeredKey = null;
    if (!wanted) return true;
    const ok = globalShortcut.register(wanted, () => void this.captureRunningGame());
    if (ok) this.registeredKey = wanted;
    else console.warn(`[Capturas] A tecla ${wanted} já está em uso por outro programa`);
    return ok;
  }

  setHotkey(key: string): { ok: boolean } {
    db.setSetting(HOTKEY_SETTING, key);
    if (this.registeredKey) globalShortcut.unregister(this.registeredKey);
    this.registeredKey = null;
    if (key === 'off') return { ok: true };
    // Testa agora, para avisar na hora em vez de falhar no meio do jogo
    if (this.runningGames.size === 0) {
      const free = globalShortcut.register(key, () => undefined);
      if (free) globalShortcut.unregister(key);
      return { ok: free };
    }
    return { ok: this.refreshHotkey() };
  }

  onGameStatus(gameId: string, running: boolean): void {
    if (running) this.runningGames.add(gameId);
    else this.runningGames.delete(gameId);
    this.refreshHotkey();
  }

  private async captureRunningGame(): Promise<void> {
    const gameId = [...this.runningGames].pop();
    if (gameId) await this.capture(gameId).catch((err) => console.warn(`[Capturas] ${(err as Error).message}`));
  }

  async capture(gameId: string): Promise<ScreenshotTaken> {
    const game = db.getGameById(gameId);
    if (!game) throw new Error('Jogo não encontrado.');
    if (this.capturing) throw new Error('Ainda salvando a captura anterior.');
    this.capturing = true;
    try {
      const displays = screen.getAllDisplays();
      const thumbnailSize = {
        width: Math.max(...displays.map((d) => physicalBounds(d).width)),
        height: Math.max(...displays.map((d) => physicalBounds(d).height))
      };
      // Primeiro o quadro: o resto pode demorar sem perder o momento
      const [sources, foreground] = await Promise.all([desktopCapturer.getSources({ types: ['screen'], thumbnailSize }), readForegroundWindow()]);
      if (sources.length === 0) throw new Error('O Windows não entregou a imagem da tela.');

      const center = foreground ? { x: foreground.rect.x + foreground.rect.width / 2, y: foreground.rect.y + foreground.rect.height / 2 } : null;
      const display = center ? displays.find((d) => {
        const b = physicalBounds(d);
        return center.x >= b.x && center.x < b.x + b.width && center.y >= b.y && center.y < b.y + b.height;
      }) ?? screen.getPrimaryDisplay() : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];

      let image = source.thumbnail;
      const bounds = physicalBounds(display);
      const isGameWindow = foreground && this.pidsOf(gameId).includes(foreground.pid);
      // Jogo em janela: só ele. Em tela cheia a janela cobre a tela, e o corte não faz nada.
      if (isGameWindow && foreground && (foreground.rect.width < bounds.width || foreground.rect.height < bounds.height)) {
        const size = image.getSize();
        const x = Math.max(0, foreground.rect.x - bounds.x);
        const y = Math.max(0, foreground.rect.y - bounds.y);
        const width = Math.min(foreground.rect.width, size.width - x);
        const height = Math.min(foreground.rect.height, size.height - y);
        if (width > 0 && height > 0) image = image.crop({ x, y, width, height });
      }

      const blackFrame = isBlackFrame(image);
      const dir = gameFolder(gameId);
      await mkdir(dir, { recursive: true });
      const baseName = `${game.title.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim().slice(0, 60) || 'captura'} ${fileStamp(new Date())}`;
      const { width, height } = image.getSize();
      await writeFile(join(dir, `${baseName}.png`), image.toPNG());
      await writeFile(join(dir, `${baseName}.thumb.jpg`), image.resize({ width: Math.min(THUMB_WIDTH, width), quality: 'best' }).toJPEG(THUMB_QUALITY));

      const result: ScreenshotTaken = {
        gameId,
        gameTitle: game.title,
        fileName: `${baseName}.png`,
        width,
        height,
        warning: blackFrame ? 'A captura saiu preta: esse jogo em tela cheia exclusiva bloqueia a imagem. Troque para "tela cheia sem bordas" nas opções dele.' : undefined
      };
      console.log(`[Capturas] ${game.title}: ${width}x${height}${blackFrame ? ' (preta)' : ''}`);
      this.listener(result);
      if (!SILENT_MODE && Notification.isSupported()) {
        new Notification({ title: blackFrame ? 'Captura saiu preta' : 'Captura salva', body: result.warning ?? `${game.title} · ${width}x${height}`, silent: false }).show();
      }
      return result;
    } finally {
      this.capturing = false;
    }
  }

  stop(): void {
    if (this.registeredKey) globalShortcut.unregister(this.registeredKey);
    this.registeredKey = null;
  }
}

export const screenshotCaptureService = new ScreenshotCaptureService();
