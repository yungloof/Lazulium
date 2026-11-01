import React, { useEffect, useState, useMemo } from 'react';
import { TitleBar } from './components/TitleBar';
import { GameCard } from './components/GameCard';
import { GamepadGuide } from './components/GamepadGuide';
import { EmulatorSettings } from './components/EmulatorSettings';
import { AddCustomGameModal } from './components/AddCustomGameModal';
import { PlayButton } from './components/PlayButton';
import { useLibraryStore } from './stores/useLibraryStore';
import { useGamepadStore } from './stores/useGamepadStore';
import { useGamepad } from './hooks/useGamepad';
import { Game, GamePlatform } from '@shared/types/game';
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
  Flame
} from 'lucide-react';

const FILTERS: { id: 'all' | GamePlatform | 'favorites'; label: string }[] = [
  { id: 'all', label: 'Todos os Jogos' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic Games' },
  { id: 'gog', label: 'GOG Galaxy' },
  { id: 'emulator', label: 'Emuladores' },
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
    uiMode,
    toggleFavoriteLocal,
    applyGameStatus
  } = useLibraryStore();

  const { activeFocusedIndex, setActiveFocusedIndex } = useGamepadStore();
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [scanSummary, setScanSummary] = useState<ScanResult | null>(null);
  const [showEmulatorSettings, setShowEmulatorSettings] = useState(false);
  const [showAddGameModal, setShowAddGameModal] = useState(false);
  const [launchNotice, setLaunchNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);

  // Mantém o jogo do hero sincronizado com o store (playtime, favorito, execução)
  useEffect(() => {
    setSelectedGame((current) => (current ? games.find((g) => g.id === current.id) ?? current : current));
  }, [games]);

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
        setLaunchNotice({ text: `${title}: sessão de ${minutes} min registrada.`, tone: 'ok' });
      } else {
        setLaunchNotice({ text: `${title}: sessão menor que 15 s, não contabilizada.`, tone: 'warn' });
      }
    });
    return () => unsubscribe?.();
  }, [applyGameStatus]);

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
    columns: uiMode === 'big-picture' ? 4 : 5,
    onSelect: (index) => {
      const target = filteredGames[index];
      if (target) {
        setSelectedGame(target);
        handleLaunchGame(target);
      }
    },
    onToggleFavorite: (index) => {
      const target = filteredGames[index];
      if (target) handleToggleFavorite(target.id);
    },
    onNextTab: () => {
      const currentIndex = FILTERS.findIndex((f) => f.id === activeFilter);
      const nextIndex = (currentIndex + 1) % FILTERS.length;
      setActiveFilter(FILTERS[nextIndex].id);
      setActiveFocusedIndex(0);
    },
    onPrevTab: () => {
      const currentIndex = FILTERS.findIndex((f) => f.id === activeFilter);
      const prevIndex = (currentIndex - 1 + FILTERS.length) % FILTERS.length;
      setActiveFilter(FILTERS[prevIndex].id);
      setActiveFocusedIndex(0);
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
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#090a0f]/20 via-[#090a0f]/80 to-[#090a0f]" />
          </div>
        )}

        {/* Top Control Bar: Search & Platform Tabs & Scan */}
        <div className="px-6 pt-4 pb-3 flex flex-wrap items-center justify-between gap-4 z-10">
          {/* Platform Filters */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md">
            {FILTERS.map((f) => {
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
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-slate-900/95 via-slate-900/80 to-transparent border border-slate-800/80 shadow-2xl backdrop-blur-md">
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
                  <h2 className="text-xl font-extrabold text-white tracking-tight">{selectedGame.title}</h2>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      {formatHours(selectedGame.totalPlaytimeSeconds)} jogadas
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      Conquistas integradas
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Launch Button */}
              <div className="flex items-center gap-3">
                <PlayButton game={selectedGame} onLaunch={handleLaunchGame} />
              </div>
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
          </div>

          {filteredGames.length > 0 ? (
            <div
              className={`grid gap-5 pb-8 ${
                uiMode === 'big-picture'
                  ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'
                  : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
              }`}
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
