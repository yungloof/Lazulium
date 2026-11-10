import React, { useEffect, useRef, useState } from 'react';
import { FolderPlus, RefreshCw, Trash2 } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Button, Notice, iconButtonClass } from '../ui';
import { HiddenGamesSettings } from '../HiddenGamesSettings';
import { EmulatorManager } from './EmulatorManager';
import { SettingsGroup } from './controls';

// Escaneia de novo e entrega a biblioteca ao store, como o botão Escanear do topo
async function rescan(task: () => Promise<{ games: Game[] } | undefined>): Promise<string | null> {
  const store = useLibraryStore.getState();
  store.setIsScanning(true);
  try {
    const result = await task();
    if (result?.games) useLibraryStore.getState().setGames(result.games);
    return null;
  } catch (err) {
    return ipcErrorMessage(err);
  } finally {
    useLibraryStore.getState().setIsScanning(false);
  }
}

// Pastas de jogos soltos de PC (a mesma lista do "Adicionar jogo")
const GameFolders: React.FC = () => {
  const [dirs, setDirs] = useState<string[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    window.electronAPI
      ?.getStandaloneDirectories()
      .then((d) => setDirs(d ?? []))
      .catch((err) => setNotice({ tone: 'error', text: ipcErrorMessage(err) }));
  }, []);

  const saveDirs = async (next: string[]) => {
    setNotice(null);
    try {
      const updated = await window.electronAPI?.saveStandaloneDirectories(next);
      if (updated) setDirs(updated);
    } catch (err) {
      setNotice({ tone: 'error', text: ipcErrorMessage(err) });
    }
  };

  const add = async () => {
    const dir = await window.electronAPI?.selectDirectory();
    if (dir && !dirs?.includes(dir)) await saveDirs([...(dirs ?? []), dir]);
  };

  const scan = async () => {
    setScanning(true);
    setNotice(null);
    let summary = '';
    const error = await rescan(async () => {
      const result = await window.electronAPI?.scanPlatform('standalone');
      if (result) summary = `Pronto: ${result.added} novos, ${result.updated} atualizados.`;
      return result;
    });
    setNotice(error ? { tone: 'error', text: error } : summary ? { tone: 'success', text: summary } : null);
    setScanning(false);
  };

  return (
    <SettingsGroup
      title="Pastas de jogos de PC"
      description="Cada subpasta vira um jogo: o Lazulium escolhe o executável principal sozinho."
      actions={
        <Button icon={<RefreshCw className="w-3.5 h-3.5" />} loading={scanning} onClick={scan} disabled={!dirs?.length}>
          Procurar agora
        </Button>
      }
    >
      {dirs?.map((dir) => (
        <div key={dir} className="flex items-center justify-between gap-2 pl-4 pr-2 py-2 text-sm text-slate-200">
          <span className="truncate" title={dir}>
            {dir}
          </span>
          <button onClick={() => void saveDirs(dirs.filter((d) => d !== dir))} aria-label={`Tirar a pasta ${dir}`} title="Tirar a pasta" className={`${iconButtonClass} hover:text-red-300`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="px-2 py-1.5">
        <Button variant="ghost" icon={<FolderPlus className="w-3.5 h-3.5" />} onClick={() => void add()}>
          Adicionar pasta
        </Button>
      </div>
      {notice && (
        <div className="px-4 py-2.5">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
    </SettingsGroup>
  );
};

export const LibrarySettings: React.FC = () => {
  const emulatorsChanged = useRef(false);

  // Mudou emulador: ao sair desta seção, escaneia de novo (como a janela dos emuladores faz ao fechar)
  useEffect(
    () => () => {
      if (emulatorsChanged.current) void rescan(async () => window.electronAPI?.scanAllLibraries());
    },
    []
  );

  return (
    <div className="space-y-6">
      <GameFolders />
      <section>
        <h3 className="mb-2.5 px-1 text-[13px] font-semibold text-slate-200">Emuladores</h3>
        <EmulatorManager onChanged={() => (emulatorsChanged.current = true)} />
      </section>
      <HiddenGamesSettings />
    </div>
  );
};
