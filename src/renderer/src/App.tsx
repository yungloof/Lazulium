import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { GamepadGuide } from './components/GamepadGuide';
import { EmulatorSettings } from './components/EmulatorSettings';
import { AddCustomGameModal } from './components/AddCustomGameModal';
import { SettingsModal } from './components/SettingsModal';
import { ArtworkPicker } from './components/ArtworkPicker';
import { AchievementsPanel } from './components/AchievementsPanel';
import { SaveBackupPanel } from './components/SaveBackupPanel';
import { ScreenshotsPanel } from './components/ScreenshotsPanel';
import { ProfilePage } from './components/ProfilePage';
import { JournalPage } from './components/JournalPage';
import { GalleryPage } from './components/GalleryPage';
import { WelcomeModal } from './components/WelcomeModal';
import { PlaytimeEditor } from './components/PlaytimeEditor';
import { LibraryFilter, LibrarySidebar } from './components/LibrarySidebar';
import { LibraryHome } from './components/LibraryHome';
import { GamePage } from './components/GamePage';
import { GameContextMenu } from './components/GameContextMenu';
import { useLibraryStore } from './stores/useLibraryStore';
import { useGamepadStore } from './stores/useGamepadStore';
import { useGamepad } from './hooks/useGamepad';
import { Game } from '@shared/types/game';
import { GameAchievements } from '@shared/types/achievements';
import { ScanResult } from '@shared/types/ipc';
import { RefreshCw, Cpu, Plus, AlertTriangle, X, Settings, WifiOff } from 'lucide-react';

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'Todos os jogos' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic Games' },
  { id: 'gog', label: 'GOG Galaxy' },
  { id: 'emulator', label: 'Emuladores' },
  { id: 'riot', label: 'Riot' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'standalone', label: 'Outros PC' }
];

const GAME_UPDATE_BATCH_MS = 120;
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const toolbarButton = `flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-slate-200 transition-colors disabled:opacity-50 ${focusRing}`;

