import { BrowserWindow, screen, session } from 'electron';
import { SILENT_MODE } from '../../app-shell';
import { callOverlayHtml } from './call-overlay-page';

// Janela da "tela doida": transparente, sem borda, por cima de tudo, na tela onde está o mouse.
// Uma de cada vez; a página responde mudando o título (lazulium-answer:...), e a janela fecha sozinha no prazo.

export type OverlayAnswer = 'yes' | 'no' | 'none';

const AVATAR_URL = /^https:\/\/avatars\.(steamstatic|akamai\.steamstatic|cloudflare\.steamstatic)\.com\/[\w\-./]+$/i;
const LIFE_SECONDS = 30;
const SAFETY_MARGIN_MS = 5_000;

let current: { win: BrowserWindow; callId: string } | null = null;

// Sessão própria, só em memória: a política da interface (só scripts do app) não vale aqui, e a página não recebe
// nenhuma permissão (câmera, notificações, nada)
const PARTITION = 'lazulium-call-overlay';
let sessionReady = false;
function overlaySession() {
  const target = session.fromPartition(PARTITION);
  if (!sessionReady) {
    target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    target.setPermissionCheckHandler(() => false);
    target.setDevicePermissionHandler(() => false);
    sessionReady = true;
  }
  return target;
}

export function isCallOverlayOpen(): boolean {
  return !!current && !current.win.isDestroyed();
}

export function closeCallOverlay(callId?: string): void {
  if (!current || (callId && current.callId !== callId)) return;
  const { win } = current;
  current = null;
  if (!win.isDestroyed()) win.destroy();
}

export function showCallOverlay(
  call: { id: string; name: string; avatarUrl: string | null },
  options: { volume: number; chaosSeconds: number; test?: boolean },
  onAnswer: (answer: OverlayAnswer) => void
): void {
  // Chamada nova no meio de outra: troca pela mais nova (a anterior continua esperando no app)
  if (current) {
    const previous = current;
    current = null;
    if (!previous.win.isDestroyed()) previous.win.destroy();
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.bounds;
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    title: 'Chamada do Lazulium',
    webPreferences: {
      session: overlaySession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
      spellcheck: false
    }
  });
  current = { win, callId: call.id };
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setMenu(null);

  let answered = false;
  const finish = (answer: OverlayAnswer) => {
    if (answered) return;
    answered = true;
    clearTimeout(safety);
    if (current?.win === win) current = null;
    if (!win.isDestroyed()) win.destroy();
    onAnswer(answer);
  };
  // A página fecha sozinha no prazo; se travar, o main fecha mesmo assim
  const safety = setTimeout(() => finish('none'), LIFE_SECONDS * 1000 + SAFETY_MARGIN_MS);

  const { webContents } = win;
  webContents.on('page-title-updated', (event, title) => {
    const answer = title.match(/^lazulium-answer:(yes|no|none)$/)?.[1] as OverlayAnswer | undefined;
    if (!answer) return;
    event.preventDefault();
    finish(answer);
  });
  // Nada de sair desta página nem abrir janelas
  webContents.on('will-navigate', (event) => event.preventDefault());
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => finish('none'));

  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    // Modo silencioso (testes) só mostra quando pedido
    if (SILENT_MODE && process.env.LAZULIUM_SHOW_CALL_OVERLAY !== '1') return;
    win.show();
    win.focus();
  });

  const html = callOverlayHtml({
    name: call.name,
    avatarUrl: call.avatarUrl && AVATAR_URL.test(call.avatarUrl) ? call.avatarUrl : null,
    volume: options.volume,
    chaosSeconds: options.chaosSeconds,
    lifeSeconds: LIFE_SECONDS,
    test: !!options.test
  });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}
