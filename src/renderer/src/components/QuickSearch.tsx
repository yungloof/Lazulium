import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CornerDownLeft,
  Gamepad2,
  Heart,
  Home,
  LayoutList,
  NotebookPen,
  PanelLeft,
  Play,
  RefreshCw,
  Search,
  Settings,
  UserRound,
  Users
} from 'lucide-react';
import { Game } from '@shared/types/game';
import { GameList } from '@shared/types/lists';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useLibraryViewStore } from '../stores/useLibraryViewStore';
import { useListsStore } from '../stores/useListsStore';
import { useUiStore } from '../stores/useUiStore';
import { formatPlaytimeShort } from '../utils/format';
import { platformBadge } from '../utils/platform';
import { launchGame, openGame, scanLibraries } from '../utils/gameActions';
import { focusRing } from './ui';

interface QuickSearchProps {
  onOpenGame?: (game: Game) => void;    // Padrão: abre a página do jogo
  onLaunchGame?: (game: Game) => void;  // Padrão: inicia o jogo
  onClose: () => void;
}

type SearchItem =
  | { kind: 'game'; key: string; section: string; game: Game }
  | { kind: 'list'; key: string; section: string; list: GameList }
  | { kind: 'action'; key: string; section: string; label: string; hint: string; icon: React.ElementType; run: () => void };

const MAX_GAME_RESULTS = 8;
const MAX_LIST_RESULTS = 4;
const MAX_ACTION_RESULTS = 4;

// Ordem: começo do nome, depois qualquer parte, e as iniciais ("totk", "gta") por último
function matchScore(title: string, query: string): number {
  const lower = title.toLowerCase();
  if (lower.startsWith(query)) return 0;
  if (lower.includes(query)) return 1;
  const initials = lower
    .split(/[\s:\-_]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
  return initials.includes(query) ? 2 : -1;
}

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-sans text-slate-300">{children}</kbd>
);

interface QuickActionDef {
  id: string;
  label: string;
  keywords: string;
  hint: string;
  icon: React.ElementType;
  run: () => void;
}

const QUICK_ACTIONS: QuickActionDef[] = [
  { id: 'home', label: 'Biblioteca', keywords: 'biblioteca inicio jogos', hint: 'Ir para a grade de jogos', icon: Home, run: () => useUiStore.getState().goHome() },
  { id: 'journal', label: 'Diário', keywords: 'diario resenhas notas', hint: 'Registros e resenhas', icon: NotebookPen, run: () => useUiStore.getState().setView('journal') },
  { id: 'lists', label: 'Listas', keywords: 'listas tier list colecoes', hint: 'Suas listas e em grupo', icon: LayoutList, run: () => useUiStore.getState().openList(undefined) },
  { id: 'wishlist', label: 'Lista de Desejos', keywords: 'desejos wishlist precos', hint: 'Preços e promoções', icon: Heart, run: () => useUiStore.getState().setView('wishlist') },
  { id: 'gallery', label: 'Capturas', keywords: 'capturas screenshots fotos', hint: 'Galeria de capturas', icon: Camera, run: () => useUiStore.getState().setView('gallery') },
  { id: 'friends', label: 'Amigos', keywords: 'amigos feed social', hint: 'Feed e atividade dos amigos', icon: Users, run: () => useUiStore.getState().setView('friends') },
  { id: 'profile', label: 'Perfil', keywords: 'perfil vitrine conquistas', hint: 'Seu perfil de jogador', icon: UserRound, run: () => useUiStore.getState().setView('profile') },
  { id: 'settings', label: 'Configurações', keywords: 'configuracoes aparencia contas backup', hint: 'Abrir configurações', icon: Settings, run: () => useUiStore.getState().openModal({ kind: 'settings' }) },
  { id: 'scan', label: 'Escanear biblioteca', keywords: 'escanear procurar jogos', hint: 'Atualizar jogos instalados', icon: RefreshCw, run: () => void scanLibraries() },
  {
    id: 'sidebar',
    label: 'Alternar barra lateral',
    keywords: 'barra lateral sidebar recolher mostrar',
    hint: 'Atalho Ctrl+B',
    icon: PanelLeft,
    run: () => useLibraryViewStore.getState().toggleSidebar()
  }
];

