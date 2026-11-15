import { useCallback, useEffect, useState } from 'react';
import { SocialSettings, SocialStatus } from '@shared/types/social';
import { SyncStatusState } from '@shared/types/sync';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

// Estado da conta Lazulium (amigos e feed) e as ações dela, para a aba Amigos e para Contas
export function useSocial() {
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [librarySync, setLibrarySync] = useState<SyncStatusState | null>(null);
  const [syncBusy, setSyncBusy] = useState<'toggle' | 'now' | 'clear' | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI
      ?.getSocialStatus()
      .then(setStatus)
      .catch((err) => setError(ipcErrorMessage(err)));
    window.electronAPI
      ?.socialSyncLibraryGet()
      .then(setLibrarySync)
      .catch(() => undefined);
    const offStatus = window.electronAPI?.onSocialStatus(setStatus);
    const offSync = window.electronAPI?.onSocialSyncLibraryStatus(setLibrarySync);
    return () => {
      offStatus?.();
      offSync?.();
    };
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

  const runSync = useCallback(async (kind: 'toggle' | 'now' | 'clear', action: () => Promise<SyncStatusState | undefined> | undefined) => {
    setSyncBusy(kind);
    setSyncError(null);
    try {
      const next = await action();
      if (next) setLibrarySync(next);
      return true;
    } catch (err) {
      setSyncError(ipcErrorMessage(err));
      return false;
    } finally {
      setSyncBusy(null);
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
    sync: () => run('sync', () => window.electronAPI?.socialSync()),
    librarySync,
    syncBusy,
    syncError,
    setSyncLibrary: (enabled: boolean) => runSync('toggle', () => window.electronAPI?.socialSyncLibrarySet(enabled)),
    syncLibraryNow: () => runSync('now', () => window.electronAPI?.socialSyncLibraryNow()),
    clearLibraryCloud: () => runSync('clear', () => window.electronAPI?.socialSyncLibraryClearCloud())
  };
}

export type SocialController = ReturnType<typeof useSocial>;
