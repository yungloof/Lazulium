// Regras de QUANDO o Lazulium se atualiza, sem Electron (testadas em tests/main/update-flow.test.ts).
// Antes: só procurava 15 s depois de abrir e a cada 4 h, e só instalava quando o app fechava de verdade.
// Quem deixa o Lazulium na bandeja ficava dias na versão velha. Agora, como o Discord:
//  1. ao abrir, procura antes da janela principal; tendo versão nova, baixa, instala e reabre;
//  2. aberto, procura a cada hora; baixou e o app está na bandeja sem jogo aberto, instala sozinho.

export const STARTUP_CHECK_TIMEOUT_MS = 6_000;     // Sem resposta nisso (internet ruim), abre normal
export const STARTUP_DOWNLOAD_MAX_MS = 3 * 60_000; // Download mais longo que isso continua por trás
export const STARTUP_WINDOW_DELAY_MS = 800;        // Procura rápida nem chega a mostrar a janelinha
export const CHECK_INTERVAL_MS = 60 * 60_000;
export const QUIET_INSTALL_POLL_MS = 5 * 60_000;

export interface FoundUpdate {
  version: string;
  download: Promise<unknown>;      // Termina quando a versão nova está baixada
}

export interface StartupUpdateUi {
  checking(): void;
  downloading(version: string): void;
  installing(version: string): void;
  close(): void;
  skipped: Promise<void>;          // Jogador clicou "Abrir agora"
}

export interface StartupUpdateDeps {
  check(): Promise<FoundUpdate | null>;
  install(): void;                 // Fecha, instala em silêncio e abre de novo
  createUi(): StartupUpdateUi | null;   // null: abriu escondido (com o Windows) e não mostra nada
  wait?(ms: number): Promise<void>;
}

export type StartupUpdateResult = 'installing' | 'open';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Corre a promessa contra um prazo: 'timeout' se o prazo vence antes, 'error' se ela falha
async function race<T>(promise: Promise<T>, ms: number, wait: (ms: number) => Promise<void>): Promise<{ value: T } | 'timeout' | 'error'> {
  return Promise.race([
    promise.then((value) => ({ value })).catch(() => 'error' as const),
    wait(ms).then(() => 'timeout' as const)
  ]);
}

// Ao abrir o Lazulium: nunca segura a abertura por mais que alguns segundos sem motivo
export async function updateBeforeOpening(deps: StartupUpdateDeps): Promise<StartupUpdateResult> {
  const wait = deps.wait ?? sleep;
  const shown: { ui: StartupUpdateUi | null; tried: boolean } = { ui: null, tried: false };
  const showUi = (): StartupUpdateUi | null => {
    if (!shown.tried) {
      shown.tried = true;
      shown.ui = deps.createUi();
    }
    return shown.ui;
  };

  // Procura demorando: mostra a janelinha para não parecer que o app travou
  let checking = true;
  void wait(STARTUP_WINDOW_DELAY_MS).then(() => {
    if (checking) showUi()?.checking();
  });
  const found = await race(deps.check(), STARTUP_CHECK_TIMEOUT_MS, wait);
  checking = false;

  if (typeof found === 'string' || !found.value) {
    shown.ui?.close();
    return 'open';
  }

  const { version, download } = found.value;
  const window = showUi();
  window?.downloading(version);
  const skipped = window ? window.skipped.then(() => 'skipped' as const) : new Promise<never>(() => undefined);
  const downloaded = await Promise.race([race(download, STARTUP_DOWNLOAD_MAX_MS, wait), skipped]);
  if (typeof downloaded === 'string') {
    // Pulou, demorou ou deu erro: abre agora; o download segue e instala depois (bandeja ou próxima abertura)
    window?.close();
    return 'open';
  }

  window?.installing(version);
  deps.install();
  return 'installing';
}

export const QUIET_INSTALL_MIN_UPTIME_MS = 2 * 60_000;

// Com o app aberto: instala sozinho só quando ninguém está olhando e nenhum jogo está aberto.
// Nos primeiros minutos não: a janela pode estar abrindo (ainda invisível) ou o jogador pulou a atualização
export function canInstallQuietly(state: { downloaded: boolean; windowVisible: boolean; gameRunning: boolean; uptimeMs: number }): boolean {
  return state.downloaded && !state.windowVisible && !state.gameRunning && state.uptimeMs >= QUIET_INSTALL_MIN_UPTIME_MS;
}
