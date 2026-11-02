import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, LogIn, RefreshCw, X } from 'lucide-react';
import { SteamLocalAccount } from '@shared/types/accounts';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface ProfileSteamNoticeProps {
  isPrivate: boolean;
  hasAchievements: boolean;
  onChanged: () => Promise<void> | void;
  onOpenSettings: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const primary = `flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`;
const secondary = `flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs bg-white/10 hover:bg-white/20 text-slate-100 disabled:opacity-50 ${focusRing}`;
const DISMISS_KEY = 'lazulium.profile.steamNoticeDismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

// Aviso no topo do perfil: sem Steam conectada, oferece a conta deste PC; nunca conecta sem o clique,
// porque um PC pode ter contas de mais de uma pessoa.
export const ProfileSteamNotice: React.FC<ProfileSteamNoticeProps> = ({ isPrivate, hasAchievements, onChanged, onOpenSettings }) => {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<SteamLocalAccount[]>([]);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await window.electronAPI?.getAccountsStatus();
      if (cancelled || !status) return;
      setConnected(status.steam.connected);
      if (!status.steam.connected) {
        const local = (await window.electronAPI?.listLocalSteamAccounts()) ?? [];
        if (!cancelled) setAccounts(local);
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Conectar apaga as conquistas de antes: quem acabou de entrar não deveria ter que saber do botão Atualizar
  const syncAchievements = async () => {
    setSyncing(true);
    setError(null);
    try {
      await window.electronAPI?.syncAllAchievements();
      await onChanged();
    } catch (err) {
      setError(`Não foi possível buscar as conquistas: ${ipcErrorMessage(err)}. Tente de novo.`);
    } finally {
      setSyncing(false);
      setSynced(true);
    }
  };

  const connect = async (action: () => Promise<unknown> | undefined) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      const nowConnected = (await window.electronAPI?.getAccountsStatus())?.steam.connected ?? false;
      setConnected(nowConnected);
      await onChanged();
      if (nowConnected) void syncAchievements();
    } catch (err) {
      setError(`Não foi possível conectar: ${ipcErrorMessage(err)}. Tente de novo ou use Contas e configurações.`);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Sem armazenamento: o aviso volta na próxima vez
    }
  };

  const recheck = async () => {
    setBusy(true);
    await onChanged();
    setBusy(false);
  };

  const box = 'col-span-2 p-4 bg-black/75 border border-white/10 text-sm text-slate-200';

  if (connected === true && isPrivate) {
    return (
      <div className={box} role="status">
        <p className="flex items-center gap-2 font-medium text-amber-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Seu perfil da Steam não está público
        </p>
        <p className="mt-1 text-xs text-slate-300">
          Por isso sua bio e suas insígnias podem não aparecer aqui. Suas horas continuam certas, e você pode preencher tudo em Editar perfil. Para trazer da Steam, deixe "Meu perfil" como Público em Privacidade.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void window.electronAPI?.openProfileWebLink('steam-privacy').catch((err) => setError(ipcErrorMessage(err)))} className={primary}>
            <ExternalLink className="w-3.5 h-3.5" /> Abrir privacidade na Steam
          </button>
          <button onClick={recheck} disabled={busy} className={secondary}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Já mudei, verificar
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
      </div>
    );
  }

  if (connected === true) {
    if (syncing) {
      return (
        <div className={box} role="status">
          <p className="flex items-center gap-2 text-xs text-slate-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> Buscando suas conquistas na Steam. Pode levar alguns minutos, e você pode continuar usando o app.
          </p>
        </div>
      );
    }
    if (error && synced) {
      return (
        <div className={box} role="status">
          <p className="text-xs text-amber-300">{error}</p>
          <button onClick={syncAchievements} className={`${secondary} mt-2`}>
            <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        </div>
      );
    }
    if (!hasAchievements && !synced) {
      return (
        <div className={box} role="status">
          <p className="text-xs text-slate-200">Suas conquistas da Steam ainda não foram buscadas.</p>
          <button onClick={syncAchievements} className={`${primary} mt-2`}>
            <RefreshCw className="w-3.5 h-3.5" /> Buscar conquistas
          </button>
        </div>
      );
    }
    return null;
  }

  if (connected !== false || dismissed) return null;

  const suggested = accounts.find((a) => a.mostRecent) ?? accounts[0];

  return (
    <div className={`${box} relative pr-10`} role="status">
      <button onClick={dismiss} aria-label="Não mostrar de novo" title="Não uso a Steam: não mostrar de novo" className={`absolute top-2 right-2 p-1.5 rounded-sm text-slate-400 hover:text-white ${focusRing}`}>
        <X className="w-4 h-4" />
      </button>
      <p className="font-medium text-white">Deixe este perfil com a sua cara</p>
      <p className="mt-1 text-xs text-slate-300">Conecte a Steam para trazer seu nome, avatar, bio, nível, fundo e conquistas. Nenhuma senha ou chave é pedida aqui, e nada é publicado.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {suggested ? (
          <>
            <button onClick={() => connect(() => window.electronAPI?.useLocalSteamAccount(suggested.steamId))} disabled={busy} className={primary}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />} Usar a conta {suggested.personaName || 'deste PC'}
            </button>
            {accounts.length > 1 && (
              <button onClick={onOpenSettings} disabled={busy} className={secondary}>
                Escolher outra conta
              </button>
            )}
          </>
        ) : (
          <button onClick={() => connect(() => window.electronAPI?.loginSteam())} disabled={busy} className={primary}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />} Entrar com a Steam
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
    </div>
  );
};
