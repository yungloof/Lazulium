import React, { useState } from 'react';
import { HardDriveDownload, KeyRound, Library, LifeBuoy, MonitorCog, Palette, Settings, UserRound } from 'lucide-react';
import { Modal, focusRing } from './ui';
import { AccountsSettings } from './AccountsSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { AppBehaviorSettings } from './AppBehaviorSettings';
import { BackupOverviewSettings } from './BackupOverviewSettings';
import { GoogleDriveSettings } from './GoogleDriveSettings';
import { HelpSettings } from './HelpSettings';
import { ApiKeysSettings } from './settings/ApiKeysSettings';
import { LibrarySettings } from './settings/LibrarySettings';

interface SettingsModalProps {
  onClose: () => void;
}

type SectionId = 'accounts' | 'appearance' | 'library' | 'backup' | 'behavior' | 'advanced' | 'help';

interface Section {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  description: string;
  render: () => React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'accounts',
    label: 'Contas',
    icon: UserRound,
    description: 'Entre pelo site de cada serviço para liberar conquistas, horas e backup na nuvem. Nenhuma senha ou chave é digitada aqui.',
    render: () => <AccountsSettings />
  },
  { id: 'appearance', label: 'Aparência', icon: Palette, description: 'Cores, fontes e cantos. Tudo muda na hora e fica guardado neste PC.', render: () => <AppearanceSettings /> },
  { id: 'library', label: 'Biblioteca e emuladores', icon: Library, description: 'De onde vêm os seus jogos e o que fica escondido.', render: () => <LibrarySettings /> },
  { id: 'backup', label: 'Backup de saves', icon: HardDriveDownload, description: 'Cópias dos seus saves neste PC e, com o Google Drive conectado, na nuvem.', render: () => <BackupOverviewSettings /> },
  { id: 'behavior', label: 'Comportamento', icon: MonitorCog, description: 'Janela, contagem de horas e capturas de tela.', render: () => <AppBehaviorSettings /> },
  {
    id: 'advanced',
    label: 'Avançado',
    icon: KeyRound,
    description: 'Para quem prefere usar as próprias chaves. Quem entra pelas Contas não precisa de nada daqui.',
    render: () => (
      <div className="space-y-6">
        <ApiKeysSettings />
        <GoogleDriveSettings />
      </div>
    )
  },
  { id: 'help', label: 'Ajuda', icon: LifeBuoy, description: 'Versão, registro de erros e os atalhos do controle e do teclado.', render: () => <HelpSettings /> }
];

// Configurações em seções com navegação lateral: o direcional desce pela lista e o A abre a seção
export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [active, setActive] = useState<SectionId>('accounts');
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <Modal title="Configurações" icon={<Settings className="w-4 h-4 text-indigo-400" />} size="2xl" tall onClose={onClose} bodyClassName="p-0">
      <div className="flex h-full">
        <nav aria-label="Seções das configurações" className="w-56 flex-shrink-0 p-2.5 space-y-0.5 overflow-y-auto border-r border-slate-800 bg-slate-950/30">
          {SECTIONS.map((s) => {
            const on = s.id === active;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={on}
                data-nav-start={on ? '' : undefined}
                onClick={() => setActive(s.id)}
                className={`relative w-full flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-lg text-left text-[13px] transition-colors ${
                  on ? 'bg-indigo-500/15 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                } ${focusRing}`}
              >
                {on && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-indigo-400" />}
                <Icon className={`w-4 h-4 flex-shrink-0 ${on ? 'text-indigo-300' : ''}`} />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </nav>
        <div role="tabpanel" aria-label={section.label} className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
          <header className="mb-5">
            <h2 className="text-xl text-white">{section.label}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{section.description}</p>
          </header>
          <div key={section.id} className="transition-opacity duration-150 starting:opacity-0">
            {section.render()}
          </div>
        </div>
      </div>
    </Modal>
  );
};
