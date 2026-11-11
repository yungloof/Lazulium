import { useCallback, useEffect, useState } from 'react';
import { AccountService, AccountsStatus, SteamLocalAccount } from '@shared/types/accounts';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

// Estado e ações de login das contas, usado nas Configurações e no passo a passo das boas-vindas.
// Cada login acontece no site do serviço: nenhuma senha ou chave passa pela interface.
export function useAccounts() {
  const [status, setStatus] = useState<AccountsStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<AccountService | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AccountService, string>>>({});
  const [steamChoices, setSteamChoices] = useState<SteamLocalAccount[] | null>(null);

  useEffect(() => {
    window.electronAPI
      ?.getAccountsStatus()
      .then(setStatus)
      .catch((err) => setLoadError(ipcErrorMessage(err)));
  }, []);

  const run = useCallback(async (service: AccountService, action: () => Promise<AccountsStatus> | undefined) => {
    setBusy(service);
    setErrors((prev) => ({ ...prev, [service]: undefined }));
    try {
      const next = await action();
      if (next) setStatus(next);
    } catch (err) {
      setErrors((prev) => ({ ...prev, [service]: ipcErrorMessage(err) }));
    } finally {
      setBusy(null);
    }
  }, []);

  // Steam: oferece as contas já logadas no cliente da Steam; sem nenhuma, vai direto para o login no navegador
  const loginSteam = useCallback(async () => {
    try {
      const local = (await window.electronAPI?.listLocalSteamAccounts()) ?? [];
      if (local.length === 0) await run('steam', () => window.electronAPI?.loginSteam());
      else setSteamChoices(local);
    } catch (err) {
      setErrors((prev) => ({ ...prev, steam: ipcErrorMessage(err) }));
    }
  }, [run]);

  const pickLocalSteam = useCallback(
    (steamId: string) => run('steam', () => window.electronAPI?.useLocalSteamAccount(steamId)).then(() => setSteamChoices(null)),
    [run]
  );

  const loginSteamInBrowser = useCallback(() => run('steam', () => window.electronAPI?.loginSteam()).then(() => setSteamChoices(null)), [run]);

  const login = useCallback(
    (service: AccountService) => {
      if (service === 'steam') return loginSteam();
      if (service === 'steamgriddb') return run(service, () => window.electronAPI?.loginSteamGridDb());
      if (service === 'retroachievements') return run(service, () => window.electronAPI?.loginRetroAchievements());
      return run(service, () => window.electronAPI?.loginGoogle());
    },
    [loginSteam, run]
  );

  const logout = useCallback((service: AccountService) => run(service, () => window.electronAPI?.logoutAccount(service)), [run]);

  const isConnected = (service: AccountService): boolean => !!status?.[service].connected;

  return { status, loadError, busy, errors, steamChoices, login, logout, pickLocalSteam, loginSteamInBrowser, isConnected };
}

export type AccountsController = ReturnType<typeof useAccounts>;
