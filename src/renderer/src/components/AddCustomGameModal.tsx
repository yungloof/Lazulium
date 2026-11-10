import React, { useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import { FolderOpen, FileCode, PlusCircle, FolderPlus, Trash2, RefreshCw, FolderTree, FilePlus } from 'lucide-react';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Modal, Notice, focusRing, hintClass, inputClass, labelClass, pillTabClass } from './ui';

interface AddCustomGameModalProps {
  onClose: () => void;
  onGameAdded: (game: Game) => void;
  onScanComplete?: (games: Game[]) => void;
}

type Tab = 'single' | 'bulk';

export const AddCustomGameModal: React.FC<AddCustomGameModalProps> = ({ onClose, onGameAdded, onScanComplete }) => {
  const [tab, setTab] = useState<Tab>('single');

  // Jogo individual
  const [title, setTitle] = useState('');
  const [executablePath, setExecutablePath] = useState('');
  const [launchArguments, setLaunchArguments] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pastas varridas
  const [directories, setDirectories] = useState<string[]>([]);
  const [isScanningFolders, setIsScanningFolders] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI
      ?.getStandaloneDirectories()
      .then((dirs) => setDirectories(dirs || []))
      .catch(() => undefined);
  }, []);

  // Título e pasta de trabalho saem do arquivo escolhido
  const handleSelectExecutable = async () => {
    try {
      const selected = await window.electronAPI?.selectFile([
        { name: 'Executáveis e Scripts', extensions: ['exe', 'bat', 'cmd'] },
        { name: 'Todos os Arquivos', extensions: ['*'] }
      ]);
      if (!selected) return;
      setExecutablePath(selected);
      setError(null);

      const fileName = selected.split(/[/\\]/).pop() ?? '';
      const baseTitle = fileName.replace(/\.[^/.]+$/, '');
      if (!title.trim() && baseTitle) setTitle(baseTitle.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));

      if (!workingDirectory.trim()) {
        const dir = selected.substring(0, Math.max(selected.lastIndexOf('/'), selected.lastIndexOf('\\')));
        if (dir) setWorkingDirectory(dir);
      }
    } catch {
      setError('Não foi possível abrir a escolha do arquivo.');
    }
  };

  const handleSelectWorkingDirectory = async () => {
    try {
      const dir = await window.electronAPI?.selectDirectory();
      if (dir) setWorkingDirectory(dir);
    } catch {
      setError('Não foi possível abrir a escolha da pasta.');
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
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const handleRemoveFolder = async (dirToRemove: string) => {
    try {
      const updated = await window.electronAPI?.saveStandaloneDirectories(directories.filter((d) => d !== dirToRemove));
      if (updated) {
        setDirectories(updated);
        setScanMessage(null);
      }
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const handleScanStandaloneFolders = async () => {
    setIsScanningFolders(true);
    setScanMessage(null);
    setError(null);
    try {
      const result = await window.electronAPI?.scanPlatform('standalone');
      if (result) {
        setScanMessage(`Varredura concluída: ${result.added} adicionados, ${result.updated} atualizados.`);
        onScanComplete?.(result.games);
      }
    } catch (err) {
      setError(`Falha ao escanear as pastas: ${ipcErrorMessage(err)}`);
    } finally {
      setIsScanningFolders(false);
    }
  };

  const handleSubmitSingle = async () => {
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
      setError(`Falha ao adicionar o jogo: ${ipcErrorMessage(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'single', label: 'Jogo individual (.exe / .bat)', icon: FilePlus },
    { id: 'bulk', label: 'Pastas de jogos', icon: FolderTree, badge: directories.length || undefined }
  ];

  return (
    <Modal
      title="Adicionar jogo de PC"
      subtitle="Jogos soltos, fora da Steam, Epic e GOG"
      icon={<PlusCircle className="w-4 h-4 text-indigo-400" />}
      size="lg"
      onClose={onClose}
      onSubmit={tab === 'single' ? () => void handleSubmitSingle() : undefined}
      toolbar={
        <div className="flex items-center gap-1.5 px-5 py-2.5" role="tablist" aria-label="Como adicionar">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
              className={pillTabClass(tab === id)}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
              {badge !== undefined && <span className="ml-0.5 px-1.5 rounded-full text-[10px] bg-black/20 tabular-nums">{badge}</span>}
            </button>
          ))}
        </div>
      }
      footer={
        tab === 'single' ? (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="primary" size="md" loading={isSubmitting} disabled={!title.trim() || !executablePath.trim()}>
              Adicionar jogo
            </Button>
          </>
        ) : (
          <>
            <span className="mr-auto text-[11px] text-slate-400">Essas pastas também entram no botão Escanear do topo.</span>
            <Button onClick={onClose}>Fechar</Button>
            <Button variant="primary" size="md" disabled={isScanningFolders || directories.length === 0} onClick={handleScanStandaloneFolders}>
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningFolders ? 'animate-spin' : ''}`} />
              {isScanningFolders ? 'Varrendo...' : 'Escanear pastas agora'}
            </Button>
          </>
        )
      }
    >
      {tab === 'single' ? (
        <>
          <div>
            <label htmlFor="add-exe" className={labelClass}>
              Executável ou script (.exe, .bat, .cmd) <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="add-exe"
                type="text"
                placeholder="C:\Caminho\Do\Jogo.exe ou Jogar.bat"
                value={executablePath}
                onChange={(e) => setExecutablePath(e.target.value)}
                spellCheck={false}
                className={`${inputClass} font-mono text-[13px]`}
              />
              <Button onClick={handleSelectExecutable} className="flex-shrink-0 !py-2">
                <FileCode className="w-3.5 h-3.5 text-indigo-300" /> Procurar...
              </Button>
            </div>
          </div>

          <label className="block">
            <span className={labelClass}>
              Título do jogo <span className="text-red-400">*</span>
            </span>
            <input type="text" placeholder="Ex.: Hollow Knight" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </label>

          <div>
            <label htmlFor="add-workdir" className={labelClass}>
              Pasta de trabalho
            </label>
            <div className="flex items-center gap-2">
              <input
                id="add-workdir"
                type="text"
                placeholder="Onde o executável roda (opcional)"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                spellCheck={false}
                className={`${inputClass} font-mono text-[13px]`}
              />
              <Button onClick={handleSelectWorkingDirectory} className="flex-shrink-0 !py-2">
                <FolderOpen className="w-3.5 h-3.5 text-indigo-300" /> Pasta...
              </Button>
            </div>
          </div>

          <label className="block">
            <span className={labelClass}>Argumentos de inicialização</span>
            <input type="text" placeholder="Ex.: -fullscreen (opcional)" value={launchArguments} onChange={(e) => setLaunchArguments(e.target.value)} spellCheck={false} className={`${inputClass} font-mono text-[13px]`} />
            <span className={hintClass}>Caminhos com espaço vão entre aspas.</span>
          </label>
          <Notice>{error}</Notice>
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-slate-400">
            Escolha as pastas onde ficam jogos de PC soltos (ex.: <code className="px-1.5 py-0.5 rounded bg-slate-800/80 text-indigo-200">F:\Games</code>). O Lazulium olha cada subpasta e escolhe o executável
            ou script principal (.exe, .bat).
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-300">Pastas configuradas</span>
              <Button variant="primary" onClick={handleAddFolder}>
                <FolderPlus className="w-3.5 h-3.5" /> Adicionar pasta
              </Button>
            </div>

            {directories.length > 0 ? (
              <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                {directories.map((dir) => (
                  <li key={dir} className="flex items-center justify-between gap-3 pl-3 pr-1.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-slate-200">
                    <span className="truncate font-mono text-[12px]" title={dir}>
                      {dir}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFolder(dir)}
                      className={`p-1.5 rounded-md text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-colors ${focusRing}`}
                      title="Remover pasta"
                      aria-label={`Remover a pasta ${dir}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5 rounded-lg border border-dashed border-slate-700/80 text-center text-xs text-slate-400">
                Nenhuma pasta ainda. Use “Adicionar pasta” para incluir algo como <code className="text-slate-300">F:\Games</code>.
              </div>
            )}
          </div>

          <Notice tone="success">{scanMessage}</Notice>
          <Notice>{error}</Notice>
        </>
      )}
    </Modal>
  );
};
