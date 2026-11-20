// Janelinha "Atualizando o Lazulium" que aparece ao abrir, antes da janela principal (como a do Discord).
// Página data: com HTML/CSS/JS inline, sem preload nem Node. O main muda o estado com executeJavaScript;
// o botão "Abrir agora" responde pelo título da página (mesma ideia da tela de chamada).
import { BrowserWindow, nativeImage, session } from 'electron';
import { resourcePath, SILENT_MODE } from '../../app-shell';
import type { StartupUpdateUi } from './update-flow';

type PageState = { kind: 'checking' } | { kind: 'downloading'; version: string; percent?: number } | { kind: 'installing'; version: string };

// Sessão própria: a política de segurança das páginas do app (só scripts de arquivo) não vale aqui,
// e esta página não pede nenhuma permissão (mesma ideia da tela de chamada)
let sessionReady = false;
function updateSession() {
  const target = session.fromPartition('lazulium-update-window');
  if (!sessionReady) {
    target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    target.setPermissionCheckHandler(() => false);
    sessionReady = true;
  }
  return target;
}

const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export function updateWindowHtml(logoDataUrl: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Atualizando o Lazulium</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; font-family: 'Segoe UI', system-ui, sans-serif; user-select: none; cursor: default; -webkit-app-region: drag; }
  #card { position: absolute; inset: 0; border-radius: 20px; background: radial-gradient(circle at 50% 0%, #1e2a6e 0%, #0d1130 55%, #090a0f 100%); border: 1px solid rgba(129,140,248,.28);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px 28px; color: #e2e8f0; }
  #logo { width: 64px; height: 64px; border-radius: 16px; animation: float 2.4s ease-in-out infinite; }
  #title { font-size: 17px; font-weight: 700; color: #f8fafc; text-align: center; }
  #detail { font-size: 12.5px; color: #94a3b8; text-align: center; min-height: 16px; }
  #bar { width: 100%; height: 6px; border-radius: 999px; background: rgba(148,163,184,.18); overflow: hidden; }
  #fill { height: 100%; width: 35%; border-radius: 999px; background: linear-gradient(90deg, #6366f1, #60a5fa); animation: slide 1.3s ease-in-out infinite; }
  #fill.known { animation: none; transition: width .3s; }
  #skip { -webkit-app-region: no-drag; font: inherit; font-size: 12.5px; color: #a5b4fc; background: transparent; border: 0; border-radius: 8px; padding: 4px 10px; cursor: pointer; visibility: hidden; }
  #skip:hover { color: #c7d2fe; background: rgba(99,102,241,.14); }
  #skip:focus-visible { outline: 2px solid #818cf8; outline-offset: 2px; }
  @keyframes slide { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }
  @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) { #logo, #fill { animation: none; } }
</style>
</head>
<body>
<div id="card">
  ${logoDataUrl ? `<img id="logo" src="${logoDataUrl}" alt="">` : ''}
  <div id="title">Procurando atualização…</div>
  <div id="bar"><div id="fill"></div></div>
  <div id="detail"></div>
  <button id="skip" type="button">Abrir agora e atualizar depois</button>
</div>
<script>
  const title = document.getElementById('title');
  const detail = document.getElementById('detail');
  const fill = document.getElementById('fill');
  const skip = document.getElementById('skip');
  skip.addEventListener('click', () => { document.title = 'lazulium-update:skip'; });
  window.lz = (state) => {
    if (state.kind === 'checking') {
      title.textContent = 'Procurando atualização…';
    } else if (state.kind === 'downloading') {
      title.textContent = 'Baixando a versão ' + state.version;
      skip.style.visibility = 'visible';
      if (typeof state.percent === 'number') {
        fill.classList.add('known');
        fill.style.width = state.percent + '%';
        fill.style.marginLeft = '0';
        detail.textContent = state.percent + '%';
      } else {
        detail.textContent = 'Já já o Lazulium abre na versão nova.';
      }
    } else if (state.kind === 'installing') {
      title.textContent = 'Instalando a versão ' + state.version;
      detail.textContent = 'O Lazulium abre sozinho em alguns segundos.';
      skip.style.visibility = 'hidden';
      fill.classList.remove('known');
      fill.style.width = '35%';
      fill.style.marginLeft = '';
    }
  };
  window.lz(${scriptJson({ kind: 'checking' })});
</script>
</body>
</html>`;
}

export interface UpdateWindow extends StartupUpdateUi {
  progress(percent: number): void;
}

export function createUpdateWindow(): UpdateWindow {
  const logo = nativeImage.createFromPath(resourcePath('icon.png'));
  const logoDataUrl = logo.isEmpty() ? '' : logo.resize({ width: 128, height: 128 }).toDataURL();
  const win = new BrowserWindow({
    width: 380,
    height: 260,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    title: 'Atualizando o Lazulium',
    icon: resourcePath('icon.ico'),
    ...(SILENT_MODE ? { x: -32000, y: -32000, opacity: 0, focusable: false, skipTaskbar: true } : {}),
    webPreferences: { session: updateSession(), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.setMenu(null);

  let state: PageState = { kind: 'checking' };
  let loaded = false;
  let resolveSkip: () => void = () => undefined;
  const skipped = new Promise<void>((resolve) => (resolveSkip = resolve));

  const render = () => {
    if (loaded && !win.isDestroyed()) void win.webContents.executeJavaScript(`window.lz(${scriptJson(state)})`).catch((err) => console.warn('[Updater] Janelinha da atualização:', (err as Error).message));
  };
  win.webContents.on('page-title-updated', (event, pageTitle) => {
    if (pageTitle !== 'lazulium-update:skip') return;
    event.preventDefault();
    resolveSkip();
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Fechar a janelinha (Alt+F4) é o mesmo que "Abrir agora"
  win.on('closed', () => resolveSkip());
  // A página só recebe o estado depois de carregada (window.lz existe a partir daí)
  win.webContents.once('did-finish-load', () => {
    loaded = true;
    render();
  });
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    if (SILENT_MODE) win.showInactive();
    else win.show();
  });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(updateWindowHtml(logoDataUrl))}`);

  return {
    skipped,
    checking() {
      state = { kind: 'checking' };
      render();
    },
    downloading(version) {
      state = { kind: 'downloading', version };
      render();
    },
    progress(percent) {
      if (state.kind !== 'downloading') return;
      state = { ...state, percent };
      render();
    },
    installing(version) {
      state = { kind: 'installing', version };
      render();
    },
    close() {
      if (!win.isDestroyed()) win.destroy();
    }
  };
}
