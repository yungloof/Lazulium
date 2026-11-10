import React, { useState } from 'react';
import { FileCode, SlidersHorizontal } from 'lucide-react';
import { Game, GameLaunchMode } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Select } from './Select';
import { Button, Modal, Notice, buttonClass, hintClass, inputClass, labelClass } from './ui';

const MODE_OPTIONS: { value: GameLaunchMode; label: string }[] = [
  { value: 'direct', label: 'Direto (mais estável)' },
  { value: 'launcher', label: 'Pela Steam' }
];

const MODE_HINT: Record<GameLaunchMode, string> = {
  direct: 'Abre o programa sem passar pela Steam. As horas são contadas pelo Lazulium, sem Steam Input, overlay nem F12 da Steam.',
  launcher: 'Abre pela Steam, com Steam Input, overlay e F12. Se aparecer "Configuração do jogo indisponível", reinicie a Steam.'
};

const codeInput = `${inputClass} font-mono`;

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

  const submit = () => {
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
    <Modal
      title="Opções de inicialização"
      subtitle={game.title}
      icon={<SlidersHorizontal className="w-4 h-4 text-indigo-400" />}
      size="md"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      {canChooseMode && (
        <div>
          <span className={labelClass}>Como abrir</span>
          <Select value={mode} options={MODE_OPTIONS} onChange={setMode} ariaLabel="Como abrir" />
          <span className={hintClass}>{MODE_HINT[mode]}</span>
        </div>
      )}
      <label className="block">
        <span className={labelClass}>Argumentos</span>
        <input value={args} onChange={(e) => setArgs(e.target.value)} disabled={!usesDirect} placeholder="--fullscreen" spellCheck={false} className={codeInput} />
        <span className={hintClass}>{usesDirect ? 'Caminhos com espaço vão entre aspas.' : 'Pela Steam, quem define os argumentos são as propriedades do atalho na Steam.'}</span>
      </label>
      <label className="block">
        <span className={labelClass}>Variáveis de ambiente</span>
        <textarea value={env} onChange={(e) => setEnv(e.target.value)} disabled={!usesDirect} rows={2} placeholder={'DXVK_HUD=fps\nSTEAM_COMPAT_DATA=...'} spellCheck={false} className={codeInput} />
        <span className={hintClass}>Uma por linha, CHAVE=valor. Valem só para este jogo.</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Antes de abrir</span>
          <input value={pre} onChange={(e) => setPre(e.target.value)} placeholder="ex.: taskkill /im OneDrive.exe" spellCheck={false} className={codeInput} />
        </label>
        <label className="block">
          <span className={labelClass}>Depois de fechar</span>
          <input value={post} onChange={(e) => setPost(e.target.value)} placeholder="ex.: start OneDrive" spellCheck={false} className={codeInput} />
        </label>
      </div>
      <p className="text-xs text-slate-400">Os comandos rodam escondidos pelo Prompt de Comando, com limite de 1 minuto. Salve antes de exportar o .bat.</p>
      <div className="flex items-center gap-3">
        <Button
          onClick={async () => {
            setError(null);
            try {
              setExported((await window.electronAPI?.exportLaunchScript(game.id)) ?? null);
            } catch (err) {
              setError(ipcErrorMessage(err));
            }
          }}
        >
          <FileCode className="w-3.5 h-3.5" /> Exportar como .bat
        </Button>
        {exported && (
          <Notice tone="success" className="min-w-0 truncate">
            Salvo em {exported}
          </Notice>
        )}
      </div>
      {game.customLaunchArguments !== undefined && (
        <button type="button" onClick={() => save({ customLaunchArguments: undefined })} disabled={saving} className={buttonClass('link')}>
          Voltar aos argumentos detectados
        </button>
      )}
      <Notice>{error}</Notice>
    </Modal>
  );
};
