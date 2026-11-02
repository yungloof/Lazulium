import React, { useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import {
  X,
  FolderOpen,
  FileCode,
  PlusCircle,
  FolderPlus,
  Trash2,
  RefreshCw,
  FolderTree,
  FilePlus,
  CheckCircle2
} from 'lucide-react';

interface AddCustomGameModalProps {
  onClose: () => void;
  onGameAdded: (game: Game) => void;
  onScanComplete?: (games: Game[]) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

export const AddCustomGameModal: React.FC<AddCustomGameModalProps> = ({
  onClose,
  onGameAdded,
  onScanComplete
}) => {
  const [tab, setTab] = useState<'single' | 'bulk'>('single');

  // Single game form state
  const [title, setTitle] = useState('');
  const [executablePath, setExecutablePath] = useState('');
  const [launchArguments, setLaunchArguments] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk folders state
  const [directories, setDirectories] = useState<string[]>([]);
  const [isScanningFolders, setIsScanningFolders] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    window.electronAPI?.getStandaloneDirectories().then((dirs) => {
      setDirectories(dirs || []);
    });
  }, []);

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
    } catch {
      setError('Erro ao selecionar executável');
    }
  };

  const handleSelectWorkingDirectory = async () => {
    try {
      const dir = await window.electronAPI?.selectDirectory();
      if (dir) {
        setWorkingDirectory(dir);
      }
    } catch {
      setError('Erro ao selecionar diretório');
    }
  };

  const handleAddFolder = async () => {
    try {
      const dir = await window.electronAPI?.selectDirectory();
      if (dir && !directories.includes(dir)) {
        const updated = await window.electronAPI?.saveStandaloneDirectories([...directories, dir]);
        if (updated) {
          setDirectories(updated);
          setScanMessage(null);
        }
      }
    } catch {
      setError('Erro ao selecionar pasta');
    }
  };

  const handleRemoveFolder = async (dirToRemove: string) => {
    try {
      const updated = await window.electronAPI?.saveStandaloneDirectories(
        directories.filter((d) => d !== dirToRemove)
      );
      if (updated) {
        setDirectories(updated);
        setScanMessage(null);
      }
    } catch {
      setError('Erro ao remover pasta');
    }
  };

  const handleScanStandaloneFolders = async () => {
    setIsScanningFolders(true);
    setScanMessage(null);
    try {
      const result = await window.electronAPI?.scanPlatform('standalone');
      if (result) {
        setScanMessage(`Varredura concluída: ${result.added} adicionados, ${result.updated} atualizados.`);
        if (onScanComplete) {
          onScanComplete(result.games);
        }
      }
    } catch (err) {
      setError(`Falha ao escanear pastas: ${(err as Error).message}`);
    } finally {
      setIsScanningFolders(false);
    }
  };

  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Informe o título do jogo.');
      return;
    }

    if (!executablePath.trim()) {
      setError('Selecione o arquivo executável (.exe ou .bat).');
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
        tags: ['Custom', 'Standalone']
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
        className="w-full max-w-xl flex flex-col rounded-lg bg-[#0e1426] border border-slate-800 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-100">Jogos de PC Soltos / Standalone</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-800/80 bg-slate-900/30">
          <button
            onClick={() => setTab('single')}
            className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-semibold border-b-2 transition-all ${
              tab === 'single'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FilePlus className="w-3.5 h-3.5" /> Jogo Individual (.exe / .bat)
          </button>

          <button
            onClick={() => setTab('bulk')}
            className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-semibold border-b-2 transition-all ${
              tab === 'bulk'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" /> Pastas de Jogos (Varredura Automática)
            {directories.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300">
                {directories.length}
              </span>
            )}
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="m-5 mb-0 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Tab 1: Single Game */}
        {tab === 'single' && (
          <form onSubmit={handleSubmitSingle} className="p-5 space-y-4 text-xs">
            {/* Executable Path */}
            <div className="space-y-1.5">
              <label className="block font-medium text-slate-300">
                Executável ou Script (.exe, .bat, .cmd) <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="C:\Caminho\Do\Jogo.exe ou Jogar.bat"
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
                placeholder="Ex: God of War III, Hollow Knight, etc."
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
                className={`px-4 py-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 font-medium ${focusRing}`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || !executablePath.trim()}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
              >
                {isSubmitting ? 'Salvando...' : 'Adicionar Jogo'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Bulk Folders Scanner */}
        {tab === 'bulk' && (
          <div className="p-5 space-y-4 text-xs">
            <div className="text-slate-400">
              Configure as pastas onde você e seus amigos guardam jogos de PC soltos (ex: <code className="text-indigo-300 bg-slate-800/80 px-1.5 py-0.5 rounded">F:\Games</code> ou <code className="text-indigo-300 bg-slate-800/80 px-1.5 py-0.5 rounded">D:\Jogos</code>).
              O Lazulium varrerá automaticamente cada subpasta procurando o executável ou script principal (.exe, .bat).
            </div>

            {/* Directories List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">Pastas Configuradas:</span>
                <button
                  type="button"
                  onClick={handleAddFolder}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium ${focusRing}`}
                >
                  <FolderPlus className="w-3.5 h-3.5" /> Adicionar Pasta
                </button>
              </div>

              {directories.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {directories.map((dir) => (
                    <div
                      key={dir}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                    >
                      <span className="truncate font-mono text-[11px]" title={dir}>
                        {dir}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFolder(dir)}
                        className={`p-1 text-slate-500 hover:text-red-400 rounded ${focusRing}`}
                        title="Remover pasta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-md bg-slate-900/50 border border-dashed border-slate-800 text-center text-slate-500">
                  Nenhuma pasta adicionada ainda. Clique em "Adicionar Pasta" acima para incluir uma pasta como <code className="text-slate-400">F:\Games</code>.
                </div>
              )}
            </div>

            {/* Scan Message */}
            {scanMessage && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{scanMessage}</span>
              </div>
            )}

            {/* Scan Action */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Essas pastas também são escaneadas no botão geral "Escanear".
              </span>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className={`px-4 py-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 font-medium ${focusRing}`}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={isScanningFolders || directories.length === 0}
                  onClick={handleScanStandaloneFolders}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanningFolders ? 'animate-spin' : ''}`} />
                  <span>{isScanningFolders ? 'Varrendo...' : 'Escanear Pastas Agora'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
