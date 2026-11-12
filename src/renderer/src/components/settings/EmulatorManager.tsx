import React, { useEffect, useRef, useState } from 'react';
import { Download, FileCog, FolderPlus, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { CustomEmulatorDefinition, EmulatorConfig } from '@shared/types/game';
import { CUSTOM_EMULATOR_TEMPLATES, resolveEmulatorProfile, sanitizeCustomEmulator } from '@shared/constants/emulators';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Select } from '../Select';
import { Button, Notice, Skeleton, focusRing, hintClass, iconButtonClass, inputClass } from '../ui';
import { Switch } from './controls';

interface DraftEmulator {
  id?: EmulatorConfig['emulatorId'];   // Preenchido ao editar um que já existe
  name: string;
  system: string;
  extensions: string;
  commandTemplate: string;
}

const EMPTY_DRAFT: DraftEmulator = { name: '', system: '', extensions: '', commandTemplate: '"{rom}"' };
const TEMPLATE_OPTIONS = [{ value: '', label: 'Começar de um modelo...' }, ...CUSTOM_EMULATOR_TEMPLATES.map((t) => ({ value: t.name, label: `${t.name} (${t.system})` }))];

// Emuladores e pastas de ROMs: a mesma lista na janela dos emuladores e em Configurações → Biblioteca.
// onChanged avisa a cada mudança salva (quem usa decide quando escanear de novo).
export const EmulatorManager: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [configs, setConfigs] = useState<EmulatorConfig[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftEmulator | null>(null);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  useEffect(() => {
    window.electronAPI
      ?.getEmulatorConfigs()
      .then(setConfigs)
      .catch((err) => setError(ipcErrorMessage(err)));
  }, []);

  // Toda ação devolve a lista nova; erro vira aviso em vez de sumir
  const apply = async (work: () => Promise<EmulatorConfig[] | undefined>) => {
    setError(null);
    try {
      const updated = await work();
      if (updated) {
        setConfigs(updated);
        changed.current();
      }
      return true;
    } catch (err) {
      setError(ipcErrorMessage(err));
      return false;
    }
  };

  const save = (config: EmulatorConfig) => apply(async () => window.electronAPI?.saveEmulatorConfig(config));

  const detect = async () => {
    setDetecting(true);
    await apply(async () => window.electronAPI?.detectEmulators());
    setDetecting(false);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const definition: CustomEmulatorDefinition | null = sanitizeCustomEmulator({
      name: draft.name,
      system: draft.system,
      extensions: draft.extensions.split(/[\s,;]+/).filter(Boolean),
      commandTemplate: draft.commandTemplate
    });
    if (!definition) {
      setError('Preencha o nome, ao menos uma extensão (como .iso) e o comando.');
      return;
    }
    const existing = draft.id ? configs?.find((c) => c.emulatorId === draft.id) : undefined;
    const config: EmulatorConfig = existing
      ? { ...existing, custom: definition }
      : { emulatorId: ('custom-' + crypto.randomUUID()) as EmulatorConfig['emulatorId'], enabled: false, romDirectories: [], custom: definition };
    if (await save(config)) setDraft(null);
  };

  const exportPresets = async () => {
    setNotice(null);
    await apply(async () => {
      const path = await window.electronAPI?.exportEmulatorPresets();
      if (path) setNotice(`Presets salvos em ${path}`);
      return undefined;
    });
  };

  const importPresets = async () => {
    setNotice(null);
    await apply(async () => {
      const result = await window.electronAPI?.importEmulatorPresets();
      if (!result) return undefined;
      setNotice(result.added > 0 ? `${result.added} emulador(es) importado(s). Escolha o executável de cada um para ativar.` : 'Nada novo: esses emuladores já estavam na lista.');
      return result.configs;
    });
  };

  const pickExecutable = async (config: EmulatorConfig) => {
    const path = await window.electronAPI?.selectFile([{ name: 'Executáveis', extensions: ['exe'] }]);
    if (path) void save({ ...config, executablePath: path, autoDetected: false, enabled: true });
  };

  const pickCore = async (config: EmulatorConfig) => {
    const path = await window.electronAPI?.selectFile([{ name: 'Cores RetroArch', extensions: ['dll'] }]);
    if (path) void save({ ...config, corePath: path });
  };

  const addRomDirectory = async (config: EmulatorConfig) => {
    const dir = await window.electronAPI?.selectDirectory();
    if (dir && !config.romDirectories.includes(dir)) {
      void save({ ...config, romDirectories: [...config.romDirectories, dir], dismissedRomDirectories: config.dismissedRomDirectories?.filter((d) => d !== dir), enabled: true });
    }
  };

  const removeRomDirectory = (config: EmulatorConfig, dir: string) =>
    save({ ...config, romDirectories: config.romDirectories.filter((d) => d !== dir), dismissedRomDirectories: [...(config.dismissedRomDirectories ?? []), dir] });

  const editCustom = (config: EmulatorConfig) => {
    const c = config.custom!;
    setDraft({ id: config.emulatorId, name: c.name, system: c.system, extensions: c.extensions.join(' '), commandTemplate: c.commandTemplate });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-slate-400">
        Os emuladores são achados sozinhos, com as pastas de jogos configuradas neles. Os que não têm lista de jogos, como mGBA e melonDS, precisam da pasta das ROMs adicionada aqui.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Search className="w-3.5 h-3.5" />} loading={detecting} onClick={detect}>
          Procurar no PC
        </Button>
        <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          Novo emulador
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" icon={<Upload className="w-3.5 h-3.5" />} onClick={importPresets}>
          Importar presets
        </Button>
        {configs?.some((c) => c.custom) && (
          <Button variant="ghost" icon={<Download className="w-3.5 h-3.5" />} onClick={exportPresets}>
            Exportar
          </Button>
        )}
      </div>
      <Notice tone="success">{notice}</Notice>

      {draft && (
        <div className="p-4 rounded-lg bg-slate-900/70 border border-indigo-500/40 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-100">{draft.id ? 'Editar emulador' : 'Novo emulador'}</span>
            {!draft.id && (
              <Select
                value=""
                options={TEMPLATE_OPTIONS}
                onChange={(name) => {
                  const t = CUSTOM_EMULATOR_TEMPLATES.find((x) => x.name === name);
                  if (t) setDraft({ name: t.name, system: t.system, extensions: t.extensions.join(' '), commandTemplate: t.commandTemplate });
                }}
                ariaLabel="Modelo de emulador"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nome (ex.: Xemu)" aria-label="Nome" className={inputClass} />
            <input value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })} placeholder="Sistema (ex.: Xbox)" aria-label="Sistema" className={inputClass} />
          </div>
          <input value={draft.extensions} onChange={(e) => setDraft({ ...draft, extensions: e.target.value })} placeholder="Extensões das ROMs (ex.: .iso .xex)" aria-label="Extensões" className={inputClass} />
          <div>
            <input
              value={draft.commandTemplate}
              onChange={(e) => setDraft({ ...draft, commandTemplate: e.target.value })}
              placeholder='Comando (ex.: -dvd_path "{rom}")'
              aria-label="Comando"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
            <span className={hintClass}>
              Vale {'{rom}'} (caminho da ROM), {'{romname}'} (nome sem extensão), {'{romdir}'} (pasta da ROM) e {'{core}'}. Caminhos com espaço vão entre aspas.
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDraft(null)}>Cancelar</Button>
            <Button variant="primary" onClick={saveDraft}>
              Salvar
            </Button>
          </div>
        </div>
      )}

      <Notice>{error}</Notice>

      {!configs ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        configs.map((config) => {
          const profile = resolveEmulatorProfile(config);
          if (!profile) return null;
          const needsCore = profile.commandTemplate.includes('{core}');
          return (
            <div key={config.emulatorId} className={`rounded-lg border transition-colors ${config.enabled ? 'bg-slate-900/60 border-slate-700/80' : 'bg-slate-900/30 border-slate-800'}`}>
              <div className="flex items-center gap-3 px-4 pt-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-100 truncate">{profile.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {profile.system} · {profile.supportedExtensions.join(' ')}
                  </div>
                </div>
                {config.custom && (
                  <>
                    <button onClick={() => editCustom(config)} aria-label={`Editar ${profile.name}`} title="Editar" className={iconButtonClass}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => void apply(async () => window.electronAPI?.deleteEmulatorConfig(config.emulatorId))} aria-label={`Remover ${profile.name}`} title="Remover" className={`${iconButtonClass} hover:text-red-300`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.enabled}
                  aria-label={`${profile.name} ativo`}
                  onClick={() => void save({ ...config, enabled: !config.enabled })}
                  className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${focusRing}`}
                >
                  {config.enabled ? 'Ativo' : 'Desligado'}
                  <Switch checked={config.enabled} />
                </button>
              </div>

              <div className="px-4 pb-3 pt-2.5 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Button icon={<FileCog className="w-3.5 h-3.5" />} onClick={() => void pickExecutable(config)} className="flex-shrink-0">
                    Executável
                  </Button>
                  <span className="min-w-0 text-slate-400 truncate" title={config.executablePath}>
                    {config.executablePath || (config.custom ? 'Escolha o executável' : 'Não encontrado neste PC')}
                  </span>
                  {config.executablePath && config.autoDetected && <span className="flex-shrink-0 text-[11px] text-emerald-400">achado sozinho</span>}
                </div>
                {needsCore && (
                  <div className="flex items-center gap-2 min-w-0">
                    <Button icon={<FileCog className="w-3.5 h-3.5" />} onClick={() => void pickCore(config)} className="flex-shrink-0">
                      Core
                    </Button>
                    <span className="min-w-0 text-slate-400 truncate">{config.corePath || 'Nenhum core selecionado'}</span>
                  </div>
                )}
                {config.romDirectories.map((dir) => (
                  <div key={dir} className="flex items-center justify-between gap-2 pl-3 pr-1 py-1 rounded-lg bg-slate-950/60 text-slate-300">
                    <span className="truncate" title={dir}>
                      {dir}
                    </span>
                    <button onClick={() => void removeRomDirectory(config, dir)} aria-label={`Tirar a pasta ${dir}`} title="Tirar a pasta" className={`${iconButtonClass} hover:text-red-300`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <Button variant="link" icon={<FolderPlus className="w-3.5 h-3.5" />} onClick={() => void addRomDirectory(config)} className="py-1">
                  Adicionar pasta de ROMs
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
