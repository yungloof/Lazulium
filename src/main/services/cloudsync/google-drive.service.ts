import { shell } from 'electron';
import { createHash, randomBytes } from 'crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DriveStatus } from '@shared/types/cloudsync';
import { db } from '../../database/db';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
// drive.file: o app só enxerga os arquivos que ele mesmo criou
const SCOPES = 'openid email https://www.googleapis.com/auth/drive.file';
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

export class DriveError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
  }
}

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
    for (const key of [DRIVE_SETTING_KEYS.refreshToken, DRIVE_SETTING_KEYS.email, DRIVE_SETTING_KEYS.folderId]) {
      db.setSetting(key, '');
    }
    if (refreshToken) {
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }).catch(() => undefined);
    }
    return this.getStatus();
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (err) {
      throw new DriveError(`Sem conexão com o Google (${(err as Error).message}).`);
    }
    const body = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
    if (!res.ok) {
      if (body.error === 'invalid_grant') {
        db.setSetting(DRIVE_SETTING_KEYS.refreshToken, '');
        throw new DriveError('A conexão com o Google Drive expirou ou foi revogada. Conecte novamente.', 401);
      }
      if (body.error === 'invalid_client') throw new DriveError('Client ID ou Client Secret do OAuth inválido.', 401);
      throw new DriveError(`Google: ${body.error_description || body.error || `HTTP ${res.status}`}`, res.status);
    }
    return body;
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

  private async request(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    const send = async (token: string) => {
      try {
        return await fetch(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (err) {
        throw new DriveError(`Sem conexão com o Google Drive (${(err as Error).message}).`);
      }
    };

    let res = await send(await this.getAccessToken());
    if (res.status === 401) res = await send(await this.getAccessToken(true));
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new DriveError(`Google Drive: ${body?.error?.message || `HTTP ${res.status}`}`, res.status);
    }
    return res;
  }

  private async ensureFolder(): Promise<string> {
    const savedId = setting(DRIVE_SETTING_KEYS.folderId);
    if (savedId) {
      try {
        const res = await this.request(`${DRIVE_API}/files/${savedId}?fields=id,trashed`);
        const folder = (await res.json()) as { trashed?: boolean };
        if (!folder.trashed) return savedId;
      } catch (err) {
        if (!(err instanceof DriveError) || err.status !== 404) throw err;
      }
    }

    const q = `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`;
    const list = (await (
      await this.request(`${DRIVE_API}/files?${new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' })}`)
    ).json()) as { files: { id: string }[] };

    let folderId = list.files[0]?.id;
    if (!folderId) {
      const created = await this.request(`${DRIVE_API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME })
      });
      folderId = ((await created.json()) as { id: string }).id;
    }
    db.setSetting(DRIVE_SETTING_KEYS.folderId, folderId);
    return folderId;
  }

  // Upload resumível (funciona para qualquer tamanho de .zip)
  async uploadFile(name: string, data: Uint8Array, appProperties: Record<string, string>): Promise<string> {
    const folderId = await this.ensureFolder();
    const session = await this.request(`${UPLOAD_API}/files?uploadType=resumable&fields=id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/zip',
        'X-Upload-Content-Length': String(data.byteLength)
      },
      body: JSON.stringify({ name, parents: [folderId], mimeType: 'application/zip', appProperties })
    });
    const uploadUrl = session.headers.get('location');
    if (!uploadUrl) throw new DriveError('Google Drive não iniciou o upload.');

    const res = await this.request(
      uploadUrl,
      { method: 'PUT', headers: { 'Content-Type': 'application/zip' }, body: data as Uint8Array<ArrayBuffer> },
      TRANSFER_TIMEOUT_MS
    );
    return ((await res.json()) as { id: string }).id;
  }

  async listFiles(appPropertyKey: string, value: string): Promise<DriveBackupFile[]> {
    const folderId = await this.ensureFolder();
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `'${folderId}' in parents and trashed=false and appProperties has { key='${appPropertyKey}' and value='${escaped}' }`;
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,size,createdTime,appProperties)',
      orderBy: 'createdTime desc',
      pageSize: '100',
      spaces: 'drive'
    });
    const body = (await (await this.request(`${DRIVE_API}/files?${params}`)).json()) as {
      files: (Omit<DriveBackupFile, 'size'> & { size?: string })[];
    };
    return body.files.map((f) => ({ ...f, size: Number(f.size ?? 0), appProperties: f.appProperties ?? {} }));
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    const res = await this.request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {}, TRANSFER_TIMEOUT_MS);
    return new Uint8Array(await res.arrayBuffer());
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
  }
}

export const googleDriveService = new GoogleDriveService();
