import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { AccountService } from '@shared/types/accounts';
import { accountsService } from '../services/accounts/accounts.service';
import { epicAccountService } from '../services/accounts/epic-account.service';
import { profileService } from '../services/profile/profile.service';
import { backupService } from '../services/cloudsync/backup.service';
import { handle, WindowGetter } from './helpers';

// Contas (login sem chave de API)
export function registerAccountHandlers(getMainWindow: WindowGetter): void {
  // Logins pelo navegador do sistema terminam fora do app: traz a janela de volta
  const refocus = <T>(value: T): T => {
    getMainWindow()?.focus();
    return value;
  };

  handle(IPC_CHANNELS.ACCOUNTS_GET_STATUS, () => accountsService.getStatus());
  handle(IPC_CHANNELS.ACCOUNTS_STEAM_LOCAL, () => accountsService.listLocalSteamAccounts());
  handle(IPC_CHANNELS.ACCOUNTS_STEAM_USE_LOCAL, (_event, steamId: string) => accountsService.useLocalSteamAccount(steamId));
  handle(IPC_CHANNELS.ACCOUNTS_STEAM_LOGIN, async () => refocus(await accountsService.loginSteamInBrowser()));
  handle(IPC_CHANNELS.ACCOUNTS_SGDB_LOGIN, () => accountsService.loginSteamGridDb(getMainWindow()));

  handle(IPC_CHANNELS.ACCOUNTS_RETRO_LOGIN, async () => {
    const status = await accountsService.loginRetroAchievements(getMainWindow());
    void profileService.syncAllAchievements().catch((err) => console.warn('[IPC] Conquistas após login no RetroAchievements:', (err as Error).message));
    return status;
  });

  handle(IPC_CHANNELS.ACCOUNTS_EPIC_LOGIN, () => accountsService.loginEpic(getMainWindow()));
  handle(IPC_CHANNELS.ACCOUNTS_EPIC_IMPORT, () => epicAccountService.importPlaytime());
  handle(IPC_CHANNELS.ACCOUNTS_GOOGLE_LOGIN, async () => {
    const status = refocus(await accountsService.loginGoogle());
    // O que já estava só neste PC sobe sozinho
    void backupService.retryPendingUploads().catch((err) => console.warn('[IPC] Envio pendente ao Drive após login:', (err as Error).message));
    return status;
  });

  handle(IPC_CHANNELS.ACCOUNTS_LOGOUT, (_event, service: AccountService) => accountsService.logout(service));
}
