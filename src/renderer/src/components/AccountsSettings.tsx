import React from 'react';
import { CheckCircle2, Cloud, Gamepad2, Image as ImageIcon, Loader2, LogIn, LogOut, Trophy, UserRound } from 'lucide-react';
import { AccountService } from '@shared/types/accounts';
import { AccountsController, useAccounts } from '../hooks/useAccounts';
import { Button, Notice } from './ui';
import { SettingsSkeleton } from './settings/controls';

interface RowProps {
  icon: React.ReactNode;
  tint: string;                     // Fundo do ícone (tokens do tema)
  name: string;
  purpose: string;
  connectedLabel?: string;
  busyLabel?: string;
  error?: string;
  children: React.ReactNode;
}

const AccountRow: React.FC<RowProps> = ({ icon, tint, name, purpose, connectedLabel, busyLabel, error, children }) => (
  <div className="px-4 py-3.5">
    <div className="flex items-center gap-3.5">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tint}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">{name}</p>
        {busyLabel ? (
          <p className="flex items-center gap-1.5 text-xs text-indigo-300">
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" /> {busyLabel}
          </p>
        ) : connectedLabel ? (
          <p className="flex items-center gap-1 text-xs text-emerald-300 truncate">
            <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> {connectedLabel}
          </p>
        ) : (
          <p className="text-xs text-slate-500">{purpose}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
    {error && <Notice className="mt-2 pl-[54px]">{error}</Notice>}
  </div>
);

// Contas da Steam já logadas neste PC: um clique escolhe, sem senha
export const SteamAccountChoices: React.FC<{ accounts: AccountsController; className?: string }> = ({ accounts, className = '' }) => {
  if (!accounts.steamChoices || accounts.isConnected('steam')) return null;
  return (
    <div className={className}>
      <p className="mb-2 text-xs text-slate-400">Contas da Steam neste PC. Escolha a sua:</p>
      <div className="flex flex-wrap items-center gap-2">
        {accounts.steamChoices.map((account) => (
          <Button key={account.steamId} icon={<UserRound className="w-3.5 h-3.5" />} onClick={() => accounts.pickLocalSteam(account.steamId)} disabled={accounts.busy !== null}>
            {account.personaName}
          </Button>
        ))}
        <Button variant="ghost" onClick={accounts.loginSteamInBrowser} disabled={accounts.busy !== null}>
          Outra conta...
        </Button>
      </div>
    </div>
  );
};

export const WAITING_WINDOW = 'Entre na janela que abriu...';
export const WAITING_BROWSER = 'Entre no navegador que abriu...';

// Login em cada serviço pelo próprio site: nenhuma chave de API é pedida aqui
export const AccountsSettings: React.FC = () => {
  const accounts = useAccounts();
  const { status, loadError, busy, errors } = accounts;

  if (loadError) return <Notice>Não foi possível ler suas contas: {loadError}</Notice>;
  if (!status) return <SettingsSkeleton rows={4} />;

  const logoutButton = (service: AccountService) => (
    <Button variant="ghost" icon={<LogOut className="w-3.5 h-3.5" />} onClick={() => accounts.logout(service)} disabled={busy !== null}>
      Sair
    </Button>
  );

  const loginButton = (service: AccountService, label: string, disabled = false) => (
    <Button variant="primary" icon={<LogIn className="w-3.5 h-3.5" />} loading={busy === service} onClick={() => accounts.login(service)} disabled={busy !== null || disabled}>
      {label}
    </Button>
  );

  return (
    <div className="rounded-lg bg-slate-900/50 border border-slate-800/90 divide-y divide-slate-800/90">
      <AccountRow
        icon={<Trophy className="w-5 h-5 text-slate-100" />}
        tint="bg-slate-700/60"
        name="Steam"
        purpose="Conquistas, perfil e lista de desejos"
        connectedLabel={status.steam.connected ? `Conectado como ${status.steam.personaName || status.steam.steamId}` : undefined}
        busyLabel={busy === 'steam' ? WAITING_BROWSER : undefined}
        error={errors.steam}
      >
        {status.steam.connected ? logoutButton('steam') : loginButton('steam', 'Entrar com a Steam')}
      </AccountRow>
      <SteamAccountChoices accounts={accounts} className="px-4 py-3 bg-slate-950/30" />

      <AccountRow
        icon={<ImageIcon className="w-5 h-5 text-indigo-300" />}
        tint="bg-indigo-500/15"
        name="SteamGridDB"
        purpose="Capas, banners e logos para jogos fora da Steam (dá para entrar com a Steam no site)"
        connectedLabel={status.steamgriddb.connected ? 'Conectado' : undefined}
        busyLabel={busy === 'steamgriddb' ? WAITING_WINDOW : undefined}
        error={errors.steamgriddb}
      >
        {status.steamgriddb.connected ? logoutButton('steamgriddb') : loginButton('steamgriddb', 'Entrar')}
      </AccountRow>

      <AccountRow
        icon={<Gamepad2 className="w-5 h-5 text-amber-300" />}
        tint="bg-amber-500/15"
        name="RetroAchievements"
        purpose="Conquistas dos jogos de emulador"
        connectedLabel={status.retroachievements.connected ? `Conectado como ${status.retroachievements.username}` : undefined}
        busyLabel={busy === 'retroachievements' ? WAITING_WINDOW : undefined}
        error={errors.retroachievements}
      >
        {status.retroachievements.connected ? logoutButton('retroachievements') : loginButton('retroachievements', 'Entrar')}
      </AccountRow>

      <AccountRow
        icon={<Cloud className="w-5 h-5 text-emerald-300" />}
        tint="bg-emerald-500/15"
        name="Google Drive"
        purpose={!status.google.available ? 'Login do Google não configurado nesta versão (veja Avançado)' : 'Cópia dos backups de saves na nuvem'}
        connectedLabel={status.google.connected ? `Conectado${status.google.email ? ` como ${status.google.email}` : ''}` : undefined}
        busyLabel={busy === 'google' ? WAITING_BROWSER : undefined}
        error={errors.google}
      >
        {status.google.connected ? logoutButton('google') : loginButton('google', 'Entrar com Google', !status.google.available)}
      </AccountRow>
    </div>
  );
};
