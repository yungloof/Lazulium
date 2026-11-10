import { shell } from 'electron';
import { createHash, randomBytes } from 'crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DriveStatus } from '@shared/types/cloudsync';
import { db } from '../../database/db';
import { describeError, httpRequest } from '../metadata/http';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
// drive.file: o app só enxerga os arquivos que ele mesmo criou
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `openid email ${DRIVE_SCOPE}`;
const NO_DRIVE_PERMISSION = 'O Google não liberou o acesso ao Drive. Clique em "Entrar com Google" de novo e, na tela do Google, marque a caixa de permissão do Google Drive.';
const FOLDER_NAME = 'Lazulium Backups';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const AUTH_TIMEOUT_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const TRANSFER_TIMEOUT_MS = 10 * 60_000;

export const DRIVE_SETTING_KEYS = {
  clientId: 'googleClientId',
  clientSecret: 'googleClientSecret',
  refreshToken: 'googleDriveRefreshToken',
  email: 'googleDriveEmail',
  folderId: 'googleDriveFolderId'
} as const;

// status ausente = sem conexão (ou o Google demorou demais): o envio fica pendente e tenta de novo depois
export class DriveError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
  }
}

export const isDriveConnectionError = (err: unknown) => err instanceof DriveError && err.status === undefined;

export interface DriveBackupFile {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  appProperties: Record<string, string>;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

const base64url = (buf: Buffer) => buf.toString('base64url');

function setting(key: string): string {
  return db.getSettings()[key]?.trim() ?? '';
}

// Client OAuth do próprio app (definido no build via .env) para o usuário só clicar em "Entrar com Google".
// Em apps desktop o Client Secret não é confidencial (o Google trata como app público + PKCE).
// Credenciais informadas nas Configurações avançadas têm prioridade.
function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = setting(DRIVE_SETTING_KEYS.clientId);
  const clientSecret = setting(DRIVE_SETTING_KEYS.clientSecret);
  if (clientId && clientSecret) return { clientId, clientSecret };
  return {
    clientId: import.meta.env?.MAIN_VITE_GOOGLE_CLIENT_ID?.trim() ?? '',
    clientSecret: import.meta.env?.MAIN_VITE_GOOGLE_CLIENT_SECRET?.trim() ?? ''
  };
}

// O e-mail vem do id_token (JWT) que o próprio Google acabou de devolver pelo canal TLS
function emailFromIdToken(idToken?: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken?.split('.')[1] ?? '', 'base64url').toString('utf-8'));
    return typeof payload.email === 'string' ? payload.email : undefined;
  } catch {
    return undefined;
  }
}

const CALLBACK_PAGE = `<!doctype html><meta charset="utf-8"><title>Lazulium</title>
<body style="font-family:system-ui;background:#090a0f;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2>{TITLE}</h2><p>Você já pode fechar esta aba e voltar ao Lazulium.</p></div>`;

class GoogleDriveService {
  private accessToken?: { value: string; expiresAt: number };
  private cancelPendingAuth?: () => void;
  private gameFolders = new Map<string, string>();
  private folderTasks = new Map<string, Promise<string>>();

  getStatus(): DriveStatus {
    return {
      configured: !!(clientCredentials().clientId && clientCredentials().clientSecret),
      connected: !!setting(DRIVE_SETTING_KEYS.refreshToken),
      email: setting(DRIVE_SETTING_KEYS.email) || undefined
    };
  }

  isConnected(): boolean {
    return this.getStatus().configured && this.getStatus().connected;
  }

