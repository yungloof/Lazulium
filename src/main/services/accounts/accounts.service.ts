import { BrowserWindow, clipboard, shell } from 'electron';
import { AccountService, AccountsStatus, SteamLocalAccount } from '@shared/types/accounts';
import { db } from '../../database/db';
import { testApiKey } from '../metadata/steamgriddb.service';
import { artworkService } from '../metadata/artwork.service';
import { retroAchievementsService } from '../achievements/retroachievements.service';
import { googleDriveService } from '../cloudsync/google-drive.service';
import { scanLibraries } from '../scanners';
import { fetchSteamPersona, listLocalSteamAccounts, loginWithSteamOpenId } from './steam-account.service';
import { findTokens, openWebLogin } from './web-login.service';
import { epicAccountService } from './epic-account.service';

const SGDB_KEY_PATTERN = /\b[a-f0-9]{32}\b/gi;
const RA_USERNAME = /^[A-Za-z0-9_]{2,32}$/;
const RA_KEY_EXACT = /^[A-Za-z0-9]{32}$/;
const RA_SETTINGS_URL = 'https://retroachievements.org/settings';
const RA_CLIPBOARD_POLL_MS = 1_000;
const RA_LOGIN_TIMEOUT_MS = 10 * 60_000;

class AccountsService {
  private cancelRetroLogin?: () => void;

  getStatus(): AccountsStatus {
    const s = db.getSettings();
    const drive = googleDriveService.getStatus();
    return {
      steam: {
        connected: !!s.steamUserId,
        steamId: s.steamUserId || undefined,
        personaName: s.steamPersonaName || undefined,
        usesApiKey: !!s.steamWebApiKey
      },
      steamgriddb: { connected: !!s.steamGridDbApiKey },
      retroachievements: {
        connected: !!(s.retroAchievementsUser && s.retroAchievementsApiKey),
        username: s.retroAchievementsUser || undefined
      },
      epic: { connected: epicAccountService.isConnected(), ...epicAccountService.getAccount() },
      google: { connected: drive.connected, email: drive.email, available: drive.configured }
    };
  }

  listLocalSteamAccounts(): Promise<SteamLocalAccount[]> {
    return listLocalSteamAccounts();
  }

  // Horas e jogos da conta nova em segundo plano: falha no scan não pode virar promise sem tratamento
  private syncSteamLibrary(): void {
    scanLibraries(['steam']).catch((err) => console.warn('[Contas] Sincronização da Steam falhou:', (err as Error).message));
  }

  private saveSteam(steamId: string, personaName?: string): void {
    db.setSetting('steamUserId', steamId);
    db.setSetting('steamPersonaName', personaName ?? '');
    // Conquistas antigas eram de outra conta (ou de nenhuma)
    db.clearGameAchievements('steam');
  }

  async useLocalSteamAccount(steamId: string): Promise<AccountsStatus> {
    const account = (await listLocalSteamAccounts()).find((a) => a.steamId === steamId);
    if (!account) throw new Error('Conta da Steam não encontrada neste PC.');
    this.saveSteam(account.steamId, account.personaName);
    // Sincroniza horas e jogos da Steam automaticamente
    this.syncSteamLibrary();
    return this.getStatus();
  }

  async loginSteamInBrowser(): Promise<AccountsStatus> {
    const steamId = await loginWithSteamOpenId();
    this.saveSteam(steamId, await fetchSteamPersona(steamId));
    this.syncSteamLibrary();
    return this.getStatus();
  }

  async loginSteamGridDb(parent: BrowserWindow | null): Promise<AccountsStatus> {
    const key = await openWebLogin(
      {
        title: 'Entre no SteamGridDB — se pedir, clique em gerar a chave da API; o Lazulium detecta sozinho',
        partition: 'persist:login-steamgriddb',
        host: /(^|\.)steamgriddb\.com$/i,
        keyPageUrl: 'https://www.steamgriddb.com/profile/preferences/api',
        skipRedirectPaths: /^\/(login|auth|register)/i,
        extract: (content) => findTokens(content, SGDB_KEY_PATTERN),
        validate: async (candidate) => {
          try {
            await testApiKey(candidate);
            return true;
          } catch {
            return false;
          }
        }
      },
      parent
    );
    db.setSetting('steamGridDbApiKey', key);
    artworkService.enqueueMissing();
    return this.getStatus();
  }

  // O site do RetroAchievements fica atrás de uma verificação da Cloudflare que não passa em janela embutida.
  // Por isso a página da chave abre no navegador de verdade; a pessoa copia a Web API Key e o Lazulium
  // pega da área de transferência (só um texto de 32 letras e números, sem guardar nem registrar outra coisa).
  async loginRetroAchievements(username: string): Promise<AccountsStatus> {
    const user = typeof username === 'string' ? username.trim() : '';
    if (!RA_USERNAME.test(user)) throw new Error('Escreva o seu nome de usuário do RetroAchievements.');
    this.cancelRetroLogin?.();

    const key = await new Promise<string>((resolve, reject) => {
      const before = clipboard.readText().trim();
      let checking = false;
      const done = (err: Error | null, value?: string) => {
        clearInterval(poller);
        clearTimeout(timeout);
        if (this.cancelRetroLogin === cancel) this.cancelRetroLogin = undefined;
        if (err) reject(err);
        else resolve(value!);
      };
      const cancel = () => done(new Error('Login cancelado.'));
      this.cancelRetroLogin = cancel;

      const poller = setInterval(() => {
        if (checking) return;
        const text = clipboard.readText().trim();
        if (text === before || !RA_KEY_EXACT.test(text)) return;
        checking = true;
        retroAchievementsService
          .testCredentials(user, text)
          .then((result) =>
            result.ok
              ? done(null, text)
              : done(new Error(/incorretos/.test(result.message) ? `A chave copiada não é a do usuário "${user}". Confira o nome e copie a Web API Key de novo.` : result.message))
          )
          .catch(() => done(new Error('Não deu para falar com o RetroAchievements agora. Tente de novo.')));
      }, RA_CLIPBOARD_POLL_MS);
      const timeout = setTimeout(() => done(new Error('Tempo esgotado esperando a Web API Key copiada.')), RA_LOGIN_TIMEOUT_MS);

      void shell.openExternal(RA_SETTINGS_URL).catch(() => done(new Error('Não foi possível abrir o navegador.')));
    });

    db.setSetting('retroAchievementsUser', user);
    db.setSetting('retroAchievementsApiKey', key);
    db.clearGameAchievements('retroachievements');
    return this.getStatus();
  }

  async loginEpic(parent: BrowserWindow | null): Promise<AccountsStatus> {
    await epicAccountService.login(parent);
    return this.getStatus();
  }

  async loginGoogle(): Promise<AccountsStatus> {
    await googleDriveService.connect();
    return this.getStatus();
  }

  async logout(service: AccountService): Promise<AccountsStatus> {
    switch (service) {
      case 'steam':
        for (const key of ['steamUserId', 'steamPersonaName', 'steamWebApiKey']) db.setSetting(key, '');
        db.clearGameAchievements('steam');
        break;
      case 'steamgriddb':
        db.setSetting('steamGridDbApiKey', '');
        break;
      case 'retroachievements':
        db.setSetting('retroAchievementsUser', '');
        db.setSetting('retroAchievementsApiKey', '');
        db.clearGameAchievements('retroachievements');
        break;
      case 'google':
        await googleDriveService.disconnect();
        break;
      case 'epic':
        // As horas já importadas ficam: só para de atualizar
        epicAccountService.logout();
        break;
    }
    return this.getStatus();
  }
}

export const accountsService = new AccountsService();
