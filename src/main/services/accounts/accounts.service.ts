import { BrowserWindow } from 'electron';
import { AccountService, AccountsStatus, SteamLocalAccount } from '@shared/types/accounts';
import { db } from '../../database/db';
import { testApiKey } from '../metadata/steamgriddb.service';
import { artworkService } from '../metadata/artwork.service';
import { retroAchievementsService } from '../achievements/retroachievements.service';
import { googleDriveService } from '../cloudsync/google-drive.service';
import { scanLibraries } from '../scanners';
import { fetchSteamPersona, listLocalSteamAccounts, loginWithSteamOpenId } from './steam-account.service';
import { PageContent, findTokens, openWebLogin } from './web-login.service';
import { epicAccountService } from './epic-account.service';

const SGDB_KEY_PATTERN = /\b[a-f0-9]{32}\b/gi;
const RA_KEY_PATTERN = /\b[A-Za-z0-9]{32}\b/g;
const MAX_RA_USERNAMES = 3;

// Usuário logado no RetroAchievements: dados do Inertia ("auth" -> "user") ou o link de perfil mais frequente
function findRetroUsernames(content: PageContent): string[] {
  const html = content.html.replace(/&quot;/g, '"');
  const names: string[] = [];
  const auth = html.indexOf('"auth"');
  if (auth >= 0) {
    const fromAuth = html.slice(auth, auth + 2000).match(/"(?:displayName|username|User)"\s*:\s*"([A-Za-z0-9_]{2,32})"/);
    if (fromAuth) names.push(fromAuth[1]);
  }
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/\/user\/([A-Za-z0-9_]{2,32})/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  names.push(...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name));
  return [...new Set(names)].slice(0, MAX_RA_USERNAMES);
}

class AccountsService {
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

  async loginRetroAchievements(parent: BrowserWindow | null): Promise<AccountsStatus> {
    const { username, key } = await openWebLogin(
      {
        title: 'Entre no RetroAchievements — o Lazulium conecta sua conta sozinho depois do login',
        partition: 'persist:login-retroachievements',
        host: /(^|\.)retroachievements\.org$/i,
        initialUrl: 'https://retroachievements.org/login',
        keyPageUrl: 'https://retroachievements.org/settings',
        skipRedirectPaths: /^\/(login|register|forgot-password|reset-password|verify|createaccount)/i,
        extract: (content) => {
          const keys = findTokens(content, RA_KEY_PATTERN);
          return findRetroUsernames(content).flatMap((name) => keys.map((k) => ({ username: name, key: k })));
        },
        validate: async ({ username: name, key: k }) => (await retroAchievementsService.testCredentials(name, k)).ok
      },
      parent
    );
    db.setSetting('retroAchievementsUser', username);
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
