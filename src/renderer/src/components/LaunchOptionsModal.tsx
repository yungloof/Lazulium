import React, { useEffect, useState } from 'react';
import { AlertTriangle, FileCode, Loader2, X } from 'lucide-react';
import { Game, GameLaunchMode } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Select } from './Select';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const MODE_OPTIONS: { value: GameLaunchMode; label: string }[] = [
  { value: 'direct', label: 'Direto (mais estável)' },
  { value: 'launcher', label: 'Pela Steam' }
];

const MODE_HINT: Record<GameLaunchMode, string> = {
  direct: 'Abre o programa sem passar pela Steam. As horas são contadas pelo Lazulium, sem Steam Input, overlay nem F12 da Steam.',
  launcher: 'Abre pela Steam, com Steam Input, overlay e F12. Se aparecer "Configuração do jogo indisponível", reinicie a Steam.'
};

export const LaunchOptionsModal: React.FC<{ game: Game; onClose: () => void }> = ({ game, onClose }) => {
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [args, setArgs] = useState(game.customLaunchArguments ?? game.launchArguments ?? '');
  const [mode, setMode] = useState<GameLaunchMode>(game.launchMode ?? 'direct');
  const [env, setEnv] = useState(game.launchEnv ?? '');
  const [pre, setPre] = useState(game.preLaunchCommand ?? '');
  const [post, setPost] = useState(game.postExitCommand ?? '');
  const [exported, setExported] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canChooseMode = !!game.launchUri && game.id.startsWith('steam-shortcut-');
  const usesDirect = !canChooseMode || mode === 'direct';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (updates: Partial<Game>) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await window.electronAPI?.updateGame(game.id, updates);
      if (updated) upsertGameLocal(updated);
      onClose();
    } catch (err) {
      setError(ipcErrorMessage(err));
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = args.trim();
    void save({
      // Igual ao que o scanner encontrou não é personalização: continua acompanhando o scan
      customLaunchArguments: clean === (game.launchArguments ?? '').trim() ? undefined : clean,
      launchMode: canChooseMode ? mode : undefined,
      launchEnv: env.trim() || undefined,
      preLaunchCommand: pre.trim() || undefined,
      postExitCommand: post.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-lg rounded-lg bg-steam-panel border border-slate-800 shadow-lg">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <div className="min-w-0">
            <h2 className="text-base text-white">Opções de inicialização</h2>
            <p className="mt-0.5 text-xs text-slate-400 truncate">{game.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {canChooseMode && (
            <div>
              <span className="block mb-1.5 text-[13px] font-medium text-slate-300">Como abrir</span>
              <Select value={mode} options={MODE_OPTIONS} onChange={setMode} ariaLabel="Como abrir" />
              <p className="mt-1.5 text-xs text-slate-500">{MODE_HINT[mode]}</p>
            </div>
          )}
          <label className="block">
            <span className="block mb-1.5 text-[13px] font-medium text-slate-300">Argumentos</span>
            <input
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              disabled={!usesDirect}
              placeholder="--fullscreen"
              spellCheck={false}
              className={`w-full px-3 py-2 text-sm font-mono bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-600 disabled:opacity-50 ${focusRing}`}
            />
            <span className="block mt-1.5 text-xs text-slate-500">{usesDirect ? 'Caminhos com espaço vão entre aspas.' : 'Pela Steam, quem define os argumentos são as propriedades do atalho na Steam.'}</span>
          </label>
          <label className="block">
            <span className="block mb-1.5 text-[13px] font-medium text-slate-300">Variáveis de ambiente</span>
            <textarea
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              disabled={!usesDirect}
              rows={2}
              placeholder={'DXVK_HUD=fps\nSTEAM_COMPAT_DATA=...'}
              spellCheck={false}
              className={`w-full px-3 py-2 text-sm font-mono bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-600 disabled:opacity-50 ${focusRing}`}
            />
            <span className="block mt-1.5 text-xs text-slate-500">Uma por linha, CHAVE=valor. Valem só para este jogo.</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block mb-1.5 text-[13px] font-medium text-slate-300">Antes de abrir</span>
              <input value={pre} onChange={(e) => setPre(e.target.value)} placeholder="ex.: taskkill /im OneDrive.exe" spellCheck={false} className={`w-full px-3 py-2 text-sm font-mono bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-600 ${focusRing}`} />
            </label>
            <label className="block">
              <span className="block mb-1.5 text-[13px] font-medium text-slate-300">Depois de fechar</span>
              <input value={post} onChange={(e) => setPost(e.target.value)} placeholder="ex.: start OneDrive" spellCheck={false} className={`w-full px-3 py-2 text-sm font-mono bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-600 ${focusRing}`} />
            </label>
          </div>
          <p className="text-xs text-slate-500">Os comandos rodam escondidos pelo Prompt de Comando, com limite de 1 minuto. Salve antes de exportar o .bat.</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  setExported((await window.electronAPI?.exportLaunchScript(game.id)) ?? null);
                } catch (err) {
                  setError(ipcErrorMessage(err));
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}
            >
              <FileCode className="w-3.5 h-3.5" /> Exportar como .bat
            </button>
            {exported && <span className="text-xs text-emerald-300 truncate">Salvo em {exported}</span>}
          </div>
          {game.customLaunchArguments !== undefined && (
            <button type="button" onClick={() => save({ customLaunchArguments: undefined })} disabled={saving} className={`text-xs text-indigo-300 hover:text-white rounded-sm ${focusRing}`}>
              Voltar aos argumentos detectados
            </button>
          )}
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button type="button" onClick={onClose} className={`px-3 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={`px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
};
