import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, Cloud, ExternalLink, Gamepad2, Loader2, LogIn, Trophy } from 'lucide-react';
import { AccountService, AccountsStatus } from '@shared/types/accounts';
import { useAccounts } from '../../hooks/useAccounts';
import { SteamAccountChoices, WAITING_BROWSER, WAITING_WINDOW } from '../AccountsSettings';

// O SteamGridDB não entra aqui: as capas já vêm pelo servidor do Lazulium, e ele fica como opção em Configurações → Contas
import { Button, Notice, Skeleton, focusRing } from '../ui';

interface GuideStep {
  service: AccountService;
  name: string;
  icon: React.ReactNode;
  tint: string;
  gives: string;                      // O que a conta libera no Lazulium
  how: React.ReactNode[];             // O que fazer na janela/navegador que abrir
  tip?: React.ReactNode;
  button: string;
  waiting: string;
  connectedLabel: (status: AccountsStatus) => string;
}

const link = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-0.5 text-indigo-300 hover:text-white underline-offset-2 hover:underline rounded-sm ${focusRing}`}>
    {label}
    <ExternalLink className="w-3 h-3" />
  </a>
);

const STEPS: GuideStep[] = [
  {
    service: 'steam',
    name: 'Steam',
    icon: <Trophy className="w-5 h-5 text-slate-100" />,
    tint: 'bg-slate-700/60',
    gives: 'Conquistas dos jogos da Steam, seu perfil e a lista de desejos.',
    how: [
      'Clique em Entrar com a Steam.',
      'Se a Steam já estiver logada neste PC, aparece a sua conta: é só escolher.',
      'Se não, o site da Steam abre no navegador. Entre normalmente e clique em "Iniciar sessão" para autorizar o Lazulium. Depois volte para cá.'
    ],
    tip: <>Para as conquistas aparecerem, deixe “Detalhes do jogo” como Público na {link('https://steamcommunity.com/my/edit/settings', 'privacidade da Steam')}.</>,
    button: 'Entrar com a Steam',
    waiting: WAITING_BROWSER,
    connectedLabel: (s) => `Conectado como ${s.steam.personaName || s.steam.steamId}`
  },
  {
    service: 'retroachievements',
    name: 'RetroAchievements',
    icon: <Gamepad2 className="w-5 h-5 text-amber-300" />,
    tint: 'bg-amber-500/15',
    gives: 'Conquistas dos jogos de emulador (consoles clássicos, PS2, GameCube e outros).',
    how: [
      'Clique em Entrar. Abre uma janela do RetroAchievements.',
      <>Entre com seu usuário e senha de lá. Não tem conta? Crie no próprio site, é grátis ({link('https://retroachievements.org/createaccount.php', 'criar conta')}).</>,
      'Depois do login o Lazulium conecta sua conta sozinho e fecha a janela.'
    ],
    tip: 'Para ganhar conquistas, entre também no emulador (RetroArch, PCSX2, DuckStation, Dolphin...) com a mesma conta.',
    button: 'Entrar no RetroAchievements',
    waiting: WAITING_WINDOW,
    connectedLabel: (s) => `Conectado como ${s.retroachievements.username}`
  },
  {
    service: 'google',
    name: 'Google Drive',
    icon: <Cloud className="w-5 h-5 text-emerald-300" />,
    tint: 'bg-emerald-500/15',
    gives: 'Uma cópia dos backups dos seus saves na nuvem, para não perder nada se o PC der problema.',
    how: [
      'Clique em Entrar com Google. O site do Google abre no navegador.',
      'Escolha a sua conta e clique em Continuar para permitir.',
      'Quando aparecer a confirmação, volte para cá.'
    ],
    tip: 'O Lazulium só enxerga os arquivos que ele mesmo cria no seu Drive (uma pasta "Lazulium Backups"). Nada mais.',
    button: 'Entrar com Google',
    waiting: WAITING_BROWSER,
    connectedLabel: (s) => `Conectado${s.google.email ? ` como ${s.google.email}` : ''}`
  }
];

// Passo a passo das contas na tela de boas-vindas: uma de cada vez, explicando o que acontece em cada janela
export const AccountsGuide: React.FC = () => {
  const accounts = useAccounts();
  const { status, loadError, busy, errors } = accounts;
  const [skipped, setSkipped] = useState<AccountService[]>([]);
  const [openService, setOpenService] = useState<AccountService | null>(null);

  const steps = useMemo(() => STEPS.filter((s) => s.service !== 'google' || status?.google.available !== false), [status]);
  const connectedCount = steps.filter((s) => accounts.isConnected(s.service)).length;
  const nextPending = steps.find((s) => !accounts.isConnected(s.service) && !skipped.includes(s.service))?.service ?? null;
  const current = openService && !accounts.isConnected(openService) ? openService : nextPending;

  if (loadError) return <Notice>Não foi possível ler suas contas: {loadError}</Notice>;
  if (!status) {
    return (
      <div className="space-y-2">
        {STEPS.map((s) => (
          <Skeleton key={s.service} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const skip = (service: AccountService) => {
    setSkipped((prev) => [...prev, service]);
    setOpenService(null);
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden>
          <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-500" style={{ width: `${(connectedCount / steps.length) * 100}%` }} />
        </div>
        <span className="text-xs text-slate-400 tabular-nums">
          {connectedCount} de {steps.length} conectadas
        </span>
      </div>

      <ol className="rounded-xl bg-slate-900/50 border border-slate-800/90 divide-y divide-slate-800/90">
        {steps.map((step, index) => {
          const connected = accounts.isConnected(step.service);
          const expanded = step.service === current;
          const waiting = busy === step.service;
          return (
            <li key={step.service} className={expanded ? 'bg-slate-900/60' : undefined}>
              <button
                type="button"
                onClick={() => setOpenService(expanded ? null : step.service)}
                disabled={connected}
                aria-expanded={expanded}
                className={`w-full flex items-center gap-3.5 px-4 py-3 text-left rounded-xl disabled:cursor-default ${focusRing}`}
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
                    connected ? 'bg-emerald-500/20 text-emerald-300' : expanded ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {connected ? <Check className="w-4 h-4" /> : index + 1}
                </span>
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${step.tint}`}>{step.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-100">{step.name}</span>
                  {connected ? (
                    <span className="block text-xs text-emerald-300 truncate">{step.connectedLabel(status)}</span>
                  ) : waiting ? (
                    <span className="flex items-center gap-1.5 text-xs text-indigo-300">
                      <Loader2 className="w-3 h-3 animate-spin" /> {step.waiting}
                    </span>
                  ) : (
                    <span className="block text-xs text-slate-400 truncate">{skipped.includes(step.service) ? 'Pulado: dá para conectar depois' : step.gives}</span>
                  )}
                </span>
                {!connected && !expanded && <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />}
              </button>

              {expanded && !connected && (
                <div className="px-4 pb-4 pl-[60px] space-y-3">
                  <ol className="space-y-1.5">
                    {step.how.map((line, i) => (
                      <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-slate-300">
                        <span className="w-4.5 h-4.5 mt-px rounded-full bg-slate-800 text-[10px] font-semibold text-slate-400 flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                  {step.tip && <p className="text-xs leading-relaxed text-slate-400">{step.tip}</p>}
                  {step.service === 'steam' && <SteamAccountChoices accounts={accounts} className="p-3 rounded-lg bg-slate-950/40" />}
                  <Notice>{errors[step.service]}</Notice>
                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="primary" size="md" icon={<LogIn className="w-3.5 h-3.5" />} loading={waiting} disabled={busy !== null && !waiting} onClick={() => accounts.login(step.service)}>
                      {step.button}
                    </Button>
                    <Button variant="ghost" onClick={() => skip(step.service)} disabled={waiting}>
                      Pular esta
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {connectedCount === steps.length && <Notice tone="success" className="mt-3">Tudo conectado! Pode seguir.</Notice>}
    </div>
  );
};
