import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { ChangelogRelease, getChangelog } from '../utils/changelog';
import { Button, Modal, focusRing } from './ui';

const SECTION_TONE: Record<string, string> = {
  Novidades: 'text-indigo-300',
  Melhorias: 'text-sky-300',
  Correções: 'text-emerald-300'
};

// **negrito** e *itálico* do CHANGELOG, sem HTML vindo de fora
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-slate-800 px-1 text-[0.85em]">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const ReleaseBody: React.FC<{ release: ChangelogRelease }> = ({ release }) => (
  <div className="space-y-4">
    {release.intro && <p className="text-sm leading-relaxed text-slate-300">{inline(release.intro)}</p>}
    {release.sections.map((section) => (
      <section key={section.title}>
        <h4 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${SECTION_TONE[section.title] ?? 'text-slate-400'}`}>{section.title}</h4>
        <ul className="space-y-2">
          {section.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-indigo-400/70 flex-shrink-0" aria-hidden />
              <span>{inline(item)}</span>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
);

interface WhatsNewModalProps {
  onClose: () => void;
  afterUpdate?: boolean;            // Aberta sozinha depois de atualizar
}

// Novidades de cada versão, em linguagem de jogador. Abre sozinha depois de uma atualização e fica em Configurações → Ajuda.
export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ onClose, afterUpdate }) => {
  const releases = useMemo(getChangelog, []);
  const [version, setVersion] = useState<string | null>(null);
  const [openOlder, setOpenOlder] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI
      ?.getAppInfo()
      .then((info) => setVersion(info.version))
      .catch(() => undefined);
  }, []);

  // A versão aberta em destaque; se o CHANGELOG não tiver ela (versão de teste), a mais nova
  const currentIndex = Math.max(0, version ? releases.findIndex((r) => r.version === version) : 0);
  const current = releases[currentIndex];
  const older = releases.slice(currentIndex + 1);

  return (
    <Modal
      title={afterUpdate && current ? `O Lazulium foi atualizado para a ${current.version}` : 'Novidades do Lazulium'}
      subtitle={current?.date}
      icon={<Sparkles className="w-5 h-5 text-indigo-300" />}
      onClose={onClose}
      size="lg"
      tall
      footer={
        <Button variant="primary" size="md" onClick={onClose}>
          {afterUpdate ? 'Bora jogar' : 'Fechar'}
        </Button>
      }
    >
      {!current ? (
        <p className="text-sm text-slate-400">Não foi possível ler as novidades desta versão.</p>
      ) : (
        <>
          <ReleaseBody release={current} />
          {older.length > 0 && (
            <div className="pt-2">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Versões anteriores</h3>
              <div className="rounded-lg border border-slate-800/90 divide-y divide-slate-800/90">
                {older.map((release) => {
                  const open = openOlder === release.version;
                  return (
                    <div key={release.version}>
                      <button
                        type="button"
                        onClick={() => setOpenOlder(open ? null : release.version)}
                        aria-expanded={open}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left rounded-lg hover:bg-slate-800/40 ${focusRing}`}
                      >
                        <span className="text-sm font-semibold text-slate-200">
                          {release.version}
                          {release.date && <span className="ml-2 text-xs font-normal text-slate-500">{release.date}</span>}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div className="px-4 pb-4">
                          <ReleaseBody release={release} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};
