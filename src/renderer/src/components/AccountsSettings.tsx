import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Cloud, RefreshCw, Gamepad2, Image as ImageIcon, Loader2, LogIn, LogOut, Store, Trophy, UserRound } from 'lucide-react';
import { AccountService } from '@shared/types/accounts';
import { GamePlatform } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { PLATFORM_GROUP } from '../utils/platform';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { AccountsController, useAccounts } from '../hooks/useAccounts';
import { Button, Notice } from './ui';
import { SettingsSkeleton } from './settings/controls';
import { SocialAccountCard } from './settings/SocialAccountCard';

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

// Lojas que o Lazulium encontra sozinho no PC: nada para entrar
const DETECTED_PLATFORMS: GamePlatform[] = ['epic', 'gog', 'xbox', 'battlenet', 'ea', 'ubisoft', 'riot', 'emulator', 'standalone'];

const Group: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
    {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
    <div className="mt-2 rounded-lg bg-slate-900/50 border border-slate-800/90 divide-y divide-slate-800/90">{children}</div>
  </section>
);

const DetectedStores: React.FC = () => {
  const games = useLibraryStore((s) => s.games);
  const counts = useMemo(() => {
    const map = new Map<GamePlatform, number>();
    for (const g of games) map.set(g.platform, (map.get(g.platform) ?? 0) + 1);
    return map;
  }, [games]);
  const found = DETECTED_PLATFORMS.filter((p) => (counts.get(p) ?? 0) > 0);
  return (
    <div className="px-4 py-3.5 flex items-start gap-3.5">
      <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-sky-500/15">
        <Store className="w-5 h-5 text-sky-300" />
      </span>
      <div className="min-w-0 flex-1">
        {found.length === 0 ? (
          <p className="text-xs text-slate-500 pt-2.5">Nenhum jogo de outra loja instalado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {found.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs text-slate-200">
                {PLATFORM_GROUP[p]}
                <span className="tabular-nums text-slate-400">{counts.get(p)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Login em cada serviço pelo próprio site: nenhuma chave de API é pedida aqui
export const AccountsSettings: React.FC = () => {
  const accounts = useAccounts();
  const { status, loadError, busy, errors } = accounts;
  const [importing, setImporting] = useState(false);
  const [epicMessage, setEpicMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const importEpic = async () => {
    setImporting(true);
    setEpicMessage(null);
    try {
      const result = await window.electronAPI?.importEpicPlaytime();
      if (result) setEpicMessage({ ok: true, text: result.updated ? `horas atualizadas em ${result.updated} jogo(s)` : 'horas em dia' });
    } catch (err) {
      setEpicMessage({ ok: false, text: ipcErrorMessage(err) });
    } finally {
      setImporting(false);
    }
  };

  if (loadError) return <Notice>Não foi possível ler suas contas: {loadError}</Notice>;
  if (!status) return <SettingsSkeleton rows={4} />;

  const logoutButton = (service: AccountService) => (
    <Button variant="ghost" icon={<LogOut className="w-3.5 h-3.5" />} onClick={() => accounts.logout(service)} disabled={busy !== null}>
      Sair
    </Button>
  );

  const loginButton = (service: AccountService, label: string, disabled = false, primary = true) => (
    <Button variant={primary ? 'primary' : undefined} icon={<LogIn className="w-3.5 h-3.5" />} loading={busy === service} onClick={() => accounts.login(service)} disabled={busy !== null || disabled}>
      {label}
    </Button>
  );

  return (
    <div className="space-y-5">
      <SocialAccountCard fallbackName={status.steam.personaName} />

      <Group title="Seu progresso" description="Conquistas e horas que ficam nesses sites.">
        <AccountRow
          icon={<Trophy className="w-5 h-5 text-slate-100" />}
          tint="bg-slate-700/60"
          name="Steam"
          purpose="Conquistas, horas, perfil e lista de desejos"
          connectedLabel={status.steam.connected ? `Conectado como ${status.steam.personaName || status.steam.steamId}` : undefined}
          busyLabel={busy === 'steam' ? WAITING_BROWSER : undefined}
          error={errors.steam}
        >
          {status.steam.connected ? logoutButton('steam') : loginButton('steam', 'Entrar com a Steam')}
        </AccountRow>
        <SteamAccountChoices accounts={accounts} className="px-4 py-3 bg-slate-950/30" />

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
          icon={<Clock className="w-5 h-5 text-sky-300" />}
          tint="bg-sky-500/15"
          name="Epic Games (opcional)"
          purpose="Traz as horas dos jogos da Epic, até as de antes do Lazulium, já que ela não guarda isso no PC"
          connectedLabel={
            status.epic.connected
              ? `Conectado${status.epic.displayName ? ` como ${status.epic.displayName}` : ''}${epicMessage?.ok ? ` · ${epicMessage.text}` : ''}`
              : undefined
          }
          busyLabel={busy === 'epic' ? WAITING_WINDOW : undefined}
          error={errors.epic ?? (epicMessage && !epicMessage.ok ? epicMessage.text : undefined)}
        >
          {status.epic.connected ? (
            <>
              <Button icon={<RefreshCw className={`w-3.5 h-3.5 ${importing ? 'animate-spin' : ''}`} />} onClick={importEpic} disabled={importing || busy !== null}>
                Importar agora
              </Button>
              {logoutButton('epic')}
            </>
          ) : (
            loginButton('epic', 'Entrar', false, false)
          )}
        </AccountRow>
      </Group>

      <Group title="Lojas neste PC" description="Achadas sozinhas, sem login. Fora da Steam, quem conta as horas é o Lazulium.">
        <DetectedStores />
      </Group>

      <Group title="Nuvem">
        <AccountRow
          icon={<Cloud className="w-5 h-5 text-emerald-300" />}
          tint="bg-emerald-500/15"
          name="Google Drive"
          purpose={!status.google.available ? 'Login do Google não configurado nesta versão (veja Avançado)' : 'Cópia dos backups de saves no seu Drive'}
          connectedLabel={status.google.connected ? `Conectado${status.google.email ? ` como ${status.google.email}` : ''}` : undefined}
          busyLabel={busy === 'google' ? WAITING_BROWSER : undefined}
          error={errors.google}
        >
          {status.google.connected ? logoutButton('google') : loginButton('google', 'Entrar com Google', !status.google.available)}
        </AccountRow>
      </Group>

      <Group title="Opcional">
        <AccountRow
          icon={<ImageIcon className="w-5 h-5 text-indigo-300" />}
          tint="bg-indigo-500/15"
          name="SteamGridDB"
          purpose="Para ter mais opções de capa, logo e ícone"
          connectedLabel={status.steamgriddb.connected ? 'Conectado: mais artes, logos e ícones' : undefined}
          busyLabel={busy === 'steamgriddb' ? WAITING_WINDOW : undefined}
          error={errors.steamgriddb}
        >
          {status.steamgriddb.connected ? logoutButton('steamgriddb') : loginButton('steamgriddb', 'Conectar', false, false)}
        </AccountRow>
      </Group>
    </div>
  );
};
