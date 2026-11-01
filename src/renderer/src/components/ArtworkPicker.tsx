import React, { useCallback, useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import { FetchAssetsOptions, GameAssetsResult, MediaAssetType, SteamGridDBAsset } from '@shared/types/ipc';
import { ImageIcon, X, Search, Loader2, Check, AlertTriangle, Settings } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';

interface ArtworkPickerProps {
  game: Game;
  onClose: () => void;
  onOpenSettings: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const TABS: { type: MediaAssetType; label: string; key: keyof Omit<GameAssetsResult, 'sgdbGame' | 'candidates' | 'error'> }[] = [
  { type: 'cover', label: 'Capas', key: 'grids' },
  { type: 'hero', label: 'Banners', key: 'heroes' },
  { type: 'logo', label: 'Logos', key: 'logos' },
  { type: 'icon', label: 'Ícones', key: 'icons' }
];

const GRID_LAYOUT: Record<MediaAssetType, { grid: string; aspect: string; fit: string }> = {
  cover: { grid: 'grid-cols-5', aspect: 'aspect-[2/3]', fit: 'object-cover' },
  hero: { grid: 'grid-cols-2', aspect: 'aspect-[96/31]', fit: 'object-cover' },
  logo: { grid: 'grid-cols-3', aspect: 'aspect-[16/9]', fit: 'object-contain p-3' },
  icon: { grid: 'grid-cols-6', aspect: 'aspect-square', fit: 'object-contain p-2' }
};

export const ArtworkPicker: React.FC<ArtworkPickerProps> = ({ game, onClose, onOpenSettings }) => {
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [tab, setTab] = useState<MediaAssetType>('cover');
  const [searchTitle, setSearchTitle] = useState(game.title);
  const [result, setResult] = useState<GameAssetsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [applied, setApplied] = useState<Partial<Record<MediaAssetType, number>>>({});
  const [applyError, setApplyError] = useState<string | null>(null);

  const load = useCallback(
    async (options?: FetchAssetsOptions) => {
      setLoading(true);
      setApplyError(null);
      const res = await window.electronAPI?.fetchGameAssets(game.id, options);
      // Mantém a lista de candidatos ao trocar de jogo para poder voltar atrás
      setResult((prev) => (res && options?.sgdbGameId && prev ? { ...res, candidates: prev.candidates } : res ?? null));
      setLoading(false);
    },
    [game.id]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleApply = async (asset: SteamGridDBAsset) => {
    setApplyingId(asset.id);
    setApplyError(null);
    try {
      const updated = await window.electronAPI?.applyGameAsset(game.id, tab, asset.url);
      if (updated) upsertGameLocal(updated);
      setApplied((prev) => ({ ...prev, [tab]: asset.id }));
    } catch (err) {
      setApplyError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setApplyingId(null);
    }
  };

  const activeTab = TABS.find((t) => t.type === tab)!;
  const assets = result ? result[activeTab.key] : [];
  const layout = GRID_LAYOUT[tab];
  const needsKey = result?.error?.includes('chave de API');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="w-full max-w-5xl h-[85vh] flex flex-col rounded-2xl bg-[#0d0f17] border border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100 truncate">
            <ImageIcon className="w-4 h-4 text-indigo-400 flex-shrink-0" /> Artes · {game.title}
          </h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Busca + jogo correspondente */}
        <div className="px-5 py-3 border-b border-slate-800 space-y-2">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              load({ searchTitle });
            }}
          >
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                placeholder="Buscar outro título no SteamGridDB"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !searchTitle.trim()}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}
            >
              Buscar
            </button>
          </form>

          {result?.sgdbGame && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-500">Jogo:</span>
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                {result.sgdbGame.name}
                {result.sgdbGame.releaseYear ? ` (${result.sgdbGame.releaseYear})` : ''}
              </span>
              {result.candidates
                .filter((c) => c.id !== result.sgdbGame?.id)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => load({ sgdbGameId: c.id })}
                    className={`px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-700 ${focusRing}`}
                  >
                    {c.name}
                    {c.releaseYear ? ` (${c.releaseYear})` : ''}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Abas */}
        <div className="flex items-center gap-1.5 px-5 pt-3">
          {TABS.map((t) => (
            <button
              key={t.type}
              onClick={() => setTab(t.type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${focusRing} ${
                tab === t.type ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {t.label}
              {result ? <span className="ml-1.5 opacity-60">{result[t.key].length}</span> : null}
            </button>
          ))}
        </div>

        {applyError && (
          <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" /> {applyError}
          </div>
        )}

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Buscando no SteamGridDB...
            </div>
          ) : result?.error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400/80" />
              <p className="text-xs text-slate-300 max-w-sm">{result.error}</p>
              {needsKey && (
                <button
                  onClick={onOpenSettings}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white ${focusRing}`}
                >
                  <Settings className="w-3.5 h-3.5" /> Abrir Configurações
                </button>
              )}
            </div>
          ) : assets.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Nenhuma arte deste tipo para este jogo.
            </div>
          ) : (
            <div className={`grid gap-3 ${layout.grid}`}>
              {assets.map((asset) => {
                const isApplied = applied[tab] === asset.id;
                const isApplying = applyingId === asset.id;
                return (
                  <button
                    key={asset.id}
                    onClick={() => handleApply(asset)}
                    disabled={applyingId !== null}
                    title={asset.author ? `por ${asset.author.name}` : undefined}
                    className={`group relative ${layout.aspect} rounded-lg overflow-hidden border transition-all ${focusRing} ${
                      tab === 'logo' || tab === 'icon' ? 'bg-slate-900' : 'bg-slate-800'
                    } ${
                      isApplied
                        ? 'border-emerald-400 ring-2 ring-emerald-400/50'
                        : 'border-slate-800 hover:border-indigo-400 hover:scale-[1.02]'
                    }`}
                  >
                    <img src={asset.thumb} alt="" loading="lazy" className={`w-full h-full ${layout.fit}`} />
                    <span className="absolute bottom-1 left-1 px-1 rounded bg-black/70 text-[9px] text-slate-300">
                      {asset.width}×{asset.height}
                    </span>
                    {(isApplying || isApplied) && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                        {isApplying ? (
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        ) : (
                          <Check className="w-6 h-6 text-emerald-400" />
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