  // OAuth2 para apps desktop: navegador do sistema + redirecionamento loopback + PKCE
  async connect(): Promise<DriveStatus> {
    const { clientId, clientSecret } = clientCredentials();
    if (!clientId || !clientSecret) {
      throw new DriveError('Esta versão do Lazulium não tem login do Google configurado. Use as credenciais OAuth nas opções avançadas.');
    }

    this.cancelPendingAuth?.();
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    const state = base64url(randomBytes(16));

    const { code, redirectUri } = await this.waitForAuthCode(clientId, challenge, state);
    const tokens = await this.tokenRequest({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier
    });
    if (!tokens.refresh_token) throw new DriveError('O Google não devolveu um refresh token. Tente conectar novamente.');
    // A tela do Google deixa desmarcar a permissão: sem ela o login entra, mas nenhum envio funciona
    if (!tokens.scope?.split(' ').includes(DRIVE_SCOPE)) throw new DriveError(NO_DRIVE_PERMISSION, 403);

    this.accessToken = { value: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
    db.setSetting(DRIVE_SETTING_KEYS.refreshToken, tokens.refresh_token);
    db.setSetting(DRIVE_SETTING_KEYS.email, emailFromIdToken(tokens.id_token) ?? '');
    db.setSetting(DRIVE_SETTING_KEYS.folderId, '');
    console.log('[GoogleDrive] Conta conectada');
    return this.getStatus();
  }

  private waitForAuthCode(clientId: string, challenge: string, state: string): Promise<{ code: string; redirectUri: string }> {
    return new Promise((resolvePromise, rejectPromise) => {
      let server: Server | undefined;
      let timer: NodeJS.Timeout | undefined;
      let redirectUri = '';

      const finish = (err: Error | null, code?: string) => {
        clearTimeout(timer);
        server?.close();
        this.cancelPendingAuth = undefined;
        if (err) rejectPromise(err);
        else resolvePromise({ code: code!, redirectUri });
      };
      this.cancelPendingAuth = () => finish(new DriveError('Conexão anterior cancelada.'));

      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', redirectUri);
        if (url.pathname !== '/' || url.searchParams.get('state') !== state) {
          res.writeHead(404).end();
          return;
        }
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
          CALLBACK_PAGE.replace('{TITLE}', error ? 'Conexão cancelada' : 'Autorização recebida')
        );
        if (error) finish(new DriveError(error === 'access_denied' ? 'Acesso negado na tela do Google.' : `Google: ${error}`));
        else if (code) finish(null, code);
      });

      server.on('error', (err) => finish(err));
      server.listen(0, '127.0.0.1', () => {
        redirectUri = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
        const authUrl = new URL(AUTH_URL);
        authUrl.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: SCOPES,
          access_type: 'offline',
          prompt: 'consent',
          state,
          code_challenge: challenge,
          code_challenge_method: 'S256'
        }).toString();
        timer = setTimeout(() => finish(new DriveError('Tempo esgotado aguardando a autorização no navegador.')), AUTH_TIMEOUT_MS);
        shell.openExternal(authUrl.toString()).catch((err) => finish(err));
      });
    });
  }

  async disconnect(): Promise<DriveStatus> {
    const refreshToken = setting(DRIVE_SETTING_KEYS.refreshToken);
    this.cancelPendingAuth?.();
    this.accessToken = undefined;
    this.gameFolders.clear();
    this.folderTasks.clear();
    for (const key of [DRIVE_SETTING_KEYS.refreshToken, DRIVE_SETTING_KEYS.email, DRIVE_SETTING_KEYS.folderId]) {
      db.setSetting(key, '');
    }
    if (refreshToken) {
      // Token no corpo do POST, não na URL (URLs acabam em logs de proxy)
      await httpRequest(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }).toString(),
        timeoutMs: REQUEST_TIMEOUT_MS,
        service: 'o Google'
      }).catch(() => undefined);
    }
    return this.getStatus();
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
    let res: Response;
    try {
      res = await httpRequest(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        timeoutMs: REQUEST_TIMEOUT_MS,
        retries: 1,
        service: 'o Google'
      });
    } catch (err) {
      throw new DriveError(describeError(err));
    }
    const body = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string };
    if (!res.ok) {
      if (body.error === 'invalid_grant') {
        db.setSetting(DRIVE_SETTING_KEYS.refreshToken, '');
        throw new DriveError('A conexão com o Google Drive expirou ou foi revogada. Conecte novamente.', 401);
      }
      if (body.error === 'invalid_client') throw new DriveError('Client ID ou Client Secret do OAuth inválido.', 401);
      throw new DriveError(`O Google recusou o login (${body.error_description || body.error || `erro ${res.status}`}).`, res.status);
    }
    if (typeof body.access_token !== 'string' || !body.access_token) throw new DriveError('O Google mandou uma resposta que o Lazulium não entendeu.', res.status);
    return { ...body, access_token: body.access_token, expires_in: Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600 };
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.accessToken && this.accessToken.expiresAt - Date.now() > 60_000) return this.accessToken.value;
    const refreshToken = setting(DRIVE_SETTING_KEYS.refreshToken);
    if (!refreshToken) throw new DriveError('Google Drive não conectado.', 401);

    const tokens = await this.tokenRequest({
      client_id: clientCredentials().clientId,
      client_secret: clientCredentials().clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    this.accessToken = { value: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
    return tokens.access_token;
  }

  // retries: só para pedidos que repetidos não criam nada em dobro (GET, DELETE, sessão de upload)
  private async request(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS, retries = 0): Promise<Response> {
    const send = async (token: string) => {
      try {
        return await httpRequest(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
          timeoutMs,
          retries,
          service: 'o Google Drive'
        });
      } catch (err) {
        throw new DriveError(describeError(err));
      }
    };

    let res = await send(await this.getAccessToken());
    if (res.status === 401) {
      await res.body?.cancel().catch(() => undefined);
      res = await send(await this.getAccessToken(true));
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      // Conta conectada sem a permissão: desconecta para o app oferecer o login em vez de seguir tentando
      if (res.status === 403 && /insufficient authentication scopes/i.test(body?.error?.message ?? '')) {
        this.accessToken = undefined;
        db.setSetting(DRIVE_SETTING_KEYS.refreshToken, '');
        db.setSetting(DRIVE_SETTING_KEYS.email, '');
        console.warn('[GoogleDrive] Conta sem permissão do Drive: desconectada até entrar de novo');
        throw new DriveError(NO_DRIVE_PERMISSION, 403);
      }
      if (res.status === 403 && /storage quota|quota exceeded/i.test(body?.error?.message ?? '')) {
        throw new DriveError('O Google Drive está sem espaço. Libere espaço na sua conta do Google e tente de novo.', 403);
      }
      throw new DriveError(`Google Drive: ${body?.error?.message?.slice(0, 200) || `erro ${res.status}`}`, res.status);
    }
    return res;
  }

  private async json<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch {
      throw new DriveError('O Google Drive mandou uma resposta que o Lazulium não entendeu.', res.status);
    }
  }

  private async findFolder(q: string): Promise<string | undefined> {
    const list = await this.json<{ files?: { id?: unknown }[] } | null>(
      await this.request(`${DRIVE_API}/files?${new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' })}`, {}, REQUEST_TIMEOUT_MS, 2)
    );
    const id = Array.isArray(list?.files) ? list.files.find((f) => typeof f?.id === 'string')?.id : undefined;
    return typeof id === 'string' ? id : undefined;
  }

  private async createFolder(name: string, parent?: string): Promise<string> {
    const created = await this.json<{ id?: unknown } | null>(
      await this.request(`${DRIVE_API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) })
      })
    );
    if (typeof created?.id !== 'string') throw new DriveError('O Google Drive não criou a pasta de backups.', 502);
    return created.id;
  }

  // Dois backups ao mesmo tempo (fim de jogo e passada diária) criariam duas pastas iguais: a mesma busca serve aos dois
  private singleFlight(key: string, task: () => Promise<string>): Promise<string> {
    const running = this.folderTasks.get(key);
    if (running) return running;
    const promise = task().finally(() => this.folderTasks.delete(key));
    this.folderTasks.set(key, promise);
    return promise;
  }

  private ensureFolder(): Promise<string> {
    return this.singleFlight('root', async () => {
      const savedId = setting(DRIVE_SETTING_KEYS.folderId);
      if (savedId) {
        try {
          const folder = await this.json<{ trashed?: boolean } | null>(
            await this.request(`${DRIVE_API}/files/${encodeURIComponent(savedId)}?fields=id,trashed`, {}, REQUEST_TIMEOUT_MS, 2)
          );
          if (!folder?.trashed) return savedId;
        } catch (err) {
          if (!(err instanceof DriveError) || err.status !== 404) throw err;
        }
      }

      const folderId = (await this.findFolder(`name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`)) ?? (await this.createFolder(FOLDER_NAME));
      if (folderId !== savedId) this.gameFolders.clear();
      db.setSetting(DRIVE_SETTING_KEYS.folderId, folderId);
      return folderId;
    });
  }

  // Lazulium Backups/<nome do jogo>/: dá para achar qualquer save também pelo site do Drive
  private async ensureGameFolder(gameTitle: string): Promise<string> {
    const parent = await this.ensureFolder();
    const name = gameTitle.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 120) || 'Jogo';
    const cacheKey = `${parent}/${name}`;
    const cached = this.gameFolders.get(cacheKey);
    if (cached) return cached;

    return this.singleFlight(cacheKey, async () => {
      const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const folderId =
        (await this.findFolder(`name='${escaped}' and mimeType='${FOLDER_MIME}' and '${parent}' in parents and trashed=false`)) ?? (await this.createFolder(name, parent));
      this.gameFolders.set(cacheKey, folderId);
      return folderId;
    });
  }

  // Upload resumível (funciona para qualquer tamanho de .zip)
  async uploadFile(name: string, data: Uint8Array, appProperties: Record<string, string>, gameTitle: string): Promise<string> {
    const folderId = await this.ensureGameFolder(gameTitle);
    const session = await this.request(
      `${UPLOAD_API}/files?uploadType=resumable&fields=id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'application/zip',
          'X-Upload-Content-Length': String(data.byteLength)
        },
        body: JSON.stringify({ name, parents: [folderId], mimeType: 'application/zip', appProperties })
      },
      REQUEST_TIMEOUT_MS,
      2
    );
    const uploadUrl = session.headers.get('location');
    await session.body?.cancel().catch(() => undefined);
    if (!uploadUrl?.startsWith('https://')) throw new DriveError('O Google Drive não iniciou o envio.', 502);

    const res = await this.request(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/zip' }, body: data as Uint8Array<ArrayBuffer> }, TRANSFER_TIMEOUT_MS);
    const uploaded = await this.json<{ id?: unknown } | null>(res);
    if (typeof uploaded?.id !== 'string') throw new DriveError('O Google Drive não confirmou o envio.', 502);
    return uploaded.id;
  }

  async listFiles(appPropertyKey: string, value: string): Promise<DriveBackupFile[]> {
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    // drive.file: só enxerga o que o Lazulium criou. Sem filtro de pasta, backups antigos da pasta geral continuam valendo
    const q = `trashed=false and appProperties has { key='${appPropertyKey}' and value='${escaped}' }`;
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,size,createdTime,appProperties)',
      orderBy: 'createdTime desc',
      pageSize: '100',
      spaces: 'drive'
    });
    const body = await this.json<{ files?: unknown } | null>(await this.request(`${DRIVE_API}/files?${params}`, {}, REQUEST_TIMEOUT_MS, 2));
    const files = Array.isArray(body?.files) ? (body.files as (Partial<Omit<DriveBackupFile, 'size'>> & { size?: string })[]) : [];
    return files.flatMap((f) => {
      if (!f || typeof f.id !== 'string') return [];
      const props = f.appProperties && typeof f.appProperties === 'object' ? f.appProperties : {};
      return [
        {
          id: f.id,
          name: typeof f.name === 'string' ? f.name : '',
          size: Number(f.size ?? 0) || 0,
          createdTime: typeof f.createdTime === 'string' ? f.createdTime : new Date(0).toISOString(),
          appProperties: Object.fromEntries(Object.entries(props).filter(([, v]) => typeof v === 'string')) as Record<string, string>
        }
      ];
    });
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    const res = await this.request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {}, TRANSFER_TIMEOUT_MS, 1);
    try {
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      throw new DriveError(describeError(err));
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    const res = await this.request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }, REQUEST_TIMEOUT_MS, 2);
    await res.body?.cancel().catch(() => undefined);
  }
}

export const googleDriveService = new GoogleDriveService();

