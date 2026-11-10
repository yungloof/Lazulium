import React, { useCallback, useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import { FetchAssetsOptions, GameAssetsResult, MediaAssetType, SteamGridDBAsset } from '@shared/types/ipc';
import { ImageIcon, Search, Loader2, Check, AlertTriangle, Settings, ImageOff } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, EmptyState, Modal, Notice, Skeleton, compactInputClass, focusRing, pillTabClass } from './ui';

interface ArtworkPickerProps {
  game: Game;
  onClose: () => void;
  onOpenSettings: () => void;
}

const TABS: { type: MediaAssetType; label: string; key: keyof Omit<GameAssetsResult, 'sgdbGame' | 'candidates' | 'error'> }[] = [
  { type: 'cover', label: 'Capas', key: 'grids' },
  { type: 'hero', label: 'Banners', key: 'heroes' },
  { type: 'logo', label: 'Logos', key: 'logos' },
  { type: 'icon', label: 'Ícones', key: 'icons' }
];

const GRID_LAYOUT: Record<MediaAssetType, { grid: string; aspect: string; fit: string }> = {
  cover: { grid: 'grid-cols-[repeat(auto-fill,minmax(130px,1fr))]', aspect: 'aspect-[2/3]', fit: 'object-contain' },
  hero: { grid: 'grid-cols-[repeat(auto-fill,minmax(300px,1fr))]', aspect: 'aspect-[96/31]', fit: 'object-cover' },
  logo: { grid: 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]', aspect: 'aspect-[16/9]', fit: 'object-contain p-3' },
  icon: { grid: 'grid-cols-[repeat(auto-fill,minmax(96px,1fr))]', aspect: 'aspect-square', fit: 'object-contain p-2' }
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
      try {
        const res = await window.electronAPI?.fetchGameAssets(game.id, options);
        // Mantém a lista de candidatos ao trocar de jogo para poder voltar atrás
        setResult((prev) => (res && options?.sgdbGameId && prev ? { ...res, candidates: prev.candidates } : res ?? null));
      } catch (err) {
        setApplyError(ipcErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [game.id]
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = async (asset: SteamGridDBAsset) => {
    setApplyingId(asset.id);
    setApplyError(null);
    try {
      const updated = await window.electronAPI?.applyGameAsset(game.id, tab, asset.url);
      if (updated) upsertGameLocal(updated);
      setApplied((prev) => ({ ...prev, [tab]: asset.id }));
    } catch (err) {
      setApplyError(ipcErrorMessage(err));
    } finally {
      setApplyingId(null);
    }
  };

  const activeTab = TABS.find((t) => t.type === tab)!;
  const assets = result ? result[activeTab.key] : [];
  const layout = GRID_LAYOUT[tab];
  const needsKey = /Contas/.test(result?.error ?? '');

  return (
    <Modal
      title="Trocar artes"
      subtitle={game.title}
      icon={<ImageIcon className="w-4 h-4 text-indigo-400" />}
      size="3xl"
      tall
      onClose={onClose}
      bodyClassName="p-5"
      toolbar={
        <div className="px-5 py-3 space-y-3">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (searchTitle.trim()) load({ searchTitle });
            }}
          >
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                placeholder="Buscar outro título no SteamGridDB"
                aria-label="Título para buscar no SteamGridDB"
                className={`${compactInputClass} pl-8`}
              />
            </div>
            <Button type="submit" disabled={loading || !searchTitle.trim()}>
              Buscar
            </Button>
          </form>

          {result?.sgdbGame && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400">Jogo:</span>
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-semibold">
                {result.sgdbGame.name}
                {result.sgdbGame.releaseYear ? ` (${result.sgdbGame.releaseYear})` : ''}
              </span>
              {result.candidates
                .filter((c) => c.id !== result.sgdbGame?.id)
                .map((c) => (
                  <button key={c.id} onClick={() => load({ sgdbGameId: c.id })} className={`px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors ${focusRing}`}>
                    {c.name}
                    {c.releaseYear ? ` (${c.releaseYear})` : ''}
                  </button>
                ))}
            </div>
          )}

          <div className="flex items-center gap-1.5" role="tablist" aria-label="Tipo de arte">
            {TABS.map((t) => (
              <button key={t.type} role="tab" aria-selected={tab === t.type} onClick={() => setTab(t.type)} className={pillTabClass(tab === t.type)}>
                {t.label}
                {result ? <span className="opacity-70 tabular-nums">{result[t.key].length}</span> : null}
              </button>
            ))}
          </div>
          <Notice>{applyError}</Notice>
        </div>
      }
    >
      {loading ? (
        <div className={`grid gap-3 ${layout.grid}`} aria-busy="true">
          <span role="status" className="sr-only">
            Buscando no SteamGridDB
          </span>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className={`${layout.aspect} rounded-lg`} />
          ))}
        </div>
      ) : result?.error ? (
        <EmptyState
          icon={AlertTriangle}
          tone="warn"
          title="Não deu para buscar artes"
          description={result.error}
          actions={
            needsKey ? (
              <Button variant="primary" size="md" onClick={onOpenSettings}>
                <Settings className="w-3.5 h-3.5" /> Abrir Contas
              </Button>
            ) : (
              <Button size="md" onClick={() => load()}>
                Tentar de novo
              </Button>
            )
          }
        />
      ) : assets.length === 0 ? (
        <EmptyState icon={ImageOff} title="Nenhuma arte deste tipo" description="Tente outra aba ou busque o jogo por outro nome." compact />
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
                aria-label={`Usar esta arte (${asset.width}×${asset.height})`}
                aria-pressed={isApplied}
                className={`group relative ${layout.aspect} rounded-lg overflow-hidden transition-[transform,box-shadow] duration-200 ${focusRing} ${
                  tab === 'logo' || tab === 'icon' ? 'bg-slate-950' : 'bg-slate-800'
                } ${isApplied ? 'ring-2 ring-emerald-400' : 'ring-1 ring-slate-800 hover:ring-indigo-400 hover:-translate-y-0.5'}`}
              >
                <img src={asset.thumb} alt="" loading="lazy" decoding="async" className={`w-full h-full ${layout.fit}`} />
                <span className="absolute bottom-1 left-1 px-1.5 rounded bg-black/70 text-[9px] text-slate-200 tabular-nums">
                  {asset.width}×{asset.height}
                </span>
                {(isApplying || isApplied) && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 animate-fade-in">
                    {isApplying ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Check className="w-7 h-7 text-emerald-400" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
