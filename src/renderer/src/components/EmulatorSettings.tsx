import React, { useEffect, useRef, useState } from 'react';
import { EmulatorConfig } from '@shared/types/game';
import { DEFAULT_EMULATOR_PROFILES } from '@shared/constants/emulators';
import { AlertTriangle, FolderPlus, FileCog, Loader2, Search, Trash2, X, Cpu } from 'lucide-react';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface EmulatorSettingsProps {
  onClose: () => void;
  onConfigChanged: () => void;     // Ao fechar, se algo mudou: escaneia de novo
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

export const EmulatorSettings: React.FC<EmulatorSettingsProps> = ({ onClose, onConfigChanged }) => {
  const [configs, setConfigs] = useState<EmulatorConfig[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = useRef(false);
  const notifyChanged = useRef(onConfigChanged);
  notifyChanged.current = onConfigChanged;

  useEffect(
    () => () => {
      if (changed.current) notifyChanged.current();
      changed.current = false;
    },
    []
  );

  const detect = async () => {
    setDetecting(true);
    setError(null);
    try {
      const updated = await window.electronAPI?.detectEmulators();
      if (updated) setConfigs(updated);
      changed.current = true;
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    window.electronAPI?.getEmulatorConfigs().then(setConfigs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (config: EmulatorConfig) => {
    setError(null);
    try {
      const updated = await window.electronAPI?.saveEmulatorConfig(config);
      if (updated) setConfigs(updated);
      changed.current = true;
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const pickExecutable = async (config: EmulatorConfig) => {
    const path = await window.electronAPI?.selectFile([{ name: 'Executáveis', extensions: ['exe'] }]);
    if (path) save({ ...config, executablePath: path, autoDetected: false, enabled: true });
  };

  const pickCore = async (config: EmulatorConfig) => {
    const path = await window.electronAPI?.selectFile([{ name: 'Cores RetroArch', extensions: ['dll'] }]);
    if (path) save({ ...config, corePath: path });
  };

  const addRomDirectory = async (config: EmulatorConfig) => {
    const dir = await window.electronAPI?.selectDirectory();
    if (dir && !config.romDirectories.includes(dir)) {
      save({ ...config, romDirectories: [...config.romDirectories, dir], dismissedRomDirectories: config.dismissedRomDirectories?.filter((d) => d !== dir), enabled: true });
    }
  };

  const removeRomDirectory = (config: EmulatorConfig, dir: string) =>
    save({ ...config, romDirectories: config.romDirectories.filter((d) => d !== dir), dismissedRomDirectories: [...(config.dismissedRomDirectories ?? []), dir] });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-lg bg-steam-bg border border-slate-800 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Cpu className="w-4 h-4 text-indigo-400" /> Emuladores & Pastas de ROMs
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={detect} disabled={detecting} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
              {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Procurar no PC
            </button>
            <button onClick={onClose} aria-label="Fechar" className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-slate-400">
            O app acha os emuladores sozinho e usa as pastas de jogos configuradas neles. Emuladores sem lista de jogos, como mGBA e melonDS, precisam que você adicione a pasta das ROMs.
          </p>
          {error && (
            <p className="flex items-start gap-1.5 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </p>
          )}
          {configs.map((config) => {
            const profile = DEFAULT_EMULATOR_PROFILES[config.emulatorId];
            if (!profile) return null;
            const needsCore = profile.commandTemplate.includes('{core}');

            return (
              <div key={config.emulatorId} className="p-4 rounded-md bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{profile.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {profile.system} · {profile.supportedExtensions.join(' ')}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => save({ ...config, enabled: e.target.checked })}
                      className={`accent-indigo-500 ${focusRing}`}
                    />
                    Ativo
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <button
                    onClick={() => pickExecutable(config)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}
                  >
                    <FileCog className="w-3.5 h-3.5" /> Executável
                  </button>
                  <span className="text-slate-400 truncate max-w-md" title={config.executablePath}>
                    {config.executablePath || 'Não encontrado neste PC'}
                  </span>
                  {config.executablePath && config.autoDetected && <span className="text-[11px] text-emerald-400">Achado automaticamente</span>}
                </div>

                {needsCore && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <button
                      onClick={() => pickCore(config)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}
                    >
                      <FileCog className="w-3.5 h-3.5" /> Core
                    </button>
                    <span className="text-slate-400 truncate max-w-md">{config.corePath || 'Nenhum core selecionado'}</span>
                  </div>
                )}

                <div className="mt-3 space-y-1.5">
                  {config.romDirectories.map((dir) => (
                    <div key={dir} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/60 text-xs text-slate-300">
                      <span className="truncate">{dir}</span>
                      <button
                        onClick={() => removeRomDirectory(config, dir)}
                        className={`p-1 rounded text-slate-500 hover:text-red-400 ${focusRing}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addRomDirectory(config)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-indigo-300 hover:bg-indigo-500/10 ${focusRing}`}
                  >
                    <FolderPlus className="w-3.5 h-3.5" /> Adicionar pasta de ROMs
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
