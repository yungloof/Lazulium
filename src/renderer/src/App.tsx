import React, { useEffect, useState, useMemo, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { GameCard } from './components/GameCard';
import { GamepadGuide } from './components/GamepadGuide';
import { EmulatorSettings } from './components/EmulatorSettings';
import { AddCustomGameModal } from './components/AddCustomGameModal';
import { PlayButton } from './components/PlayButton';
import { GameStats } from './components/GameStats';
import { SettingsModal } from './components/SettingsModal';
import { ArtworkPicker } from './components/ArtworkPicker';
import { AchievementsPanel } from './components/AchievementsPanel';
import { SaveBackupPanel } from './components/SaveBackupPanel';
import { useLibraryStore } from './stores/useLibraryStore';
import { useGamepadStore } from './stores/useGamepadStore';
import { useGamepad } from './hooks/useGamepad';
import { Game, GamePlatform } from '@shared/types/game';
import { GameAchievements } from '@shared/types/achievements';
import { ScanResult } from '@shared/types/ipc';
import {
  Search,
  RefreshCw,
  Cpu,
  Plus,
  AlertTriangle,
  X,
  Trophy,
  Clock,
  Layers,
  Sparkles,
  Flame,
  Settings,
  ImageIcon,
  Save,
  Pencil,
  WifiOff,
  Camera,
  UserRound
} from 'lucide-react';
import { ScreenshotsPanel } from './components/ScreenshotsPanel';
import { ProfilePanel } from './components/ProfilePanel';
import { PlaytimeEditor } from './components/PlaytimeEditor';

// Largura mínima de cada capa por densidade: a grade preenche a linha com quantas couberem
type GridDensity = 'compact' | 'normal' | 'large';
const GRID_DENSITY: Record<GridDensity, { label: string; minWidth: number; gap: number }> = {
  compact: { label: 'Compacto', minWidth: 112, gap: 10 },
  normal: { label: 'Padrão', minWidth: 140, gap: 14 },
  large: { label: 'Grande', minWidth: 190, gap: 18 }
};
const DENSITY_STORAGE_KEY = 'lazulium.gridDensity';

function loadDensity(): GridDensity {
  try {
    const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
    return saved && saved in GRID_DENSITY ? (saved as GridDensity) : 'normal';
  } catch {
    return 'normal';
  }
}

const FILTERS: { id: 'all' | GamePlatform | 'favorites'; label: string }[] = [
  { id: 'all', label: 'Todos os Jogos' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic Games' },
  { id: 'gog', label: 'GOG Galaxy' },
  { id: 'emulator', label: 'Emuladores' },
  { id: 'riot', label: 'Riot' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'standalone', label: 'Outros PC' }
];

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
    applyGameStatus,
    upsertGameLocal
  } = useLibraryStore();

  const { activeFocusedIndex, setActiveFocusedIndex } = useGamepadStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState<GridDensity>(loadDensity);
  const [gridColumns, setGridColumns] = useState(6);

  const changeDensity = (next: GridDensity) => {
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      // Preferência só desta sessão
    }
  };

  // Colunas reais da grade (auto-fill): a navegação por controle/setas precisa saber o que fica "abaixo"
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const { minWidth, gap } = GRID_DENSITY[density];
    const update = () => setGridColumns(Math.max(1, Math.floor((el.clientWidth + gap) / (minWidth + gap))));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [density, games.length, activeFilter, searchQuery]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [scanSummary, setScanSummary] = useState<ScanResult | null>(null);
  const [showEmulatorSettings, setShowEmulatorSettings] = useState(false);
  const [showAddGameModal, setShowAddGameModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showArtworkPicker, setShowArtworkPicker] = useState(false);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);
  const [showSavesModal, setShowSavesModal] = useState(false);
  const [heroAchievements, setHeroAchievements] = useState<GameAchievements | null>(null);
  const [brokenLogoUrl, setBrokenLogoUrl] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [showPlaytimeEditor, setShowPlaytimeEditor] = useState(false);
  const [showScreenshots, setShowScreenshots] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [screenshotCount, setScreenshotCount] = useState(0);

  // Quantidade de capturas do jogo em destaque (Steam F12, Game Bar e anexadas)
  useEffect(() => {
    setScreenshotCount(0);
    if (!selectedGame) return;
    let cancelled = false;
    window.electronAPI
      ?.listScreenshots(selectedGame.id)
      .then((list) => !cancelled && setScreenshotCount(list.length))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedGame?.id]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const scanRef = useRef<() => Promise<void>>(async () => {});

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

  // Mantém o jogo do hero sincronizado com o store (playtime, favorito, execução)
  useEffect(() => {
    setSelectedGame((current) => (current ? games.find((g) => g.id === current.id) ?? current : current));
  }, [games]);

  // Carrega contagem de conquistas do jogo selecionado para o spotlight do hero
  useEffect(() => {
    if (!selectedGame) {
      setHeroAchievements(null);
      return;
    }
    window.electronAPI?.getAchievements(selectedGame.id)
      .then((res) => setHeroAchievements(res))
      .catch(() => setHeroAchievements(null));
  }, [selectedGame?.id]);

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
    const unsubscribe = window.electronAPI?.onGameUpdated((game) => upsertGameLocal(game));
    return () => unsubscribe?.();
  }, [upsertGameLocal]);

  useEffect(() => {
    if (!launchNotice) return;
    const timer = setTimeout(() => setLaunchNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [launchNotice]);

  // Load games from local storage on mount; first run triggers an automatic scan
  useEffect(() => {
    const loadGames = async () => {
      try {
        const loaded = await window.electronAPI?.getGames();
        if (loaded && loaded.length > 0) {
          setGames(loaded);
          setSelectedGame(loaded[0]);
        } else {
          await handleScanLibraries();
        }
      } catch (err) {
        console.error('Failed to load games:', err);
      }
    };

    loadGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setGames]);

  // Esconde abas de plataformas sem jogos para não quebrar a barra em 1024px
  const visibleFilters = useMemo(() => {
    return FILTERS.filter((f) => {
      if (f.id === 'all' || f.id === 'favorites') return true;
      return games.some((g) => g.platform === f.id);
    });
  }, [games]);

  useEffect(() => {
    if (activeFilter !== 'all' && !visibleFilters.some((f) => f.id === activeFilter)) {
      setActiveFilter('all');
    }
  }, [visibleFilters, activeFilter, setActiveFilter]);

  // Filter and search computation
  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      // Platform filter
      if (activeFilter === 'favorites' && !game.isFavorite) return false;
      if (activeFilter !== 'all' && activeFilter !== 'favorites' && game.platform !== activeFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = game.title.toLowerCase().includes(query);
        const matchesTags = game.tags?.some((t) => t.toLowerCase().includes(query));
        return matchesTitle || matchesTags;
      }
      return true;
    });
  }, [games, activeFilter, searchQuery]);

  // Sync focused game when index changes
  useEffect(() => {
    if (filteredGames[activeFocusedIndex]) {
      setSelectedGame(filteredGames[activeFocusedIndex]);
    }
  }, [activeFocusedIndex, filteredGames]);

  // Gamepad navigation hook
  useGamepad({
    itemCount: filteredGames.length,
    columns: gridColumns,
    onSelect: (index) => {
      const target = filteredGames[index];
      if (target) {
        setSelectedGame(target);
        handleLaunchGame(target);
      }
    },
    onBack: () => {
      if (showSettings) setShowSettings(false);
      else if (showArtworkPicker) setShowArtworkPicker(false);
      else if (showAchievementsModal) setShowAchievementsModal(false);
      else if (showSavesModal) setShowSavesModal(false);
      else if (showScreenshots) setShowScreenshots(false);
      else if (showProfile) setShowProfile(false);
      else if (showEmulatorSettings) setShowEmulatorSettings(false);
      else if (showAddGameModal) setShowAddGameModal(false);
      else if (searchQuery) setSearchQuery('');
    },
    onToggleFavorite: (index) => {
      const target = filteredGames[index];
      if (target) handleToggleFavorite(target.id);
    },
    onNextTab: () => {
      const currentIndex = visibleFilters.findIndex((f) => f.id === activeFilter);
      const nextIndex = (currentIndex + 1) % visibleFilters.length;
      setActiveFilter(visibleFilters[nextIndex].id);
      setActiveFocusedIndex(0);
    },
    onPrevTab: () => {
      const currentIndex = visibleFilters.findIndex((f) => f.id === activeFilter);
      const prevIndex = (currentIndex - 1 + visibleFilters.length) % visibleFilters.length;
      setActiveFilter(visibleFilters[prevIndex].id);
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

  const handleLaunchGame = async (game: Game) => {
    try {
      console.log('Launching game:', game.title);
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
        setSelectedGame((current) => current ?? result.games[0] ?? null);
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  scanRef.current = handleScanLibraries;

  const formatHours = (seconds: number) => {
    if (!seconds) return '0 hrs';
    return `${(seconds / 3600).toFixed(1)} hrs`;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090a0f] text-slate-100 overflow-hidden">
      {/* Frameless Custom Titlebar */}
      <TitleBar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Dynamic Hero Background Banner */}
        {selectedGame?.media?.heroUrl && (
          <div className="absolute top-0 inset-x-0 h-96 overflow-hidden pointer-events-none opacity-25 -z-0">
            <img
              src={selectedGame.media.heroUrl}
              alt=""
              className="w-full h-full object-cover blur-sm scale-105"
              onError={() => window.electronAPI?.reportBrokenArtwork(selectedGame.id, 'hero')}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#090a0f]/20 via-[#090a0f]/80 to-[#090a0f]" />
          </div>
        )}

        {/* Top Control Bar: Search & Platform Tabs & Scan */}
        <div className="px-6 pt-4 pb-3 flex flex-wrap items-center justify-between gap-4 z-10">
          {/* Platform Filters */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md">
            {visibleFilters.map((f) => {
              const active = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => {
                    setActiveFilter(f.id);
                    setActiveFocusedIndex(0);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar jogos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-60 pl-9 pr-3 py-1.5 text-xs bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Scan Button */}
            <button
              onClick={handleScanLibraries}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isScanning ? 'Escaneando...' : 'Escanear'}</span>
            </button>

            {/* Emulator Settings Button */}
            <button
              onClick={() => setShowEmulatorSettings(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-slate-200 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Emuladores</span>
            </button>

            {/* Add Custom Game Button */}
            <button
              onClick={() => setShowAddGameModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 rounded-lg transition-colors"
              title="Adicionar jogo manual (.exe)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Jogo</span>
            </button>

            {/* Perfil do Jogador */}
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              title="Seu perfil: horas, conquistas raras e favoritos"
            >
              <UserRound className="w-3.5 h-3.5" />
              <span>Perfil</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-slate-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              title="Configurações"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scan Summary */}
        {scanSummary && (
          <div className="px-6 z-10">
            <div className="flex items-start justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
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
              <button onClick={() => setScanSummary(null)} className="p-1 rounded text-slate-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Selected Game Quick Banner (Hero Spotlight) */}
        {selectedGame && (
          <div className="px-6 py-3 z-10">
            <div className="flex flex-col p-4 rounded-2xl bg-gradient-to-r from-slate-900/95 via-slate-900/80 to-transparent border border-slate-800/80 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-24 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0 shadow-lg border border-slate-700/50">
                    {selectedGame.media?.coverUrl ? (
                      <img src={selectedGame.media.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <Sparkles className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase tracking-wide">
                        {selectedGame.platform === 'emulator' ? selectedGame.emulatorId : selectedGame.platform}
                      </span>
                      {selectedGame.isFavorite && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          <Flame className="w-3 h-3 fill-amber-400" /> Favorito
                        </span>
                      )}
                    </div>
                    {selectedGame.media?.logoUrl && selectedGame.media.logoUrl !== brokenLogoUrl ? (
                      <h2 className="h-14 flex items-center" title={selectedGame.title}>
                        <img
                          src={selectedGame.media.logoUrl}
                          alt={selectedGame.title}
                          className="max-h-full max-w-[320px] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                          onError={() => {
                            setBrokenLogoUrl(selectedGame.media?.logoUrl ?? null);
                            window.electronAPI?.reportBrokenArtwork(selectedGame.id, 'logo');
                          }}
                        />
                      </h2>
                    ) : (
                      <h2 className="text-xl font-extrabold text-white tracking-tight">{selectedGame.title}</h2>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      {selectedGame.platform === 'steam' ? (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-400" />
                          {formatHours(selectedGame.totalPlaytimeSeconds)} jogadas
                        </span>
                      ) : (
                        <button
                          onClick={() => setShowPlaytimeEditor(true)}
                          className="group flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors rounded px-1.5 py-0.5 -ml-1.5 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                          title="Ajustar tempo jogado"
                        >
                          <Clock className="w-3.5 h-3.5 text-indigo-400" />
                          {formatHours(selectedGame.totalPlaytimeSeconds)} jogadas
                          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
                        </button>
                      )}
                      <button
                        onClick={() => setShowAchievementsModal(true)}
                        className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-amber-300 transition-colors rounded px-1.5 py-0.5 -ml-1.5 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        title="Ver conquistas do jogo"
                      >
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {heroAchievements && heroAchievements.total > 0
                            ? `${heroAchievements.unlocked}/${heroAchievements.total} conquistas`
                            : 'Conquistas'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Action Launch Button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowArtworkPicker(true)}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    title="Trocar capa, banner, logo e ícone"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Artes</span>
                  </button>
                  <button
                    onClick={() => setShowScreenshots(true)}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    title="Galeria de capturas de tela"
                  >
                    <Camera className="w-4 h-4 text-indigo-300" />
                    <span>Capturas{screenshotCount > 0 ? ` (${screenshotCount})` : ''}</span>
                  </button>
                  <button
                    onClick={() => setShowSavesModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    title="Backup e restauração de saves"
                  >
                    <Save className="w-4 h-4 text-sky-400" />
                    <span>Saves</span>
                  </button>
                  <button
                    onClick={() => setShowAchievementsModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    title="Ver conquistas do jogo"
                  >
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>Conquistas</span>
                  </button>
                  <PlayButton game={selectedGame} onLaunch={handleLaunchGame} />
                </div>
              </div>

              {/* Estatísticas Detalhadas & Gráfico dos Últimos 7 Dias */}
              <GameStats game={selectedGame} />
            </div>
          </div>
        )}

        {!isOnline && (
          <div className="px-6 z-10">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs bg-slate-800/60 border-slate-700 text-slate-300">
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              Sem conexão. Jogar, rastrear horas e fazer backups locais continua funcionando; artes, conquistas e Google Drive
              voltam sozinhos quando a internet retornar.
            </div>
          </div>
        )}

        {/* Launch / Session Notice */}
        {launchNotice && (
          <div className="px-6 z-10">
            <div
              className={`px-4 py-2 rounded-xl border text-xs ${
                launchNotice.tone === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              {launchNotice.text}
            </div>
          </div>
        )}

        {/* Games Grid Container */}
        <div className="flex-1 overflow-y-auto px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Biblioteca ({filteredGames.length})
            </span>
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-900/80 border border-slate-800" role="group" aria-label="Tamanho das capas">
              {(Object.keys(GRID_DENSITY) as GridDensity[]).map((d) => (
                <button
                  key={d}
                  onClick={() => changeDensity(d)}
                  aria-pressed={density === d}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    density === d ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {GRID_DENSITY[d].label}
                </button>
              ))}
            </div>
          </div>

          {filteredGames.length > 0 ? (
            <div
              ref={gridRef}
              className="grid pb-8"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_DENSITY[density].minWidth}px, 1fr))`,
                gap: GRID_DENSITY[density].gap
              }}
            >
              {filteredGames.map((game, index) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isFocused={index === activeFocusedIndex}
                  onSelect={(g) => {
                    setActiveFocusedIndex(index);
                    setSelectedGame(g);
                  }}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 rounded-2xl border border-slate-800/60 mt-4">
              <Search className="w-10 h-10 text-slate-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-300">Nenhum jogo encontrado</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Tente ajustar sua busca ou filtro, ou clique em "Escanear" para detectar jogos instalados.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Gamepad & Keyboard Controls Helper Guide */}
      <GamepadGuide />

      {showEmulatorSettings && (
        <EmulatorSettings onClose={() => setShowEmulatorSettings(false)} />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showArtworkPicker && selectedGame && (
        <ArtworkPicker
          game={selectedGame}
          onClose={() => setShowArtworkPicker(false)}
          onOpenSettings={() => {
            setShowArtworkPicker(false);
            setShowSettings(true);
          }}
        />
      )}

      {showAchievementsModal && selectedGame && (
        <AchievementsPanel
          game={selectedGame}
          onClose={() => {
            setShowAchievementsModal(false);
            window.electronAPI?.getAchievements(selectedGame.id).then((res) => setHeroAchievements(res));
          }}
          onOpenSettings={() => {
            setShowAchievementsModal(false);
            setShowSettings(true);
          }}
        />
      )}

      {showScreenshots && selectedGame && (
        <ScreenshotsPanel game={selectedGame} onClose={() => setShowScreenshots(false)} onChanged={setScreenshotCount} />
      )}

      {showProfile && (
        <ProfilePanel
          onClose={() => setShowProfile(false)}
          onOpenSettings={() => {
            setShowProfile(false);
            setShowSettings(true);
          }}
          onSelectGame={(id) => {
            const game = games.find((g) => g.id === id);
            if (game) setSelectedGame(game);
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
          onOpenSettings={() => {
            setShowSavesModal(false);
            setShowSettings(true);
          }}
        />
      )}

      {showAddGameModal && (
        <AddCustomGameModal
          onClose={() => setShowAddGameModal(false)}
          onGameAdded={(newGame) => {
            setGames([...games, newGame]);
            setSelectedGame(newGame);
          }}
          onScanComplete={(updatedGames) => {
            setGames(updatedGames);
            if (updatedGames.length > 0) {
              setSelectedGame(updatedGames[0]);
            }
          }}
        />
      )}
    </div>
  );
};
