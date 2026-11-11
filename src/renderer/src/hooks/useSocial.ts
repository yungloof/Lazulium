import { useCallback, useEffect, useState } from 'react';
import { SocialSettings, SocialStatus } from '@shared/types/social';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

// Estado da conta Lazulium (amigos e feed) e as ações dela, para a aba Amigos e para Contas
export function useSocial() {
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI
      ?.getSocialStatus()
      .then(setStatus)
      .catch((err) => setError(ipcErrorMessage(err)));
    return window.electronAPI?.onSocialStatus(setStatus);
  }, []);

  const run = useCallback(async (name: string, action: () => Promise<SocialStatus | undefined> | undefined) => {
    setBusy(name);
    setError(null);
    try {
      const next = await action();
      if (next) setStatus(next);
      return true;
    } catch (err) {
      setError(ipcErrorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  return {
    status,
    busy,
    error,
    clearError: () => setError(null),
    login: () => run('login', () => window.electronAPI?.socialLogin()),
    logout: () => run('logout', () => window.electronAPI?.socialLogout()),
    deleteAccount: () => run('delete', () => window.electronAPI?.socialDeleteAccount()),
    rename: (name: string | null) => run('rename', () => window.electronAPI?.socialUpdate({ name })),
    setSetting: (key: keyof SocialSettings, value: boolean) => run(`setting:${key}`, () => window.electronAPI?.socialUpdate({ settings: { [key]: value } })),
    sync: () => run('sync', () => window.electronAPI?.socialSync())
  };
}

export type SocialController = ReturnType<typeof useSocial>;