// Ctrl+K: abrir ou iniciar qualquer jogo, lista ou seção sem sair do que está fazendo
export const QuickSearch: React.FC<QuickSearchProps> = ({ onOpenGame = openGame, onLaunchGame = (g) => void launchGame(g), onClose }) => {
  const games = useLibraryStore((s) => s.games);
  const lists = useListsStore((s) => s.lists);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Carrega as listas se ainda não foram carregadas e devolve o foco ao fechar
  useEffect(() => {
    if (useListsStore.getState().lists.length === 0) void useListsStore.getState().load().catch(() => undefined);
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous && previous !== document.body && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  const items = useMemo<SearchItem[]>(() => {
    const q = query.trim().toLowerCase();
    const visible = games.filter((g) => !g.isHidden);
    const byInstalled = (a: Game, b: Game) => Number(b.isInstalled !== false) - Number(a.isInstalled !== false);
    if (!q) {
      return visible
        .filter((g) => !g.manualEntry && g.isInstalled !== false && g.lastPlayedAt)
        .sort((a, b) => b.lastPlayedAt!.localeCompare(a.lastPlayedAt!))
        .slice(0, MAX_GAME_RESULTS)
        .map((game) => ({ kind: 'game', key: `game:${game.id}`, section: 'Jogados por último', game }));
    }

    const matchedGames = visible
      .map((game) => ({ game, score: matchScore(game.title, q) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || byInstalled(a.game, b.game) || (b.game.totalPlaytimeSeconds ?? 0) - (a.game.totalPlaytimeSeconds ?? 0))
      .slice(0, MAX_GAME_RESULTS)
      .map<SearchItem>(({ game }) => ({ kind: 'game', key: `game:${game.id}`, section: 'Jogos', game }));

    const matchedLists = lists
      .map((list) => ({ list, score: matchScore(list.title, q) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_LIST_RESULTS)
      .map<SearchItem>(({ list }) => ({ kind: 'list', key: `list:${list.id}`, section: 'Listas', list }));

    const matchedActions = QUICK_ACTIONS.filter((a) => a.label.toLowerCase().includes(q) || a.keywords.includes(q))
      .slice(0, MAX_ACTION_RESULTS)
      .map<SearchItem>((a) => ({ kind: 'action', key: `action:${a.id}`, section: 'Ir para', label: a.label, hint: a.hint, icon: a.icon, run: a.run }));

    return [...matchedGames, ...matchedLists, ...matchedActions];
  }, [games, lists, query]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const activate = (item: SearchItem | undefined, play = false) => {
    if (!item) return;
    onClose();
    if (item.kind === 'game') {
      if (play && !item.game.manualEntry && item.game.isInstalled !== false) onLaunchGame(item.game);
      else onOpenGame(item.game);
    } else if (item.kind === 'list') {
      useUiStore.getState().openList(item.list.id);
    } else {
      item.run();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(0, items.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(items[selected], e.ctrlKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] bg-black/60 backdrop-blur-[2px] p-6 animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
        className="w-full max-w-xl rounded-lg bg-surface-panel border border-slate-700 shadow-2xl shadow-black/60 overflow-hidden animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-slate-800">
          <Search className="w-4 h-4 text-indigo-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar jogo, lista ou tela (ex.: totk, diário)"
            aria-label="Nome do jogo"
            aria-controls="quick-search-results"
            spellCheck={false}
            className="w-full pl-11 pr-4 py-4 text-[15px] bg-transparent text-white placeholder-slate-500 focus:outline-none"
          />
        </div>
        <ul id="quick-search-results" ref={listRef} role="listbox" aria-label="Resultados" className="max-h-96 overflow-y-auto p-1.5">
          {items.map((item, index) => {
            const showHeader = index === 0 || items[index - 1].section !== item.section;
            const active = index === selected;
            return (
              <React.Fragment key={item.key}>
                {showHeader && (
                  <li className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{item.section}</li>
                )}
                <li data-index={index} role="option" aria-selected={active} onMouseEnter={() => setSelected(index)}>
                  {item.kind === 'game' ? (
                    <div className={`flex items-center gap-1 rounded-lg transition-colors ${active ? 'bg-indigo-500/15 ring-1 ring-indigo-400/40' : ''}`}>
                      <button onClick={() => activate(item, false)} className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2 rounded-lg text-left ${focusRing}`}>
                        <span className="w-8 aspect-[2/3] flex-shrink-0 flex items-center justify-center overflow-hidden rounded bg-slate-800">
                          {item.game.media?.coverUrl ? (
                            <img src={item.game.media.coverUrl} alt="" loading="lazy" className="w-full h-full object-contain" />
                          ) : (
                            <Gamepad2 className="w-3.5 h-3.5 text-slate-500" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-slate-100 truncate">{item.game.title}</span>
                          <span className="block text-[11px] text-slate-400 truncate">
                            {item.game.manualEntry
                              ? `${item.game.manualPlatform ?? 'Diário'} · registro manual`
                              : `${platformBadge(item.game)} · ${
                                  item.game.isInstalled === false ? 'não instalado' : formatPlaytimeShort(item.game.totalPlaytimeSeconds, item.game.lastPlayedAt)
                                }`}
                          </span>
                        </span>
                      </button>
                      {!item.game.manualEntry && item.game.isInstalled !== false && (
                        <button
                          onClick={() => activate(item, true)}
                          aria-label={`Jogar ${item.game.title}`}
                          title="Jogar (Ctrl+Enter)"
                          className={`mr-1.5 p-2 rounded-md text-slate-400 hover:text-white hover:bg-indigo-500 transition-colors ${focusRing}`}
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : item.kind === 'list' ? (
                    <button
                      onClick={() => activate(item)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                        active ? 'bg-indigo-500/15 ring-1 ring-indigo-400/40' : ''
                      } ${focusRing}`}
                    >
                      <span className="w-8 h-8 flex-shrink-0 rounded bg-slate-800 flex items-center justify-center">
                        <LayoutList className="w-4 h-4 text-indigo-300" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-100 truncate">{item.list.title}</span>
                        <span className="block text-[11px] text-slate-400">{item.list.gameIds.length} jogos na lista</span>
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={() => activate(item)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                        active ? 'bg-indigo-500/15 ring-1 ring-indigo-400/40' : ''
                      } ${focusRing}`}
                    >
                      <span className="w-8 h-8 flex-shrink-0 rounded bg-slate-800 flex items-center justify-center">
                        <item.icon className="w-4 h-4 text-indigo-300" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-100 truncate">{item.label}</span>
                        <span className="block text-[11px] text-slate-400 truncate">{item.hint}</span>
                      </span>
                    </button>
                  )}
                </li>
              </React.Fragment>
            );
          })}
          {items.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-slate-400">{query.trim() ? 'Nada encontrado com esse termo.' : 'Digite o nome de um jogo, lista ou tela.'}</li>
          )}
        </ul>
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-800 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft className="w-3 h-3 inline" />
            </Kbd>
            abrir
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> jogar
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
};
