import { shell } from 'electron';
import { readFile } from 'fs/promises';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { join } from 'path';
import { SteamLocalAccount } from '@shared/types/accounts';
import { findSteamPath } from '../scanners/steam-scanner.service';
import { parseVdf, vdfGetObject, vdfGetString } from '../scanners/vdf-parser';
import { describeError, fetchText } from '../metadata/http';

const OPENID_URL = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const CLAIMED_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656\d{13})$/;
const LOGIN_TIMEOUT_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

const CALLBACK_PAGE = `<!doctype html><meta charset="utf-8"><title>Lazulium</title>
<body style="font-family:system-ui;background:#090a0f;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2>{TITLE}</h2><p>Você já pode fechar esta aba e voltar ao Lazulium.</p></div>`;

let cancelPendingLogin: (() => void) | undefined;

// Contas que já entraram no cliente da Steam deste PC (config/loginusers.vdf)
export async function listLocalSteamAccounts(): Promise<SteamLocalAccount[]> {
  const steamPath = await findSteamPath();
  if (!steamPath) return [];
  let users;
  try {
    users = vdfGetObject(parseVdf(await readFile(join(steamPath, 'config', 'loginusers.vdf'), 'utf-8')), 'users');
  } catch {
    return [];
  }
  if (!users) return [];

  const accounts = Object.keys(users)
    .filter((id) => /^7656\d{13}$/.test(id))
    .map((steamId) => {
      const entry = vdfGetObject(users, steamId);
      return {
        steamId,
        personaName: vdfGetString(entry, 'personaname') || steamId,
        timestamp: Number(vdfGetString(entry, 'timestamp') || 0),
        flaggedRecent: vdfGetString(entry, 'mostrecent') === '1'
      };
    })
    .sort((a, b) => Number(b.flaggedRecent) - Number(a.flaggedRecent) || b.timestamp - a.timestamp);

  return accounts.map((a, index) => ({ steamId: a.steamId, personaName: a.personaName, mostRecent: index === 0 }));
}

// Nome público do perfil (XML da comunidade, sem chave de API)
export async function fetchSteamPersona(steamId: string): Promise<string | undefined> {
  if (!/^7656\d{13}$/.test(steamId)) return undefined;
  try {
    const xml = await fetchText(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, { service: 'a Steam', timeoutMs: REQUEST_TIMEOUT_MS });
    return xml.match(/<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/)?.[1]?.trim().slice(0, 64) || undefined;
  } catch {
    // Sem o nome a conta conecta do mesmo jeito: ele aparece na próxima atualização do perfil
    return undefined;
  }
}

// "Entrar com a Steam" (OpenID 2.0) no navegador do sistema, com retorno para 127.0.0.1
export function loginWithSteamOpenId(): Promise<string> {
  cancelPendingLogin?.();
  return new Promise((resolvePromise, rejectPromise) => {
    let server: Server | undefined;
    let timer: NodeJS.Timeout | undefined;
    let returnTo = '';

    const finish = (err: Error | null, steamId?: string) => {
      clearTimeout(timer);
      server?.close();
      cancelPendingLogin = undefined;
      if (err) rejectPromise(err);
      else resolvePromise(steamId!);
    };
    cancelPendingLogin = () => finish(new Error('Login anterior cancelado.'));

    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', returnTo);
      if (url.pathname !== '/' || !url.searchParams.has('openid.mode')) {
        res.writeHead(404).end();
        return;
      }
      const page = (title: string) =>
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CALLBACK_PAGE.replace('{TITLE}', title));

      if (url.searchParams.get('openid.mode') !== 'id_res') {
        page('Login cancelado');
        finish(new Error('Login na Steam cancelado.'));
        return;
      }
      try {
        const steamId = await verifyOpenIdResponse(url.searchParams, returnTo);
        page('Conta Steam conectada');
        finish(null, steamId);
      } catch (err) {
        page('Não foi possível confirmar o login');
        finish(err as Error);
      }
    });

    server.on('error', (err) => finish(err));
    server.listen(0, '127.0.0.1', () => {
      returnTo = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/`;
      const loginUrl = new URL(OPENID_URL);
      loginUrl.search = new URLSearchParams({
        'openid.ns': OPENID_NS,
        'openid.mode': 'checkid_setup',
        'openid.return_to': returnTo,
        'openid.realm': returnTo,
        'openid.identity': `${OPENID_NS}/identifier_select`,
        'openid.claimed_id': `${OPENID_NS}/identifier_select`
      }).toString();
      timer = setTimeout(() => finish(new Error('Tempo esgotado aguardando o login na Steam.')), LOGIN_TIMEOUT_MS);
      shell.openExternal(loginUrl.toString()).catch((err) => finish(err));
    });
  });
}

// A própria Steam confirma que a resposta é autêntica (check_authentication)
async function verifyOpenIdResponse(params: URLSearchParams, returnTo: string): Promise<string> {
  if (params.get('openid.return_to') !== returnTo) throw new Error('Resposta da Steam com endereço de retorno inválido.');
  const steamId = params.get('openid.claimed_id')?.match(CLAIMED_ID_PATTERN)?.[1];
  if (!steamId) throw new Error('Resposta da Steam sem SteamID.');

  const body = new URLSearchParams(params);
  body.set('openid.mode', 'check_authentication');
  let reply: string;
  try {
    reply = await fetchText(OPENID_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      timeoutMs: REQUEST_TIMEOUT_MS,
      service: 'a Steam'
    });
  } catch (err) {
    throw new Error(`Não foi possível confirmar o login com a Steam. ${describeError(err)}`);
  }
  if (!/is_valid\s*:\s*true/.test(reply)) throw new Error('A Steam não confirmou o login.');
  return steamId;
}
