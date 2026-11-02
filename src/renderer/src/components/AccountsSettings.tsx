import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, LogIn, LogOut, UserRound, Image as ImageIcon, Trophy, Gamepad2, Cloud } from 'lucide-react';
import { AccountService, AccountsStatus, SteamLocalAccount } from '@shared/types/accounts';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const primaryButton = `flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`;
const secondaryButton = `flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`;

interface RowProps {
  icon: React.ReactNode;
  name: string;
  purpose: string;
  connectedLabel?: string;
  busyLabel?: string;
  error?: string;
  children: React.ReactNode;
}

const AccountRow: React.FC<RowProps> = ({ icon, name, purpose, connectedLabel, busyLabel, error, children }) => (
  <div className="px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">{name}</p>
        {connectedLabel ? (
          <p className="flex items-center gap-1 text-[11px] text-emerald-300 truncate">
            <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> {connectedLabel}
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">{busyLabel ?? purpose}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
    {error && (
      <p className="flex items-start gap-1.5 text-[11px] text-amber-300">
        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {error}
      </p>
    )}
  </div>
);

export const AccountsSettings: React.FC = () => {
  const [status, setStatus] = useState<AccountsStatus | null>(null);
  const [busy, setBusy] = useState<AccountService | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AccountService, string>>>({});
  const [steamChoices, setSteamChoices] = useState<SteamLocalAccount[] | null>(null);

  useEffect(() => {
    window.electronAPI?.getAccountsStatus().then(setStatus);
  }, []);

  const run = async (service: AccountService, action: () => Promise<AccountsStatus> | undefined) => {
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
  };

  // Steam: usa a conta já logada no cliente da Steam; sem nenhuma, vai direto para o login no navegador
  const handleSteam = async () => {
    const local = (await window.electronAPI?.listLocalSteamAccounts()) ?? [];
    if (local.length === 0) {
      await run('steam', () => window.electronAPI?.loginSteam());
      return;
    }
    setSteamChoices(local);
  };

  const logoutButton = (service: AccountService) => (
    <button onClick={() => run(service, () => window.electronAPI?.logoutAccount(service))} disabled={busy !== null} className={secondaryButton}>
      <LogOut className="w-3.5 h-3.5" /> Sair
    </button>
  );

  const loginButton = (service: AccountService, label: string, onClick: () => void, disabled = false) => (
    <button onClick={onClick} disabled={busy !== null || disabled} className={primaryButton}>
      {busy === service ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
      {label}
    </button>
  );

  const waitingWindow = 'Aguardando você entrar na janela que abriu...';
  const waitingBrowser = 'Aguardando você entrar no navegador...';

  return (
    <section className="space-y-3 pb-5 border-b border-slate-800/80">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
        <UserRound className="w-3.5 h-3.5 text-indigo-400" /> Contas
      </h3>
      <p className="text-xs text-slate-500">Entre com suas contas para liberar artes, conquistas e backup na nuvem. Nenhuma chave de API é necessária.</p>

      <AccountRow
        icon={<Trophy className="w-4 h-4 text-amber-400" />}
        name="Steam"
        purpose="Conquistas dos jogos da Steam"
        connectedLabel={status?.steam.connected ? `Conectado como ${status.steam.personaName || status.steam.steamId}` : undefined}
        busyLabel={busy === 'steam' ? waitingBrowser : undefined}
        error={errors.steam}
      >
        {status?.steam.connected ? logoutButton('steam') : loginButton('steam', 'Entrar com a Steam', handleSteam)}
      </AccountRow>
      {steamChoices && !status?.steam.connected && (
        <div className="ml-11 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400">Contas da Steam neste PC:</span>
          {steamChoices.map((account) => (
            <button
              key={account.steamId}
              onClick={() =>
                run('steam', () => window.electronAPI?.useLocalSteamAccount(account.steamId)).then(() => setSteamChoices(null))
              }
              disabled={busy !== null}
              className={secondaryButton}
            >
              <UserRound className="w-3.5 h-3.5" /> {account.personaName}
            </button>
          ))}
          <button
            onClick={() => run('steam', () => window.electronAPI?.loginSteam()).then(() => setSteamChoices(null))}
            disabled={busy !== null}
            className={`px-2 py-1 text-[11px] rounded text-indigo-300 hover:bg-indigo-500/10 ${focusRing}`}
          >
            Outra conta...
          </button>
        </div>
      )}

      <AccountRow
        icon={<ImageIcon className="w-4 h-4 text-indigo-300" />}
        name="SteamGridDB"
        purpose="Capas, banners e logos para jogos fora da Steam (entre com a Steam no site)"
        connectedLabel={status?.steamgriddb.connected ? 'Conectado' : undefined}
        busyLabel={busy === 'steamgriddb' ? waitingWindow : undefined}
        error={errors.steamgriddb}
      >
        {status?.steamgriddb.connected
          ? logoutButton('steamgriddb')
          : loginButton('steamgriddb', 'Entrar', () => run('steamgriddb', () => window.electronAPI?.loginSteamGridDb()))}
      </AccountRow>

      <AccountRow
        icon={<Gamepad2 className="w-4 h-4 text-emerald-400" />}
        name="RetroAchievements"
        purpose="Conquistas dos jogos de emulador"
        connectedLabel={status?.retroachievements.connected ? `Conectado como ${status.retroachievements.username}` : undefined}
        busyLabel={busy === 'retroachievements' ? waitingWindow : undefined}
        error={errors.retroachievements}
      >
        {status?.retroachievements.connected
          ? logoutButton('retroachievements')
          : loginButton('retroachievements', 'Entrar', () => run('retroachievements', () => window.electronAPI?.loginRetroAchievements()))}
      </AccountRow>

      <AccountRow
        icon={<Cloud className="w-4 h-4 text-sky-400" />}
        name="Google Drive"
        purpose={
          status && !status.google.available
            ? 'Login do Google não configurado nesta versão (veja as opções avançadas)'
            : 'Cópia dos backups de saves na nuvem'
        }
        connectedLabel={status?.google.connected ? `Conectado${status.google.email ? ` como ${status.google.email}` : ''}` : undefined}
        busyLabel={busy === 'google' ? waitingBrowser : undefined}
        error={errors.google}
      >
        {status?.google.connected
          ? logoutButton('google')
          : loginButton('google', 'Entrar com Google', () => run('google', () => window.electronAPI?.loginGoogle()), !status?.google.available)}
      </AccountRow>
    </section>
  );
};
