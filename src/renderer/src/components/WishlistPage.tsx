import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Check, ExternalLink, Heart, Plus, RefreshCw, Search, Tags, Trash2, X } from 'lucide-react';
import { GameSearchResult } from '@shared/types/game';
import { WishlistItem, WishlistState } from '@shared/types/wishlist';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Select, SelectOption } from './Select';
import { Button, EmptyState, LoadingLabel, Notice, Skeleton, buttonClass, focusRing, iconButtonClass, inputClass } from './ui';
import { PageHeader, emptyBox, pageClass } from './journal/PageLayout';
import { plural } from './journal/format';

type SortKey = 'discount' | 'price' | 'added' | 'name';
type ShowFilter = 'all' | 'deals' | 'target';

const SORT_OPTIONS: SelectOption<SortKey>[] = [
  { value: 'discount', label: 'Maior desconto' },
  { value: 'price', label: 'Mais barato' },
  { value: 'added', label: 'Adicionados por último' },
  { value: 'name', label: 'Nome' }
];

const SEARCH_DELAY_MS = 350;
const STALE_AFTER_MS = 60 * 60 * 1000;
const money = (cents: number, currency: string) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency });
const brl = (cents: number) => money(cents, 'BRL');
const reachedTarget = (item: WishlistItem) => item.targetCents !== undefined && item.priceCents !== undefined && item.priceCents <= item.targetCents;

