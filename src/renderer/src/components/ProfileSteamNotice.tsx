import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, LogIn, RefreshCw, X } from 'lucide-react';
import { SteamLocalAccount } from '@shared/types/accounts';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { buttonClass, iconButtonClass } from './ui';

interface ProfileSteamNoticeProps {
  isPrivate: boolean;
  hasAchievements: boolean;
  onChanged: () => Promise<void> | void;
  onOpenSettings: () => void;
}

const primary = buttonClass('primary');
const secondary = buttonClass('secondary');
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
  const isSyncingAchievements = useLibraryStore((s) => s.isSyncingAchievements);
  const setIsSyncingAchievements = useLibraryStore((s) => s.setIsSyncingAchievements);
  const achievementsSyncError = useLibraryStore((s) => s.achievementsSyncError);
  const setAchievementsSyncError = useLibraryStore((s) => s.setAchievementsSyncError);
  const synced = useLibraryStore((s) => s.achievementsSyncDone);
  const setSynced = useLibraryStore((s) => s.setAchievementsSyncDone);
  const [error, setError] = useState<string | null>(null);
  // A Steam respondeu, mas escondeu as conquistas ("Detalhes do jogo" privado)
  const [privateAchievements, setPrivateAchievements] = useState(false);

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
    setIsSyncingAchievements(true);
    setAchievementsSyncError(null);
    try {
      const result = await window.electronAPI?.syncAllAchievements();
      setPrivateAchievements(!!result?.privateGames);
      if (result?.failed) {
        setAchievementsSyncError(
          result.synced
            ? `Conquistas de ${result.failed} jogo(s) não vieram. Confira a internet ou espere alguns minutos e tente de novo.`
            : 'Não foi possível falar com a Steam. Confira a internet ou espere alguns minutos e tente de novo.'
        );
      }
    } catch (err) {
      setAchievementsSyncError(`Não foi possível buscar as conquistas: ${ipcErrorMessage(err)}. Tente de novo.`);
    } finally {
      setIsSyncingAchievements(false);
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
      // A busca pode levar minutos: nome, avatar e fundo aparecem já, sem esperar por ela
      if (nowConnected) void syncAchievements();
      await onChanged();
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

  // Depois de abrir a privacidade na Steam: relê o perfil e busca as conquistas de novo
  const recheck = async () => {
    setBusy(true);
    await onChanged();
    setBusy(false);
    void syncAchievements();
  };

  const openPrivacy = () => void window.electronAPI?.openProfileWebLink('steam-privacy').catch((err) => setError(ipcErrorMessage(err)));

  const box = 'p-4 rounded-xl bg-steam-bg/90 border border-indigo-400/25 shadow-xl shadow-black/30 text-sm text-slate-200';

  if (isSyncingAchievements) {
    return (
      <div className={box} role="status">
        <p className="flex items-center gap-2 text-xs text-slate-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> Buscando suas conquistas na Steam. Pode levar alguns minutos, e você pode continuar usando o app.
        </p>
      </div>
    );
  }

  if (achievementsSyncError && !(connected === true && isPrivate)) {
    return (
      <div className={box} role="status">
        <p className="text-xs text-amber-300">{achievementsSyncError}</p>
        <button onClick={syncAchievements} className={`${secondary} mt-2`}>
          <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
        </button>
      </div>
    );
  }

  if (connected === true && isPrivate) {
    return (
      <div className={box} role="status">
        <p className="flex items-center gap-2 font-medium text-amber-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Seu perfil da Steam não está público
        </p>
        <p className="mt-1 text-xs text-slate-300">
          Por isso a bio e as insígnias podem não vir. As horas continuam certas. Dá para preencher o resto em Editar perfil ou deixar "Meu perfil" como Público na privacidade da Steam.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={openPrivacy} className={primary}>
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

  if (connected === true && privateAchievements) {
    return (
      <div className={box} role="status">
        <p className="flex items-center gap-2 font-medium text-amber-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> A Steam escondeu suas conquistas
        </p>
        <p className="mt-1 text-xs text-slate-300">"Detalhes do jogo" está privado na Steam. Deixe como Público e busque de novo.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={openPrivacy} className={primary}>
            <ExternalLink className="w-3.5 h-3.5" /> Abrir privacidade na Steam
          </button>
          <button onClick={() => void syncAchievements()} className={secondary}>
            <RefreshCw className="w-3.5 h-3.5" /> Já mudei, buscar de novo
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
      </div>
    );
  }

  if (connected === true) {
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
      <button onClick={dismiss} aria-label="Não mostrar de novo" title="Não uso a Steam: não mostrar de novo" className={`absolute top-2 right-2 ${iconButtonClass}`}>
        <X className="w-4 h-4" />
      </button>
      <p className="font-medium text-white">Deixe este perfil com a sua cara</p>
      <p className="mt-1 text-xs text-slate-300">Conecte a Steam para trazer nome, avatar, bio, nível, fundo e conquistas. Sem senha, sem chave, e nada é publicado.</p>
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
