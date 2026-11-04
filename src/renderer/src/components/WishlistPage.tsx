import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, ExternalLink, Heart, Loader2, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { GameSearchResult } from '@shared/types/game';
import { WishlistItem, WishlistState } from '@shared/types/wishlist';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Select, SelectOption } from './Select';

type SortKey = 'discount' | 'price' | 'added' | 'name';

const SORT_OPTIONS: SelectOption<SortKey>[] = [
  { value: 'discount', label: 'Maior desconto' },
  { value: 'price', label: 'Mais barato' },
  { value: 'added', label: 'Adicionados por último' },
  { value: 'name', label: 'Nome' }
];

const SEARCH_DELAY_MS = 350;
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const button = `flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors ${focusRing}`;
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const headerImage = (appId: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;

const WishlistCard: React.FC<{
  item: WishlistItem;
  owned: boolean;
  onRemove: () => void;
  onOpenStore: () => void;
  onSetTarget: (cents: number | null) => void;
}> = ({ item, owned, onRemove, onOpenStore, onSetTarget }) => {
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(item.targetCents ? String(item.targetCents / 100).replace('.', ',') : '');
  const discount = item.discountPercent ?? 0;
  const reachedTarget = item.targetCents !== undefined && item.priceCents !== undefined && item.priceCents <= item.targetCents;
  const atLowest = item.lowestCents !== undefined && item.priceCents === item.lowestCents && discount > 0;

  const saveTarget = () => {
    const cents = Math.round(Number(target.replace(',', '.')) * 100);
    onSetTarget(Number.isFinite(cents) && cents > 0 ? cents : null);
    setEditing(false);
  };

  return (
    <article className={`flex flex-col rounded-lg overflow-hidden bg-slate-900/60 border ${reachedTarget ? 'border-emerald-400/60' : 'border-slate-800'}`}>
      <div className="relative aspect-[460/215] bg-slate-800">
        <img src={headerImage(item.appId)} alt="" loading="lazy" className="w-full h-full object-cover" />
        {discount > 0 && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-500 text-sm font-bold text-slate-950">-{discount}%</span>}
        {owned && <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-[11px] text-slate-200">Na biblioteca</span>}
      </div>
      <div className="flex-1 flex flex-col p-3">
        <h3 className="text-sm text-white truncate" title={item.name}>{item.name}</h3>
        <div className="mt-1 flex items-baseline gap-2 min-h-6">
          {item.isFree ? (
            <span className="text-sm text-emerald-300">Grátis</span>
          ) : item.noPrice ? (
            <span className="text-xs text-slate-400">Sem preço no Brasil ainda</span>
          ) : item.priceLabel ? (
            <>
              <span className={`text-base font-semibold ${discount > 0 ? 'text-emerald-300' : 'text-slate-100'}`}>{item.priceLabel}</span>
              {discount > 0 && item.initialCents !== undefined && <span className="text-xs text-slate-500 line-through">{brl(item.initialCents)}</span>}
            </>
          ) : (
            <span className="text-xs text-slate-500">Buscando preço...</span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {atLowest ? 'Menor preço que o Lazulium já viu' : item.lowestCents !== undefined ? `Menor visto: ${brl(item.lowestCents)}` : ' '}
        </p>
        {editing ? (
          <form
            className="mt-2 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveTarget();
            }}
          >
            <input autoFocus value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="50,00" aria-label="Avisar quando chegar em" className={`w-full min-w-0 px-2 py-1 text-xs bg-slate-950/60 border border-slate-700 rounded-md text-slate-100 ${focusRing}`} />
            <button type="submit" className={button}>OK</button>
          </form>
        ) : (
          <button onClick={() => setEditing(true)} className={`mt-2 flex items-center gap-1.5 text-left text-[11px] rounded-sm ${item.targetCents ? 'text-indigo-300' : 'text-slate-400'} hover:text-white ${focusRing}`}>
            <BellRing className="w-3 h-3 flex-shrink-0" />
            {item.targetCents ? `Avisar em ${brl(item.targetCents)}` : 'Avisar em qualquer promoção'}
          </button>
        )}
        <div className="mt-auto pt-2.5 flex items-center gap-1.5">
          <button onClick={onOpenStore} className={`${button} flex-1 justify-center`}>
            <ExternalLink className="w-3.5 h-3.5" /> Ver na Steam
          </button>
          <button onClick={onRemove} aria-label={`Tirar ${item.name} da lista`} title={item.source === 'steam' ? 'Tirar daqui. Volta na próxima atualização se continuar na lista da Steam.' : 'Tirar da lista'} className={`p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-300 text-slate-400 ${focusRing}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
};

export const WishlistPage: React.FC = () => {
  const games = useLibraryStore((s) => s.games);
  const [state, setState] = useState<WishlistState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('discount');
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameSearchResult[]>([]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      setState((await window.electronAPI?.syncWishlist()) ?? null);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    window.electronAPI
      ?.getWishlist()
      .then((current) => {
        setState(current);
        // Primeira visita ou dado velho: atualiza sem pedir
        const age = current.lastSyncAt ? Date.now() - Date.parse(current.lastSyncAt) : Infinity;
        if (age > 60 * 60 * 1000) void sync();
      })
      .catch((err) => setError(ipcErrorMessage(err)));
  }, [sync]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      window.electronAPI
        ?.searchGameCatalog(term)
        .then((list) => !cancelled && setResults(list.filter((r) => r.steamAppId)))
        .catch(() => !cancelled && setResults([]));
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const ownedIds = useMemo(() => new Set(games.filter((g) => g.platform === 'steam').map((g) => g.platformGameId)), [games]);

  const items = useMemo(() => {
    const list = [...(state?.items ?? [])];
    const compare: Record<SortKey, (a: WishlistItem, b: WishlistItem) => number> = {
      discount: (a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
      price: (a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity),
      added: (a, b) => b.addedAt.localeCompare(a.addedAt),
      name: (a, b) => a.name.localeCompare(b.name, 'pt-BR')
    };
    return list.sort(compare[sort]);
  }, [state, sort]);

  const deals = items.filter((i) => (i.discountPercent ?? 0) > 0).length;

  const run = async (task: () => Promise<WishlistState | undefined>) => {
    setError(null);
    try {
      const next = await task();
      if (next) setState(next);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const add = (result: GameSearchResult) => {
    setQuery('');
    setAdding(false);
    void run(async () => window.electronAPI?.addToWishlist(result.steamAppId!, result.name));
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-white">Lista de desejos</h1>
          <p className="mt-1 text-sm text-slate-400">
            {items.length} {items.length === 1 ? 'jogo' : 'jogos'}{deals > 0 ? ` · ${deals} em promoção` : ''}. Vem da sua conta Steam e avisa quando o preço cai.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sort} options={SORT_OPTIONS} onChange={setSort} ariaLabel="Ordenar" />
          <button onClick={sync} disabled={syncing} className={button}>
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Atualizar
          </button>
          <button onClick={() => setAdding((a) => !a)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white ${focusRing}`}>
            {adding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} Adicionar
          </button>
        </div>
      </header>

      {adding && (
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar na loja da Steam" className={`w-full pl-8 pr-3 py-2 text-[13px] bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-200 placeholder-slate-500 ${focusRing}`} />
          </div>
          {results.length > 0 && (
            <ul className="mt-2 max-h-60 overflow-y-auto space-y-0.5">
              {results.map((result) => (
                <li key={result.steamAppId}>
                  <button onClick={() => add(result)} className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left text-sm text-slate-100 hover:bg-slate-800 ${focusRing}`}>
                    {result.thumbUrl && <img src={result.thumbUrl} alt="" loading="lazy" className="w-16 h-8 object-cover flex-shrink-0" />}
                    <span className="truncate">{result.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(error || state?.warning) && (
        <p className="flex items-start gap-2 px-3 py-2 rounded-lg border bg-amber-950/60 border-amber-500/30 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error ?? state?.warning}
        </p>
      )}

      {!state ? (
        <p className="py-16 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </p>
      ) : items.length === 0 ? (
        <div className="py-20 flex flex-col items-center gap-3 text-center rounded-lg bg-slate-900/40">
          <Heart className="w-8 h-8 text-slate-600" />
          <p className="text-sm text-slate-400">{syncing ? 'Buscando sua lista na Steam...' : 'Nada na lista ainda. Adicione um jogo ou use a lista de desejos da Steam.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <WishlistCard
              key={item.appId}
              item={item}
              owned={ownedIds.has(String(item.appId))}
              onOpenStore={() => window.electronAPI?.openWishlistStore(item.appId)}
              onRemove={() => void run(async () => window.electronAPI?.removeFromWishlist(item.appId))}
              onSetTarget={(cents) => void run(async () => window.electronAPI?.setWishlistTarget(item.appId, cents))}
            />
          ))}
        </div>
      )}
    </div>
  );
};
