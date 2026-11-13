// Pedidos HTTP dos serviços do main, num lugar só:
// - todo pedido tem tempo limite;
// - nova tentativa só em falha passageira (limite de pedidos, servidor fora do ar), respeitando o Retry-After;
// - o erro diz em português o que houve, e nunca traz a URL (várias levam chave de API na query);
// - sem internet, o log registra a queda uma vez, e não a cada serviço que tenta de novo.

const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_BASE_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

export type HttpErrorKind = 'network' | 'timeout' | 'status' | 'format';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly kind: HttpErrorKind,
    readonly status?: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface HttpOptions extends Omit<RequestInit, 'signal'> {
  timeoutMs?: number;
  retries?: number;                 // Novas tentativas em 429/5xx (e em falha de rede, com retryNetwork)
  retryNetwork?: boolean;           // Só para quem não pode desistir na primeira queda (ex: envio ao Drive)
  service?: string;                 // Com artigo, para as mensagens: "a Steam", "o Google Drive"
  duplex?: 'half';                  // Necessário no Node/fetch quando o corpo é ReadableStream
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Sem internet: um aviso no log por queda, não um por pedido
let offline = false;

export function isConnectionError(err: unknown): err is HttpError {
  return err instanceof HttpError && (err.kind === 'network' || err.kind === 'timeout');
}

export function isTransientError(err: unknown): boolean {
  return isConnectionError(err) || (err instanceof HttpError && err.status !== undefined && RETRY_STATUS.has(err.status));
}

function toConnectionError(err: unknown, service: string): HttpError {
  const name = (err as Error)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return new HttpError(`${capitalize(service)} demorou demais para responder.`, 'timeout');
  return new HttpError(`Sem conexão com ${service}. Confira a internet.`, 'network');
}

export function statusError(status: number, service: string): HttpError {
  if (status === 429) return new HttpError(`${capitalize(service)} recebeu pedidos demais. O Lazulium tenta de novo mais tarde.`, 'status', status);
  if (status >= 500) return new HttpError(`${capitalize(service)} está fora do ar agora (erro ${status}).`, 'status', status);
  return new HttpError(`${capitalize(service)} recusou o pedido (erro ${status}).`, 'status', status);
}

export function formatError(service: string): HttpError {
  return new HttpError(`${capitalize(service)} mandou uma resposta que o Lazulium não entendeu.`, 'format');
}

function retryAfterMs(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

const backoff = (attempt: number) => Math.min(MAX_RETRY_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attempt);

// Devolve a resposta como veio (inclusive 4xx/5xx depois das tentativas): quem chama decide o que cada status significa
export async function httpRequest(url: string | URL, options: HttpOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 0, retryNetwork = false, service = 'o servidor', ...init } = options;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...(init as RequestInit), signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (retryNetwork && attempt < retries) {
        await sleep(backoff(attempt));
        continue;
      }
      throw toConnectionError(err, service);
    }
    offline = false;
    if (RETRY_STATUS.has(res.status) && attempt < retries) {
      const wait = retryAfterMs(res) ?? backoff(attempt);
      if (wait <= MAX_RETRY_DELAY_MS) {
        await res.body?.cancel().catch(() => undefined);
        await sleep(wait);
        continue;
      }
    }
    return res;
  }
}

async function okResponse(url: string | URL, options: HttpOptions): Promise<Response> {
  const res = await httpRequest(url, options);
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw statusError(res.status, options.service ?? 'o servidor');
  }
  return res;
}

// Resposta de rede é dado de fora: quem chama ainda confere cada campo antes de usar
export async function fetchJson<T = unknown>(url: string | URL, options: HttpOptions = {}): Promise<T> {
  const res = await okResponse(url, options);
  try {
    return (await res.json()) as T;
  } catch (err) {
    // SyntaxError: o corpo chegou, mas não é JSON (página de erro, Cloudflare). O resto é a conexão caindo no meio.
    if (!(err instanceof SyntaxError)) throw toConnectionError(err, options.service ?? 'o servidor');
    throw formatError(options.service ?? 'o servidor');
  }
}

export async function fetchText(url: string | URL, options: HttpOptions = {}): Promise<string> {
  const res = await okResponse(url, options);
  try {
    return await res.text();
  } catch (err) {
    throw toConnectionError(err, options.service ?? 'o servidor');
  }
}

// Erro de qualquer origem em texto para o usuário (sem pilha nem URL)
export function describeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  const message = (err as Error)?.message;
  return message && !/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket/i.test(message) ? message : 'Sem conexão com a internet.';
}

// Sem internet, cada atualização em segundo plano avisaria a cada tentativa: o log registra a queda uma vez
export function logBackgroundFailure(tag: string, err: unknown): void {
  if (isConnectionError(err)) {
    if (offline) return;
    offline = true;
    console.warn(`${tag} ${describeError(err)} As atualizações em segundo plano tentam de novo depois.`);
    return;
  }
  console.warn(`${tag} ${describeError(err)}`);
}