export const App: React.FC = () => {
  const {
    games,
    setGames,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    isScanning,
    setIsScanning,
    toggleFavoriteLocal,
    applyGameStatus
  } = useLibraryStore();

  const { activeFocusedIndex, setActiveFocusedIndex } = useGamepadStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [gridColumns, setGridColumns] = useState(6);
  // Navegação estilo Steam: início da biblioteca ou a página de um jogo
  const [view, setView] = useState<'home' | 'game' | 'profile' | 'journal' | 'gallery'>('home');
  const [screenshotStartId, setScreenshotStartId] = useState<string | undefined>();
  const [showRemoved, setShowRemoved] = useState(() => {
    try {
      return localStorage.getItem('lazulium.showRemoved') === 'true';
    } catch {
      return false;
    }
  });
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [scanSummary, setScanSummary] = useState<ScanResult | null>(null);
  const [showEmulatorSettings, setShowEmulatorSettings] = useState(false);
  const [showAddGameModal, setShowAddGameModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showArtworkPicker, setShowArtworkPicker] = useState(false);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);
  const [showSavesModal, setShowSavesModal] = useState(false);
  const [gameAchievements, setGameAchievements] = useState<GameAchievements | null>(null);
  const [launchNotice, setLaunchNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [showPlaytimeEditor, setShowPlaytimeEditor] = useState(false);
  const [showScreenshots, setShowScreenshots] = useState(false);
  const [screenshotsVersion, setScreenshotsVersion] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showWelcome, setShowWelcome] = useState(false);

  // Primeira execução (sem conta Steam conectada): boas-vindas com as contas
  useEffect(() => {
    Promise.all([window.electronAPI?.getSettings(), window.electronAPI?.getAccountsStatus()])
      .then(([settings, accounts]) => {
        if (settings?.onboardingDone !== 'true' && !accounts?.steam.connected) setShowWelcome(true);
      })
      .catch(() => undefined);
  }, []);

  const finishWelcome = () => {
    setShowWelcome(false);
    void window.electronAPI?.setSetting('onboardingDone', 'true');
  };
  const [contextMenu, setContextMenu] = useState<{ game: Game; x: number; y: number } | null>(null);
  const scanRef = useRef<() => Promise<void>>(async () => {});

  const handleOpenContextMenu = useCallback((game: Game, e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ game, x: e.clientX, y: e.clientY });
  }, []);

  // Trocar de aba sempre começa do topo
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [view]);

  const openGame = useCallback((game: Game) => {
    setSelectedGame(game);
    setView('game');
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const openProfile = useCallback(() => {
    setView('profile');
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => {
    setView('home');
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  // Sem internet: tudo local segue funcionando; serviços online voltam sozinhos
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      window.electronAPI?.notifyNetworkOnline();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Menu da bandeja do sistema (a janela pode ter sido recriada só para executar a ação)
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onTrayAction((action) => {
      if (action === 'scan') void scanRef.current();
    });
    window.electronAPI?.rendererReady();
    return () => unsubscribe?.();
  }, []);

  // Mantém a página do jogo sincronizada com o store (playtime, favorito, execução)
  useEffect(() => {
    setSelectedGame((current) => (current ? games.find((g) => g.id === current.id) ?? current : current));
  }, [games]);

  // Conquistas do jogo aberto (cache local; a sincronização acontece no painel)
  useEffect(() => {
    setGameAchievements(null);
    if (!selectedGame || view !== 'game') return;
    let cancelled = false;
    window.electronAPI
      ?.getAchievements(selectedGame.id)
      .then((res) => !cancelled && setGameAchievements(res))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedGame?.id, view]);

  // Eventos de execução vindos do monitor de processos
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGameStatusChanged((status) => {
      applyGameStatus(status);
      if (status.state !== 'stopped') return;

      const title = status.game?.title ?? useLibraryStore.getState().games.find((g) => g.id === status.gameId)?.title ?? 'Jogo';
      if (status.error) {
        setLaunchNotice({ text: `${title}: ${status.error}`, tone: 'warn' });
      } else if (status.sessionSeconds) {
        const minutes = Math.max(1, Math.round(status.sessionSeconds / 60));
        const idleMin = status.idleSeconds ? Math.round(status.idleSeconds / 60) : 0;
        const idleText = idleMin > 0 ? ` (${idleMin} min ausente descontados)` : '';
        setLaunchNotice({ text: `${title}: sessão de ${minutes} min registrada${idleText}.`, tone: 'ok' });
      } else {
        setLaunchNotice({ text: `${title}: sessão menor que 15 s, não contabilizada.`, tone: 'warn' });
      }
    });
    return () => unsubscribe?.();
  }, [applyGameStatus]);

  // Backup automático de saves ao encerrar a sessão
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onBackupEvent((event) => {
      const title = useLibraryStore.getState().games.find((g) => g.id === event.gameId)?.title ?? 'Jogo';
      if (event.state === 'error') {
        setLaunchNotice({ text: `${title}: backup dos saves falhou (${event.message})`, tone: 'warn' });
      } else if (event.state === 'done' && event.record) {
        const where = event.record.driveFileId ? 'neste PC e no Google Drive' : 'neste PC';
        setLaunchNotice({
          text: `${title}: saves salvos ${where}.${event.record.driveError ? ' (envio ao Drive falhou)' : ''}`,
          tone: event.record.driveError ? 'warn' : 'ok'
        });
      }
    });
    return () => unsubscribe?.();
  }, []);

  // Artes baixadas em segundo plano (SteamGridDB) chegam jogo a jogo
  useEffect(() => {
    // O scan da abertura envia a biblioteca inteira: agrupa para renderizar uma vez só
    const pending = new Map<string, Game>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.electronAPI?.onGameUpdated((game) => {
      pending.set(game.id, game);
      timer ??= setTimeout(() => {
        timer = undefined;
        useLibraryStore.getState().upsertGamesLocal([...pending.values()]);
        pending.clear();
      }, GAME_UPDATE_BATCH_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!launchNotice) return;
    const timer = setTimeout(() => setLaunchNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [launchNotice]);

  // Carrega a biblioteca; na primeira execução (biblioteca vazia) faz um scan automático
  useEffect(() => {
    const loadGames = async () => {
      try {
        const loaded = await window.electronAPI?.getGames();
        if (loaded && loaded.length > 0) setGames(loaded);
        else await handleScanLibraries();
      } catch (err) {
        console.error('Failed to load games:', err);
      }
    };

    loadGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setGames]);

  // Só oferece filtros de plataformas que têm jogos
  const visibleFilters = useMemo(() => {
    return FILTERS.filter((f) => {
      if (f.id === 'all' || f.id === 'favorites') return true;
      return games.some((g) => g.platform === f.id);
    });
  }, [games]);

  useEffect(() => {
    if (games.length > 0 && activeFilter !== 'all' && !visibleFilters.some((f) => f.id === activeFilter)) {
      setActiveFilter('all');
    }
  }, [visibleFilters, activeFilter, setActiveFilter, games.length]);

  const filteredGames = useMemo(() => {
    const searching = !!searchQuery.trim();
    return games.filter((game) => {
      if (game.isHidden) return false;
      // Desinstalados saem das listas (seguem no Diário), mas aparecem ao buscar pelo nome
      if (game.isInstalled === false && !showRemoved && !searching) return false;
      if (activeFilter === 'favorites' && !game.isFavorite) return false;
      if (activeFilter !== 'all' && activeFilter !== 'favorites' && game.platform !== activeFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return game.title.toLowerCase().includes(query) || game.tags?.some((t) => t.toLowerCase().includes(query));
      }
      return true;
    });
  }, [games, activeFilter, searchQuery, showRemoved]);

  // Grade do início em ordem alfabética (a lista lateral agrupa por plataforma)
  const homeGames = useMemo(
    () => [...filteredGames].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' })),
    [filteredGames]
  );

  const anyModalOpen =
    showSettings ||
    showArtworkPicker ||
    showAchievementsModal ||
    showSavesModal ||
    showScreenshots ||
    showEmulatorSettings ||
    showAddGameModal ||
    showPlaytimeEditor ||
    showWelcome ||
    !!contextMenu;

  // Controle e teclado: na grade do início navega pelos jogos; na página do jogo, A = jogar e B = voltar
  useGamepad({
    itemCount: view === 'home' && !anyModalOpen ? homeGames.length : 0,
    columns: gridColumns,
    onSelect: (index) => {
      if (view === 'game') {
        if (selectedGame) void handleLaunchGame(selectedGame);
        return;
      }
      const target = homeGames[index];
      if (target) openGame(target);
    },
    onBack: () => {
      if (contextMenu) setContextMenu(null);
      else if (showSettings) setShowSettings(false);
      else if (showArtworkPicker) setShowArtworkPicker(false);
      else if (showAchievementsModal) setShowAchievementsModal(false);
      else if (showSavesModal) setShowSavesModal(false);
      else if (showScreenshots) setShowScreenshots(false);
      else if (showEmulatorSettings) setShowEmulatorSettings(false);
      else if (showAddGameModal) setShowAddGameModal(false);
      else if (view !== 'home') goHome();
      else if (searchQuery) setSearchQuery('');
    },
    onToggleFavorite: (index) => {
      const target = view === 'game' ? selectedGame : homeGames[index];
      if (target) handleToggleFavorite(target.id);
    },
    onNextTab: () => {
      const currentIndex = visibleFilters.findIndex((f) => f.id === activeFilter);
      setActiveFilter(visibleFilters[(currentIndex + 1) % visibleFilters.length].id);
      setActiveFocusedIndex(0);
    },
    onPrevTab: () => {
      const currentIndex = visibleFilters.findIndex((f) => f.id === activeFilter);
      setActiveFilter(visibleFilters[(currentIndex - 1 + visibleFilters.length) % visibleFilters.length].id);
      setActiveFocusedIndex(0);
    },
    onSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onMenu: () => {
      setShowSettings((prev) => !prev);
    }
  });

  // Voltar como num navegador: botão "voltar" do mouse, Alt+← ou Backspace (fora de campos de texto)
  useEffect(() => {
    if (view === 'home' || anyModalOpen) return;
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) goHome();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        goHome();
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [view, anyModalOpen, goHome]);

  const handleLaunchGame = async (game: Game) => {
    try {
      await window.electronAPI?.launchGame(game.id);
    } catch (err) {
      console.error('Error launching game:', err);
    }
  };

  const handleToggleFavorite = async (id: string) => {
    toggleFavoriteLocal(id);
    try {
      await window.electronAPI?.toggleFavorite(id);
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  const handleScanLibraries = async () => {
    setIsScanning(true);
    try {
      const result = await window.electronAPI?.scanAllLibraries();
      if (result?.games) {
        setGames(result.games);
        setScanSummary(result);
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  scanRef.current = handleScanLibraries;

  const openSettingsFrom = (close: () => void) => () => {
    close();
    setShowSettings(true);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-steam-bg text-slate-100 overflow-hidden">
      <TitleBar />

      {/* Navegação superior (estilo Steam) */}
      <header className="flex items-center justify-between gap-4 px-4 h-12 flex-shrink-0 bg-steam-header border-b border-black/40">
        <nav className="flex items-center gap-1" aria-label="Seções">
          {[
            { label: 'Biblioteca', active: view === 'home' || view === 'game', onClick: goHome },
            { label: 'Diário', active: view === 'journal', onClick: () => setView('journal') },
            { label: 'Capturas', active: view === 'gallery', onClick: () => setView('gallery') },
            { label: 'Perfil', active: view === 'profile', onClick: openProfile }
          ].map((tab) => (
            <button
              key={tab.label}
              onClick={tab.onClick}
              aria-current={tab.active ? 'page' : undefined}
              className={`relative px-3 h-12 text-sm font-medium tracking-wider uppercase transition-colors ${focusRing} ${
                tab.active ? 'text-indigo-400' : 'text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.active && <span className="absolute left-3 right-3 bottom-2 h-0.5 bg-indigo-400" />}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={handleScanLibraries} disabled={isScanning} className={toolbarButton}>
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{isScanning ? 'Escaneando...' : 'Escanear'}</span>
          </button>
          <button onClick={() => setShowEmulatorSettings(true)} className={toolbarButton}>
            <Cpu className="w-3.5 h-3.5" />
            <span>Emuladores</span>
          </button>
          <button onClick={() => setShowAddGameModal(true)} className={toolbarButton} title="Adicionar jogo manual (.exe)">
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar jogo</span>
          </button>
          <button onClick={() => setShowSettings(true)} className={`${toolbarButton} px-2`} title="Configurações" aria-label="Configurações">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {(view === 'home' || view === 'game') && (
        <LibrarySidebar
          games={filteredGames}
          filters={visibleFilters}
          activeFilter={activeFilter}
          onFilterChange={(f) => {
            setActiveFilter(f);
            setActiveFocusedIndex(0);
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchInputRef={searchInputRef}
          selectedGameId={selectedGame?.id}
          isHome={view === 'home'}
          onHome={goHome}
          onOpenGame={openGame}
          onLaunchGame={handleLaunchGame}
          showRemoved={showRemoved}
          onShowRemovedChange={(show) => {
            setShowRemoved(show);
            try {
              localStorage.setItem('lazulium.showRemoved', String(show));
            } catch {
              // Preferência só desta sessão
            }
          }}
          onContextMenu={handleOpenContextMenu}
        />
        )}

        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto relative">
          {/* Avisos */}
          {(scanSummary || !isOnline || launchNotice) && (
            <div className="sticky top-0 z-30 px-6 pt-3 space-y-2">
              {scanSummary && (
                <div className="flex items-start justify-between gap-3 px-4 py-2.5 rounded-md bg-slate-900/95 border border-slate-800 text-xs shadow-lg">
                  <div className="space-y-1">
                    <div className="text-slate-300">
                      Scan concluído: <b className="text-emerald-400">{scanSummary.added}</b> novos,{' '}
                      <b className="text-indigo-300">{scanSummary.updated}</b> atualizados, {scanSummary.total} na biblioteca.
                    </div>
                    {scanSummary.warnings.map((w) => (
                      <div key={w} className="flex items-center gap-1.5 text-amber-400/90">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {w}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setScanSummary(null)} className={`p-1 rounded text-slate-500 hover:text-white ${focusRing}`} aria-label="Fechar">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {!isOnline && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-md border text-xs bg-slate-800/95 border-slate-700 text-slate-300 shadow-lg">
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  Sem conexão. Jogar, rastrear horas e fazer backups locais continua funcionando; artes, conquistas e Google Drive
                  voltam sozinhos quando a internet retornar.
                </div>
              )}
              {launchNotice && (
                <div
                  className={`px-4 py-2 rounded-md border text-xs shadow-lg ${
                    launchNotice.tone === 'ok'
                      ? 'bg-emerald-950/95 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-950/95 border-amber-500/30 text-amber-300'
                  }`}
                >
                  {launchNotice.text}
                </div>
              )}
            </div>
          )}

          {view === 'gallery' ? (
            <GalleryPage
              version={screenshotsVersion}
              onOpenGallery={(gameId, shot) => {
                const game = games.find((g) => g.id === gameId);
                if (!game) return;
                setSelectedGame(game);
                setScreenshotStartId(shot?.id);
                setShowScreenshots(true);
              }}
            />
          ) : view === 'journal' ? (
            <JournalPage
              onOpenGame={openGame}
              onEditPlaytime={(game) => {
                setSelectedGame(game);
                setShowPlaytimeEditor(true);
              }}
            />
          ) : view === 'profile' ? (
            <ProfilePage
              onOpenSettings={() => setShowSettings(true)}
              onSelectGame={(id) => {
                const game = games.find((g) => g.id === id);
                if (game) openGame(game);
              }}
            />
          ) : view === 'game' && selectedGame ? (
            <GamePage
              game={selectedGame}
              achievements={gameAchievements}
              screenshotsVersion={screenshotsVersion}
              onLaunch={handleLaunchGame}
              onToggleFavorite={handleToggleFavorite}
              onOpenAchievements={() => setShowAchievementsModal(true)}
              onOpenScreenshots={() => setShowScreenshots(true)}
              onOpenSaves={() => setShowSavesModal(true)}
              onOpenArtwork={() => setShowArtworkPicker(true)}
              onEditPlaytime={() => setShowPlaytimeEditor(true)}
            />
          ) : (
            <LibraryHome
              games={homeGames}
              focusedIndex={activeFocusedIndex}
              isFiltered={activeFilter !== 'all' || !!searchQuery.trim()}
              onFocusIndex={setActiveFocusedIndex}
              onOpenGame={openGame}
              onToggleFavorite={handleToggleFavorite}
              onColumnsChange={setGridColumns}
              onContextMenu={handleOpenContextMenu}
            />
          )}
        </main>
      </div>

      {/* Guia de controles (controle e teclado) */}
      <GamepadGuide />

      {showWelcome && <WelcomeModal games={games} isScanning={isScanning} onFinish={finishWelcome} />}

      {showEmulatorSettings && <EmulatorSettings onClose={() => setShowEmulatorSettings(false)} />}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showArtworkPicker && selectedGame && (
        <ArtworkPicker
          game={selectedGame}
          onClose={() => setShowArtworkPicker(false)}
          onOpenSettings={openSettingsFrom(() => setShowArtworkPicker(false))}
        />
      )}

      {showAchievementsModal && selectedGame && (
        <AchievementsPanel
          game={selectedGame}
          onClose={() => {
            setShowAchievementsModal(false);
            window.electronAPI?.getAchievements(selectedGame.id).then((res) => setGameAchievements(res));
          }}
          onOpenSettings={openSettingsFrom(() => setShowAchievementsModal(false))}
        />
      )}

      {showScreenshots && selectedGame && (
        <ScreenshotsPanel
          key={`${selectedGame.id}-${screenshotStartId ?? ''}`}
          game={selectedGame}
          initialScreenshotId={screenshotStartId}
          onClose={() => {
            setShowScreenshots(false);
            setScreenshotStartId(undefined);
            setScreenshotsVersion((v) => v + 1);
          }}
        />
      )}

      {showPlaytimeEditor && selectedGame && (
        <PlaytimeEditor game={selectedGame} onClose={() => setShowPlaytimeEditor(false)} />
      )}

      {showSavesModal && selectedGame && (
        <SaveBackupPanel
          game={selectedGame}
          onClose={() => setShowSavesModal(false)}
          onOpenSettings={openSettingsFrom(() => setShowSavesModal(false))}
        />
      )}

      {showAddGameModal && (
        <AddCustomGameModal
          onClose={() => setShowAddGameModal(false)}
          onGameAdded={(newGame) => {
            setGames([...games, newGame]);
            openGame(newGame);
          }}
          onScanComplete={(updatedGames) => setGames(updatedGames)}
        />
      )}

      {contextMenu && (
        <GameContextMenu
          game={contextMenu.game}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onLaunch={handleLaunchGame}
          onStop={(g) => window.electronAPI?.stopGame(g.id)}
          onOpenPage={openGame}
          onToggleFavorite={handleToggleFavorite}
          onOpenArtwork={(g) => {
            setSelectedGame(g);
            setShowArtworkPicker(true);
          }}
          onOpenSaves={(g) => {
            setSelectedGame(g);
            setShowSavesModal(true);
          }}
          onEditPlaytime={(g) => {
            setSelectedGame(g);
            setShowPlaytimeEditor(true);
          }}
          onOpenScreenshots={(g) => {
            setSelectedGame(g);
            setShowScreenshots(true);
          }}
        />
      )}
    </div>
  );
};
