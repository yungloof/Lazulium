import React, { useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import { X, FolderOpen, FileCode, PlusCircle } from 'lucide-react';

interface AddCustomGameModalProps {
  onClose: () => void;
  onGameAdded: (game: Game) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

export const AddCustomGameModal: React.FC<AddCustomGameModalProps> = ({ onClose, onGameAdded }) => {
  const [title, setTitle] = useState('');
  const [executablePath, setExecutablePath] = useState('');
  const [launchArguments, setLaunchArguments] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Extrai nome do arquivo sem extensão e pasta pai
  const handleSelectExecutable = async () => {
    try {
      const selected = await window.electronAPI?.selectFile([
        { name: 'Executáveis e Scripts', extensions: ['exe', 'bat', 'cmd'] },
        { name: 'Todos os Arquivos', extensions: ['*'] }
      ]);

      if (selected) {
        setExecutablePath(selected);
        setError(null);

        // Se o título estiver vazio, infere a partir do nome do arquivo
        const fileName = selected.split(/[\/\\]/).pop() ?? '';
        const baseTitle = fileName.replace(/\.[^/.]+$/, '');
        if (!title.trim() && baseTitle) {
          // Converte camelCase ou snake_case para nome legível
          const readableTitle = baseTitle
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          setTitle(readableTitle);
        }

        // Se o diretório de trabalho estiver vazio, infere da pasta do executável
        if (!workingDirectory.trim()) {
          const dir = selected.substring(0, Math.max(selected.lastIndexOf('/'), selected.lastIndexOf('\\')));
          if (dir) {
            setWorkingDirectory(dir);
          }
        }
      }
    } catch (err) {
      setError('Erro ao selecionar executável');
    }
  };

  const handleSelectWorkingDirectory = async () => {
    try {
      const dir = await window.electronAPI?.selectDirectory();
      if (dir) {
        setWorkingDirectory(dir);
      }
    } catch (err) {
      setError('Erro ao selecionar diretório');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Informe o título do jogo.');
      return;
    }

    if (!executablePath.trim()) {
      setError('Selecione o arquivo executável (.exe).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newGame = await window.electronAPI?.addCustomGame({
        title: title.trim(),
        platform: 'standalone',
        executablePath: executablePath.trim(),
        launchArguments: launchArguments.trim() || undefined,
        workingDirectory: workingDirectory.trim() || undefined,
        tags: ['Custom']
      });

      if (newGame) {
        onGameAdded(newGame);
        onClose();
      }
    } catch (err) {
      setError(`Falha ao adicionar jogo: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl flex flex-col rounded-2xl bg-[#0d0f17] border border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <PlusCircle className="w-4 h-4 text-indigo-400" /> Adicionar Jogo Manual / Standalone
          </h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
              {error}
            </div>
          )}

          {/* Executable Path */}
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-300">
              Executável (.exe) <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="C:\Caminho\Do\Jogo.exe"
                value={executablePath}
                onChange={(e) => setExecutablePath(e.target.value)}
                className={`flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 ${focusRing}`}
              />
              <button
                type="button"
                onClick={handleSelectExecutable}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium whitespace-nowrap ${focusRing}`}
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-400" /> Procurar...
              </button>
            </div>
          </div>

          {/* Game Title */}
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-300">
              Título do Jogo <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Hollow Knight, Minecraft, etc."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 ${focusRing}`}
            />
          </div>

          {/* Working Directory */}
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-300">
              Diretório de Trabalho (Working Directory)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Pasta onde o executável roda (opcional)"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                className={`flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 ${focusRing}`}
              />
              <button
                type="button"
                onClick={handleSelectWorkingDirectory}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium whitespace-nowrap ${focusRing}`}
              >
                <FolderOpen className="w-3.5 h-3.5 text-indigo-400" /> Pasta...
              </button>
            </div>
          </div>

          {/* Launch Arguments */}
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-300">
              Argumentos de Inicialização
            </label>
            <input
              type="text"
              placeholder="Ex: -fullscreen -popupwindow (opcional)"
              value={launchArguments}
              onChange={(e) => setLaunchArguments(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 ${focusRing}`}
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-medium ${focusRing}`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !executablePath.trim()}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
            >
              {isSubmitting ? 'Salvando...' : 'Adicionar Jogo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
