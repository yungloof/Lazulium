import { app, IpcMainInvokeEvent, Session, session, shell, WebContents } from 'electron';
import { join } from 'path';
import { pathToFileURL } from 'url';

// Regras de segurança comuns às janelas do Lazulium: para onde a interface pode ir, que permissões
// do navegador ela recebe e quem pode chamar o IPC.

// Endereço da interface: o servidor do Vite no desenvolvimento, o index.html empacotado na versão instalada
function rendererEntry(): URL {
  const dev = process.env['ELECTRON_RENDERER_URL'];
  return dev ? new URL(dev) : pathToFileURL(join(__dirname, '../renderer/index.html'));
}

// A página é a própria interface (mesmo arquivo ou mesmo servidor de desenvolvimento), nunca um site de fora
export function isAppUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const entry = rendererEntry();
    if (entry.protocol === 'file:') return url.protocol === 'file:' && decodeURIComponent(url.pathname).toLowerCase() === decodeURIComponent(entry.pathname).toLowerCase();
    return url.origin === entry.origin;
  } catch {
    return false;
  }
}

// Navegador do sistema só para endereços web: nada de file://, ms-msdt:, search-ms: e outros protocolos
// que o Windows entregaria a um programa instalado
export function isWebUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function openInBrowser(raw: string): void {
  if (isWebUrl(raw)) void shell.openExternal(raw).catch(() => undefined);
  else console.warn('[Segurança] Link bloqueado (só http/https abre no navegador)');
}

// IPC só da interface do Lazulium: o quadro principal da janela, carregado do próprio app.
// Molduras (vitrine de amigo) e janelas de login nunca chegam aqui, mesmo que algo mude no preload.
export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  if (!frame || frame.parent) return false;
  return isAppUrl(frame.url);
}

// Permissões do navegador: a interface só usa a área de transferência (copiar código de convite).
// Câmera, microfone, localização, notificações web, MIDI, HID etc. são sempre negados.
const APP_PERMISSIONS = new Set(['clipboard-sanitized-write']);

function restrictPermissions(target: Session, allowFor: (url: string) => boolean): void {
  target.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(APP_PERMISSIONS.has(permission) && allowFor(details.requestingUrl || contents?.getURL() || ''));
  });
  target.setPermissionCheckHandler((_contents, permission, requestingOrigin) => APP_PERMISSIONS.has(permission) && allowFor(requestingOrigin));
  // Sem dispositivos USB/HID/serial/Bluetooth para nenhuma página
  target.setDevicePermissionHandler(() => false);
}

// Sessões das janelas de login (Epic, SteamGridDB): os sites não recebem nenhuma permissão
export function lockLoginSession(target: Session): void {
  restrictPermissions(target, () => false);
}

function guardNavigation(contents: WebContents): void {
  // A janela principal nunca sai da interface; links vão para o navegador do sistema
  contents.on('will-navigate', (event, url) => {
    if (contents.getType() !== 'window' || isAppUrl(url)) return;
    if (!isMainAppContents(contents)) return;
    event.preventDefault();
    openInBrowser(url);
  });
  contents.on('will-redirect', (event, url) => {
    if (contents.getType() !== 'window' || !isMainAppContents(contents) || isAppUrl(url)) return;
    event.preventDefault();
  });
  // <webview> não é usado: qualquer tentativa de anexar um é cancelada
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

// A janela principal é a que carrega a interface; janelas de login têm partição própria
function isMainAppContents(contents: WebContents): boolean {
  return contents.session === session.defaultSession;
}

// Chamado quando o app fica pronto, antes de abrir qualquer janela
export function applySecurityPolicies(): void {
  restrictPermissions(session.defaultSession, (url) => isAppUrl(url) || isAppOrigin(url));
  app.on('web-contents-created', (_event, contents) => guardNavigation(contents));
}

// Na checagem de permissão o Chromium manda só a origem ("file:///" ou "http://localhost:5173")
function isAppOrigin(origin: string): boolean {
  const entry = rendererEntry();
  if (entry.protocol === 'file:') return origin === 'file:///' || origin === 'file://';
  try {
    return new URL(origin).origin === entry.origin;
  } catch {
    return false;
  }
}