const WishlistCard: React.FC<{
  item: WishlistItem;
  owned: boolean;
  onRemove: () => void;
  onOpenStore: () => void;
  onOpenDeals: () => void;
  onSetTarget: (cents: number | null) => void;
}> = ({ item, owned, onRemove, onOpenStore, onOpenDeals, onSetTarget }) => {
  const [editing, setEditing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [target, setTarget] = useState(item.targetCents ? String(item.targetCents / 100).replace('.', ',') : '');
  const discount = item.discountPercent ?? 0;
  const atTarget = reachedTarget(item);
  const deals = item.deals;
  const cheaperElsewhere = deals?.currency === 'BRL' && deals.retailCents !== undefined && item.priceCents !== undefined && deals.retailCents < item.priceCents;
  const atLowest = item.lowestCents !== undefined && item.priceCents === item.lowestCents && discount > 0;

  const saveTarget = () => {
    const cents = Math.round(Number(target.replace(',', '.')) * 100);
    onSetTarget(Number.isFinite(cents) && cents > 0 ? cents : null);
    setEditing(false);
  };

  return (
    <article
      className={`group flex flex-col rounded-xl overflow-hidden bg-slate-900/60 border transition-colors ${atTarget ? 'border-emerald-400/60 shadow-lg shadow-emerald-950/30' : 'border-slate-800 hover:border-slate-700'}`}
    >
      <div className="relative aspect-[460/215] bg-slate-800 overflow-hidden">
        {item.imageUrl && !imageFailed ? (
          <img src={item.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <span className="w-full h-full flex items-center justify-center p-3 text-center text-sm text-slate-400">{item.name}</span>
        )}
        {discount > 0 && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-500 font-display text-sm font-bold text-slate-950 shadow">-{discount}%</span>}
        {owned && <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-[11px] text-slate-200">Na biblioteca</span>}
        {atTarget && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/90 text-[11px] font-semibold text-slate-950">
            <Check className="w-3 h-3" /> Chegou no seu preço
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col p-3.5">
        <h3 className="text-sm text-white truncate" title={item.name}>
          {item.name}
        </h3>
        <div className="mt-1 flex items-baseline gap-2 min-h-7">
          {item.isFree ? (
            <span className="font-display text-lg text-emerald-300">Grátis</span>
          ) : item.noPrice ? (
            <span className="text-xs text-slate-400">Sem preço no Brasil ainda</span>
          ) : item.priceLabel ? (
            <>
              <span className={`font-display text-lg font-semibold ${discount > 0 ? 'text-emerald-300' : 'text-slate-100'}`}>{item.priceLabel}</span>
              {discount > 0 && item.initialCents !== undefined && <span className="text-xs text-slate-500 line-through">{brl(item.initialCents)}</span>}
            </>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
        </div>
        <p className="min-h-4 text-[11px] text-slate-500">{atLowest ? 'Menor preço que o Lazulium já viu' : item.lowestCents !== undefined ? `Menor visto: ${brl(item.lowestCents)}` : ''}</p>
        {deals && (deals.retailCents !== undefined || deals.keyshopCents !== undefined) && (
          <dl className="mt-2 pt-2 border-t border-slate-800 space-y-0.5 text-[11px]">
            {deals.retailCents !== undefined && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Lojas oficiais</dt>
                <dd className={cheaperElsewhere ? 'text-emerald-300 font-semibold' : 'text-slate-200'}>{money(deals.retailCents, deals.currency)}</dd>
              </div>
            )}
            {deals.keyshopCents !== undefined && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400" title="Revendedores de chaves: mais baratos, mas sem garantia da loja oficial">
                  Revendedores de chaves
                </dt>
                <dd className="text-slate-200">{money(deals.keyshopCents, deals.currency)}</dd>
              </div>
            )}
            {deals.lowestRetailCents !== undefined && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Menor preço histórico</dt>
                <dd className="text-slate-400">{money(deals.lowestRetailCents, deals.currency)}</dd>
              </div>
            )}
            <div className="pt-0.5 text-right text-[10px] text-slate-500">
              Preços por{' '}
              <button type="button" onClick={onOpenDeals} className={`text-indigo-300 hover:text-white underline-offset-2 hover:underline rounded-sm ${focusRing}`}>
                GG.deals
              </button>
            </div>
          </dl>
        )}
        {editing ? (
          <form
            className="mt-2.5 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveTarget();
            }}
          >
            <span className="text-xs text-slate-400">R$</span>
            <input autoFocus value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="50,00" aria-label="Avisar quando chegar em" className={`${inputClass} py-1 text-xs`} />
            <button type="submit" className={buttonClass('primary')}>
              OK
            </button>
            <button type="button" onClick={() => setEditing(false)} aria-label="Cancelar" className={iconButtonClass}>
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`mt-2.5 self-start flex items-center gap-1.5 text-left text-[11px] rounded-sm ${item.targetCents ? 'text-indigo-300' : 'text-slate-400'} hover:text-white ${focusRing}`}
          >
            <BellRing className="w-3 h-3 flex-shrink-0" />
            {item.targetCents ? `Avisar em ${brl(item.targetCents)}` : 'Avisar em qualquer promoção'}
          </button>
        )}
        <div className="mt-auto pt-3 flex items-center gap-1.5">
          <Button icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={onOpenStore} className="flex-1">
            Steam
          </Button>
          <Button icon={<Tags className="w-3.5 h-3.5" />} onClick={onOpenDeals} title="Comparar preços em outras lojas no GG.deals" className="flex-1">
            GG.deals
          </Button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Tirar ${item.name} da lista`}
            title={item.source === 'steam' ? 'Tirar daqui. Volta na próxima atualização se continuar na lista da Steam.' : 'Tirar da lista'}
            className={`${iconButtonClass} p-2 hover:text-red-300`}
          >
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
  const [show, setShow] = useState<ShowFilter>('all');
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

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
        if (age > STALE_AFTER_MS) void sync();
      })
      .catch((err) => setError(ipcErrorMessage(err)));
  }, [sync]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      window.electronAPI
        ?.searchGameCatalog(term)
        .then((list) => !cancelled && setResults(list.filter((r) => r.steamAppId)))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const ownedIds = useMemo(() => new Set(games.filter((g) => g.platform === 'steam').map((g) => g.platformGameId)), [games]);
  const allItems = useMemo(() => state?.items ?? [], [state]);
  const listedIds = useMemo(() => new Set(allItems.map((i) => i.appId)), [allItems]);
  const dealCount = allItems.filter((i) => (i.discountPercent ?? 0) > 0).length;
  const targetCount = allItems.filter(reachedTarget).length;

  const items = useMemo(() => {
    const compare: Record<SortKey, (a: WishlistItem, b: WishlistItem) => number> = {
      discount: (a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
      price: (a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity),
      added: (a, b) => b.addedAt.localeCompare(a.addedAt),
      name: (a, b) => a.name.localeCompare(b.name, 'pt-BR')
    };
    return allItems.filter((i) => (show === 'deals' ? (i.discountPercent ?? 0) > 0 : show === 'target' ? reachedTarget(i) : true)).sort(compare[sort]);
  }, [allItems, sort, show]);

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

  const filters: { id: ShowFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Todos', count: allItems.length },
    { id: 'deals', label: 'Em promoção', count: dealCount },
    ...(targetCount > 0 ? [{ id: 'target' as ShowFilter, label: 'No seu preço', count: targetCount }] : [])
  ];

  const addButton = (
    <Button variant="primary" size="md" icon={adding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} onClick={() => setAdding((a) => !a)}>
      {adding ? 'Fechar busca' : 'Adicionar'}
    </Button>
  );

  return (
    <div className={pageClass}>
      <PageHeader
        title="Lista de desejos"
        subtitle={
          <>
            Vem da sua conta Steam e avisa quando o preço cai. Preços de outras lojas pelo GG.deals.
            {state?.lastSyncAt && <span className="text-slate-500"> Atualizada {new Date(state.lastSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</span>}
          </>
        }
        actions={
          <>
            <Button icon={<RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />} onClick={() => void sync()} disabled={syncing}>
              {syncing ? 'Atualizando...' : 'Atualizar'}
            </Button>
            {addButton}
          </>
        }
      />

      {adding && (
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar na loja da Steam" aria-label="Buscar na loja da Steam" className={`${inputClass} pl-8`} />
          </div>
          {searching && results.length === 0 && <p className="px-2 pt-3 pb-1 text-xs text-slate-500">Buscando...</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && <p className="px-2 pt-3 pb-1 text-xs text-slate-500">Nada na loja da Steam com esse nome.</p>}
          {results.length > 0 && (
            <ul className="mt-2 max-h-64 overflow-y-auto space-y-0.5">
              {results.map((result) => {
                const listed = listedIds.has(result.steamAppId!);
                return (
                  <li key={result.steamAppId}>
                    <button
                      type="button"
                      onClick={() => add(result)}
                      disabled={listed}
                      className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent ${focusRing}`}
                    >
                      <span className="w-20 h-9 flex-shrink-0 rounded-sm overflow-hidden bg-slate-800">{result.thumbUrl && <img src={result.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}</span>
                      <span className="flex-1 truncate">{result.name}</span>
                      {result.year && <span className="text-xs text-slate-500">{result.year}</span>}
                      {listed ? <Check className="w-4 h-4 text-indigo-300" /> : <Plus className="w-4 h-4 text-slate-500" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {(error || state?.warning) && <Notice>{error ?? state?.warning}</Notice>}

      {!state ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-busy="true">
          <LoadingLabel>Carregando a lista de desejos...</LoadingLabel>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-slate-800">
              <Skeleton className="aspect-[460/215] rounded-none" />
              <div className="p-3.5 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-8 w-full mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={syncing ? 'Buscando sua lista na Steam...' : 'Sua lista de desejos está vazia'}
          description={syncing ? 'Leva só alguns segundos.' : 'Adicione jogos aqui ou na sua lista de desejos da Steam (com a conta conectada em Configurações → Contas). O Lazulium avisa quando o preço cair.'}
          actions={!syncing && !adding ? addButton : undefined}
          className={emptyBox}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setShow(f.id)}
                  aria-pressed={show === f.id}
                  className={`inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[13px] transition-colors ${show === f.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'} ${focusRing}`}
                >
                  {f.label}
                  <span className={`text-xs tabular-nums ${show === f.id ? 'text-indigo-100' : 'text-slate-500'}`}>{f.count}</span>
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <span className="text-xs text-slate-500">{plural(items.length, 'jogo', 'jogos')}</span>
            <Select value={sort} options={SORT_OPTIONS} onChange={setSort} ariaLabel="Ordenar" />
          </div>
          {items.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="Nada por aqui agora"
              description={show === 'deals' ? 'Nenhum jogo da lista está em promoção neste momento.' : 'Nenhum jogo chegou no preço que você marcou.'}
              actions={<Button onClick={() => setShow('all')}>Ver todos</Button>}
              className={emptyBox}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((item) => (
                <WishlistCard
                  key={item.appId}
                  item={item}
                  owned={ownedIds.has(String(item.appId))}
                  onOpenStore={() => window.electronAPI?.openWishlistStore(item.appId)}
                  onOpenDeals={() => window.electronAPI?.openWishlistDeals(item.appId)}
                  onRemove={() => void run(async () => window.electronAPI?.removeFromWishlist(item.appId))}
                  onSetTarget={(cents) => void run(async () => window.electronAPI?.setWishlistTarget(item.appId, cents))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
