import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3, HardDriveDownload, Library, Loader2, NotebookPen, ShieldCheck, ShieldOff } from 'lucide-react';
import logo from '../assets/logo.png';
import { Game, GamePlatform } from '@shared/types/game';
import { PLATFORM_GROUP } from '../utils/platform';
import { isNavActive } from '../utils/spatialNav';
import { AccountsGuide } from './onboarding/AccountsGuide';
import { Button, focusRing } from './ui';

interface WelcomeModalProps {
  games: Game[];
  isScanning: boolean;
  onFinish: () => void;
}

const STEPS = ['Boas-vindas', 'Contas', 'Saves'];

const FEATURES = [
  { icon: Library, title: 'Uma biblioteca só', text: 'Steam, Epic, GOG, Xbox, emuladores e jogos soltos, achados sozinhos.' },
  { icon: Clock3, title: 'Horas e conquistas', text: 'O tempo de tudo que você joga e as conquistas de cada jogo.' },
  { icon: NotebookPen, title: 'Diário e perfil', text: 'Notas, resenhas, listas e um perfil para mostrar aos amigos.' }
];

const StepDots: React.FC<{ step: number }> = ({ step }) => (
  <ol className="flex items-center gap-2" aria-label={`Passo ${step + 1} de ${STEPS.length}`}>
    {STEPS.map((label, i) => (
      <li key={label} className="flex items-center gap-2">
        <span
          className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold transition-colors ${
            i < step ? 'bg-indigo-500 text-white' : i === step ? 'bg-indigo-500/20 text-indigo-200 ring-2 ring-indigo-400' : 'bg-slate-800 text-slate-500'
          }`}
        >
          {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
        </span>
        <span className={`hidden sm:inline text-xs ${i === step ? 'text-slate-200' : 'text-slate-500'}`}>{label}</span>
        {i < STEPS.length - 1 && <span className={`w-6 h-px ${i < step ? 'bg-indigo-400' : 'bg-slate-700'}`} />}
      </li>
    ))}
  </ol>
);

const ChoiceCard: React.FC<{ selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ selected, onSelect, icon, title, children }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={onSelect}
    className={`relative flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-colors ${
      selected ? 'border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-950/40' : 'border-slate-700/80 bg-slate-900/40 hover:border-slate-500'
    } ${focusRing}`}
  >
    <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}>{icon}</span>
    <span className="text-sm font-semibold text-white">{title}</span>
    <span className="text-xs leading-relaxed text-slate-400">{children}</span>
    <span className={`absolute top-3 right-3 w-4 h-4 rounded-full border-2 ${selected ? 'border-indigo-400 bg-indigo-400 ring-2 ring-inset ring-steam-panel' : 'border-slate-600'}`} />
  </button>
);

// Primeira execução em três passos curtos: o que é, contas (opcional) e a escolha sobre o backup dos saves
export const WelcomeModal: React.FC<WelcomeModalProps> = ({ games, isScanning, onFinish }) => {
  const [step, setStep] = useState(0);
  const [backup, setBackup] = useState<boolean | null>(null);
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const installed = useMemo(() => games.filter((g) => g.isInstalled !== false && !g.isHidden), [games]);
  const history = games.length - installed.length;
  const byPlatform = useMemo(() => {
    const counts = new Map<GamePlatform, number>();
    for (const g of installed) counts.set(g.platform, (counts.get(g.platform) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [installed]);

  const back = () => setStep((s) => Math.max(0, s - 1));

  // Quem usa o controle continua com o foco no botão principal de cada passo
  useEffect(() => {
    if (!isNavActive()) return;
    if (step === 2 && backup === null) dialogRef.current?.querySelector<HTMLElement>('[role=radio]')?.focus();
    else primaryRef.current?.focus();
  }, [step, backup]);

  // Esc volta um passo (a janela não fecha: a escolha do backup precisa ser feita)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const finish = () => {
    if (backup === null) return;
    void window.electronAPI?.setAutoBackup(backup);
    onFinish();
  };

  const searching = isScanning && installed.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-steam-bg/85 backdrop-blur-sm"
      // O B do controle "clica" no fundo (sem posição de mouse): volta um passo
      onClick={(e) => e.target === e.currentTarget && e.detail === 0 && back()}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden bg-steam-panel border border-slate-700/60 shadow-2xl shadow-black/50">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-indigo-600/25 via-indigo-600/5 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-indigo-500/15 blur-3xl" />

        <header className="relative flex items-center justify-between gap-4 px-8 pt-6">
          <span className="flex items-center gap-2.5">
            <img src={logo} alt="" className="w-9 h-9 rounded-xl shadow-lg shadow-indigo-950/60" />
            <span className="font-display text-base text-white">Lazulium</span>
          </span>
          <StepDots step={step} />
        </header>

        <div key={step} className="relative flex-1 overflow-y-auto px-8 pt-7 pb-6 transition duration-200 starting:opacity-0 starting:translate-y-1">
          {step === 0 && (
            <>
              <h1 id={titleId} className="text-[32px] leading-tight text-white">
                Todos os seus jogos, <span className="text-indigo-300">num lugar só.</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
                O Lazulium junta o que está instalado no seu PC, conta as horas de tudo e guarda o que você achou de cada jogo.
              </p>

              <div className="mt-6 p-4 rounded-xl bg-slate-950/40 border border-slate-800" aria-live="polite">
                {searching ? (
                  <p className="flex items-center gap-2 text-sm text-slate-300">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-300" /> Procurando os jogos instalados neste PC...
                  </p>
                ) : installed.length > 0 ? (
                  <>
                    <p className="text-sm text-slate-200">
                      Encontramos <b className="font-display text-xl text-white">{installed.length}</b> jogos neste PC
                      {isScanning && <Loader2 className="inline w-3.5 h-3.5 ml-2 animate-spin text-indigo-300" />}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {byPlatform.map(([platform, n]) => (
                        <span key={platform} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-slate-800/80 text-xs text-slate-300">
                          <b className="font-semibold text-white tabular-nums">{n}</b> {PLATFORM_GROUP[platform]}
                        </span>
                      ))}
                    </div>
                    {history > 0 && <p className="mt-3 text-xs text-slate-400">E recuperamos o histórico de mais {history} que você já jogou: estão no Diário.</p>}
                  </>
                ) : (
                  <p className="text-sm text-slate-300">Nenhum jogo encontrado ainda. Dá para adicionar jogos e pastas depois, pelo botão + no topo.</p>
                )}
              </div>

              <ul className="mt-5 grid grid-cols-3 gap-3">
                {FEATURES.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
                    <span className="w-9 h-9 mb-3 rounded-lg flex items-center justify-center bg-indigo-500/15 text-indigo-300">
                      <Icon className="w-4.5 h-4.5" />
                    </span>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{text}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step === 1 && (
            <>
              <h1 id={titleId} className="flex items-center gap-3 text-2xl text-white">
                Conecte suas contas
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-sans font-medium uppercase tracking-wider text-slate-400">opcional</span>
              </h1>
              <p className="mt-2 mb-5 max-w-xl text-sm leading-relaxed text-slate-300">
                Elas trazem as conquistas e a cópia dos saves na nuvem. O login é no site de cada serviço, sem digitar senha nem chave aqui.
              </p>
              <AccountsGuide />
              <p className="mt-3 text-xs text-slate-500">Pode pular: tudo isso fica em Configurações → Contas.</p>
            </>
          )}

          {step === 2 && (
            <>
              <h1 id={titleId} className="text-2xl text-white">
                Quer proteger seus saves?
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                O Lazulium acha as pastas de save e guarda uma cópia neste PC ao fechar cada jogo e uma vez por dia, se algo mudou. Se o Google Drive estiver conectado, vai uma cópia para lá também.
              </p>
              <div role="radiogroup" aria-label="Backup automático dos saves" className="mt-5 grid grid-cols-2 gap-3">
                <ChoiceCard selected={backup === true} onSelect={() => setBackup(true)} icon={<ShieldCheck className="w-5 h-5" />} title="Sim, fazer backup automático">
                  Até 3 GB neste PC (dá para mudar depois) e no Drive, se conectado. Nada é apagado dos jogos.
                </ChoiceCard>
                <ChoiceCard selected={backup === false} onSelect={() => setBackup(false)} icon={<ShieldOff className="w-5 h-5" />} title="Agora não">
                  Nada é copiado. Dá para ligar quando quiser em Configurações → Backup de saves.
                </ChoiceCard>
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                <HardDriveDownload className="w-3.5 h-3.5" /> Também dá para escolher as pastas de cada jogo na página dele.
              </p>
            </>
          )}
        </div>

        <footer className="relative flex items-center justify-between gap-3 px-8 py-4 border-t border-slate-800 bg-slate-950/30">
          {step > 0 ? (
            <Button variant="ghost" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={back}>
              Voltar
            </Button>
          ) : (
            <span className="text-xs text-slate-500">Leva menos de um minuto.</span>
          )}
          <div className="flex items-center gap-3">
            {step === 2 && backup === null && <span className="text-xs text-slate-500">Escolha uma opção para entrar</span>}
            {step < 2 ? (
              <Button ref={primaryRef} data-nav-start="" variant="primary" size="md" onClick={() => setStep(step + 1)} className="px-5 text-sm">
                Continuar <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button ref={primaryRef} data-nav-start="" variant="primary" size="md" onClick={finish} disabled={backup === null} className="px-5 text-sm">
                Entrar no Lazulium <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
