import { BrowserWindow, shell } from 'electron';

// Janela de login dentro do app para serviços que só oferecem chave de API.
// O usuário entra normalmente no site; o Lazulium abre a página da chave, lê o
// conteúdo renderizado, valida as candidatas contra a API e fecha a janela sozinho.

export interface WebLoginOptions<T> {
  title: string;
  partition: string;                // Sessão isolada (cookies do site ficam só nela)
  host: RegExp;                     // Domínio do serviço
  keyPageUrl: string;               // Página que mostra a chave depois do login
  initialUrl?: string;              // URL inicial de login (ex: /login para não cair direto no WAF)
  skipRedirectPaths: RegExp;        // Páginas de login/cadastro em que não interferimos
  extract: (content: PageContent) => T[];
  validate: (candidate: T) => Promise<boolean>;
}

export interface PageContent {
  url: string;
  html: string;
  inputValues: string[];
  text: string;
}

const POLL_INTERVAL_MS = 1_500;
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const MAX_VALIDATIONS = 40;

const READ_PAGE_SCRIPT = `({
  url: location.href,
  html: document.documentElement.outerHTML,
  inputValues: Array.from(document.querySelectorAll('input, textarea')).map((el) => el.value || ''),
  text: document.body ? document.body.innerText : ''
})`;

let activeWindow: BrowserWindow | null = null;

export function openWebLogin<T>(options: WebLoginOptions<T>, parent?: BrowserWindow | null): Promise<T> {
  activeWindow?.close();

  return new Promise((resolvePromise, rejectPromise) => {
    const win = new BrowserWindow({
      width: 980,
      height: 760,
      title: options.title,
      parent: parent ?? undefined,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        partition: options.partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        disableBlinkFeatures: 'AutomationControlled'
      }
    });
    activeWindow = win;
    // Sem o token "Electron" no user-agent, para os sites tratarem como um navegador comum
    win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/ (Electron|lazulium)\/\S+/gi, ''));
    win.on('page-title-updated', (e) => e.preventDefault());

    const tested = new Set<string>();
    let validations = 0;
    let checking = false;
    let settled = false;

    const finish = (err: Error | null, value?: T) => {
      if (settled) return;
      settled = true;
      clearInterval(poller);
      clearTimeout(timeout);
      if (activeWindow === win) activeWindow = null;
      if (!win.isDestroyed()) win.close();
      if (err) rejectPromise(err);
      else resolvePromise(value as T);
    };

    const onServiceHost = (url: string) => {
      try {
        return options.host.test(new URL(url).hostname);
      } catch {
        return false;
      }
    };

    // Depois do login o site costuma voltar para a home: levamos o usuário à página da chave
    win.webContents.on('did-finish-load', () => {
      const url = win.webContents.getURL();
      if (!onServiceHost(url)) return;
      const { pathname } = new URL(url);
      if (url.split('#')[0] === options.keyPageUrl || options.skipRedirectPaths.test(pathname)) return;
      if (pathname !== new URL(options.keyPageUrl).pathname) void win.loadURL(options.keyPageUrl);
    });

    // Links para fora (termos, ajuda) abrem no navegador do sistema
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (onServiceHost(url) || /steamcommunity\.com|steampowered\.com/.test(url)) return { action: 'allow' };
      void shell.openExternal(url);
      return { action: 'deny' };
    });

    const check = async () => {
      if (checking || settled || win.isDestroyed()) return;
      const url = win.webContents.getURL();
      if (!onServiceHost(url) || new URL(url).pathname !== new URL(options.keyPageUrl).pathname) return;

      // Não roda scripts se estiver na tela de verificação da Cloudflare
      const title = win.webContents.getTitle();
      if (/verificação|security|moment|just a moment|cloudflare|turnstile/i.test(title)) return;

      checking = true;
      try {
        const content = (await win.webContents.executeJavaScript(READ_PAGE_SCRIPT, true)) as PageContent;
        for (const candidate of options.extract(content)) {
          const key = JSON.stringify(candidate);
          if (tested.has(key) || validations >= MAX_VALIDATIONS) continue;
          tested.add(key);
          validations++;
          if (await options.validate(candidate)) {
            finish(null, candidate);
            return;
          }
        }
      } catch {
        // Página navegando ou recarregando: tenta no próximo ciclo
      } finally {
        checking = false;
      }
    };

    const poller = setInterval(() => void check(), POLL_INTERVAL_MS);
    const timeout = setTimeout(() => finish(new Error('Tempo esgotado aguardando o login.')), LOGIN_TIMEOUT_MS);
    win.on('closed', () => finish(new Error('Janela de login fechada antes de concluir.')));

    void win.loadURL(options.initialUrl || options.keyPageUrl);
  });
}

// Tokens de N caracteres; os que aparecem perto de "api"/"key" são testados primeiro
export function findTokens(content: PageContent, pattern: RegExp): string[] {
  const sources = [...content.inputValues, content.text, content.html.replace(/&quot;/g, '"')];
  const scored = new Map<string, number>();
  for (const source of sources) {
    for (const match of source.matchAll(pattern)) {
      const token = match[0];
      const around = source.slice(Math.max(0, (match.index ?? 0) - 160), (match.index ?? 0) + token.length + 40).toLowerCase();
      const score = (/api/.test(around) ? 2 : 0) + (/key|chave|token/.test(around) ? 1 : 0) + (content.inputValues.includes(token) ? 2 : 0);
      scored.set(token, Math.max(scored.get(token) ?? 0, score));
    }
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([token]) => token);
}
