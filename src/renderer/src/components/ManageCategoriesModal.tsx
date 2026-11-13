import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FolderPlus, Plus, SlidersHorizontal, Tags, Trash2, X } from 'lucide-react';
import {
  CategoryRule,
  CategoryRuleStatus,
  GameCategory,
  MAX_CATEGORY_NAME,
  SteamCollectionsImportResult
} from '@shared/types/categories';
import { Game, GamePlatform } from '@shared/types/game';
import { formatCategoryRuleSummary, isGameInCategory, matchesCategoryRule, normalizeCategoryRule } from '@shared/utils/categories';
import { useCategoriesStore } from '../stores/useCategoriesStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { PLATFORM_SHORT } from '../utils/platform';
import { LOG_STATUS } from './GameLogFields';
import { GamePickerModal } from './GamePickerModal';
import { Button, Modal, Notice, focusRing, iconButtonClass, inputClass } from './ui';

const PLATFORM_ORDER: GamePlatform[] = ['steam', 'epic', 'gog', 'emulator', 'riot', 'xbox', 'battlenet', 'ea', 'ubisoft', 'standalone'];

const RULE_STATUSES: { id: CategoryRuleStatus; label: string }[] = [
  { id: 'unplayed', label: 'Não jogado' },
  ...LOG_STATUS.map((s) => ({ id: s.id as CategoryRuleStatus, label: s.label }))
];

const RATING_STEPS: { value?: number; label: string }[] = [
  { value: undefined, label: 'Qualquer' },
  { value: 3, label: '3+' },
  { value: 3.5, label: '3,5+' },
  { value: 4, label: '4+' },
  { value: 4.5, label: '4,5+' },
  { value: 5, label: '5' }
];

const statusLabel = (status: CategoryRuleStatus): string => RULE_STATUSES.find((s) => s.id === status)?.label ?? status;

function toggleInList<T>(current: T[] | undefined, value: T, equals: (a: T, b: T) => boolean = (a, b) => a === b): T[] | undefined {
  const list = current ?? [];
  const next = list.some((item) => equals(item, value)) ? list.filter((item) => !equals(item, value)) : [...list, value];
  return next.length > 0 ? next : undefined;
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function formatSteamImportNotice(res: SteamCollectionsImportResult): { text: string; tone: 'success' | 'info' } {
  const parts: string[] = [];
  if (res.created > 0) parts.push(`${res.created} ${res.created === 1 ? 'categoria criada' : 'categorias criadas'}`);
  if (res.merged > 0) parts.push(`${res.merged} ${res.merged === 1 ? 'atualizada' : 'atualizadas'}`);
  if (res.linksAdded > 0) parts.push(`${res.linksAdded} ${res.linksAdded === 1 ? 'jogo adicionado' : 'jogos adicionados'}`);
  if (res.favoritesAdded > 0) parts.push(`${res.favoritesAdded} ${res.favoritesAdded === 1 ? 'favorito' : 'favoritos'}`);

  const dynamicNote =
    res.skippedDynamic > 0
      ? ` ${res.skippedDynamic} ${res.skippedDynamic === 1 ? 'coleção dinâmica da Steam foi ignorada' : 'coleções dinâmicas da Steam foram ignoradas'} (use as regras dinâmicas aqui).`
      : '';

  if (parts.length === 0) {
    return { text: `Nenhuma coleção nova da Steam encontrada neste PC.${dynamicNote}`, tone: 'info' };
  }
  return { text: `Steam importada: ${parts.join(', ')}.${dynamicNote}`, tone: 'success' };
}

interface PillProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const RulePill: React.FC<PillProps> = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${focusRing} ${
      active
        ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200'
        : 'bg-slate-800/70 border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-600'
    }`}
  >
    {children}
  </button>
);

interface RuleEditorProps {
  title: string;
  draft: CategoryRule;
  onChange: (next: CategoryRule) => void;
  games: Game[];
  matchCount: number;
  summary: string;
  onSave?: () => void;
  onCancel: () => void;
  saveDisabled?: boolean;
}

const RuleEditorPanel: React.FC<RuleEditorProps> = ({ title, draft, onChange, games, matchCount, summary, onSave, onCancel, saveDisabled }) => {
  const [seriesQuery, setSeriesQuery] = useState('');

  const { platforms, genres, series } = useMemo(() => {
    const presentPlatforms = new Set<GamePlatform>(games.map((g) => g.platform));
    for (const p of draft.platforms ?? []) presentPlatforms.add(p);

    const genreMap = new Map<string, string>();
    for (const g of games) {
      for (const raw of g.genres ?? []) {
        const key = raw.trim().toLowerCase();
        if (key && !genreMap.has(key)) genreMap.set(key, raw.trim());
      }
    }
    for (const selected of draft.genres ?? []) {
      const key = selected.trim().toLowerCase();
      if (key && !genreMap.has(key)) genreMap.set(key, selected.trim());
    }

    const seriesMap = new Map<string, string>();
    for (const g of games) {
      const raw = g.series?.trim();
      if (raw && !seriesMap.has(raw.toLowerCase())) seriesMap.set(raw.toLowerCase(), raw);
    }
    for (const selected of draft.series ?? []) {
      const key = selected.trim().toLowerCase();
      if (key && !seriesMap.has(key)) seriesMap.set(key, selected.trim());
    }

    return {
      platforms: PLATFORM_ORDER.filter((p) => presentPlatforms.has(p)),
      genres: [...genreMap.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      series: [...seriesMap.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    };
  }, [games, draft.platforms, draft.genres, draft.series]);

  const filteredSeries = useMemo(() => {
    const query = seriesQuery.trim().toLowerCase();
    const matches = query ? series.filter((s) => s.toLowerCase().includes(query)) : series;
    return matches.slice(0, 14);
  }, [series, seriesQuery]);

  const selectedGenres = draft.genres ?? [];
  const selectedSeries = draft.series ?? [];
  const exactSeriesMatch = series.some((s) => sameText(s, seriesQuery));

  const addCustomSeries = () => {
    const clean = seriesQuery.trim();
    if (!clean) return;
    if (!selectedSeries.some((s) => sameText(s, clean))) {
      onChange({ ...draft, series: [...selectedSeries, clean] });
    }
    setSeriesQuery('');
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/75 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <h3 className="text-xs font-semibold text-white truncate">{title}</h3>
            <span className="text-[11px] text-indigo-300 tabular-nums font-medium">
              {matchCount === 1 ? '1 jogo combina' : `${matchCount} jogos combinam`}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400 truncate">
            {summary || 'Escolha pelo menos um critério abaixo.'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {summary && (
            <Button type="button" onClick={() => onChange({})}>
              Limpar
            </Button>
          )}
          {onSave && (
            <Button type="button" variant="primary" disabled={saveDisabled} onClick={onSave}>
              Salvar regras
            </Button>
          )}
          <Button type="button" onClick={onCancel}>
            <X className="w-3.5 h-3.5" /> {onSave ? 'Cancelar' : 'Fechar'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <RulePill active={Boolean(draft.favoritesOnly)} onClick={() => onChange({ ...draft, favoritesOnly: draft.favoritesOnly ? undefined : true })}>
          Só favoritos
        </RulePill>
        <RulePill active={Boolean(draft.installedOnly)} onClick={() => onChange({ ...draft, installedOnly: draft.installedOnly ? undefined : true })}>
          Só instalados
        </RulePill>
      </div>

      {platforms.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-slate-400">Plataforma</p>
          <div className="flex flex-wrap gap-1.5">
            {platforms.map((platform) => (
              <RulePill
                key={platform}
                active={Boolean(draft.platforms?.includes(platform))}
                onClick={() => onChange({ ...draft, platforms: toggleInList(draft.platforms, platform) })}
              >
                {PLATFORM_SHORT[platform]}
              </RulePill>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-slate-400">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {RULE_STATUSES.map((status) => (
            <RulePill
              key={status.id}
              active={Boolean(draft.statuses?.includes(status.id))}
              onClick={() => onChange({ ...draft, statuses: toggleInList(draft.statuses, status.id) })}
            >
              {status.label}
            </RulePill>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-slate-400">Gêneros</p>
        {genres.length === 0 ? (
          <p className="text-[11px] text-slate-500">Gêneros aparecem aqui conforme os dados da biblioteca são carregados.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {genres.map((genre) => (
              <RulePill
                key={genre}
                active={selectedGenres.some((g) => sameText(g, genre))}
                onClick={() => onChange({ ...draft, genres: toggleInList(draft.genres, genre, sameText) })}
              >
                {genre}
              </RulePill>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-slate-400">Séries</p>
          {selectedSeries.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedSeries.map((name) => (
                <RulePill key={name} active onClick={() => onChange({ ...draft, series: toggleInList(draft.series, name, sameText) })}>
                  {name} <X className="w-2.5 h-2.5" />
                </RulePill>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={seriesQuery}
            onChange={(e) => setSeriesQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && seriesQuery.trim()) {
                e.preventDefault();
                addCustomSeries();
              }
            }}
            placeholder={series.length > 0 ? 'Filtrar série ou digitar nome...' : 'Nome da série (ex: Half-Life)'}
            aria-label="Filtrar ou adicionar série"
            className={`${inputClass} !py-1 text-xs`}
          />
          {seriesQuery.trim() && !exactSeriesMatch && (
            <Button type="button" onClick={addCustomSeries} className="flex-shrink-0 !py-1 text-xs">
              Usar "{seriesQuery.trim()}"
            </Button>
          )}
        </div>
        {filteredSeries.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filteredSeries.map((name) => (
              <RulePill
                key={name}
                active={selectedSeries.some((s) => sameText(s, name))}
                onClick={() => onChange({ ...draft, series: toggleInList(draft.series, name, sameText) })}
              >
                {name}
              </RulePill>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-400">Ano de</span>
          <input
            type="number"
            min={1950}
            max={2100}
            value={draft.yearFrom ?? ''}
            onChange={(e) => {
              const value = e.target.value ? Number(e.target.value) : undefined;
              onChange({ ...draft, yearFrom: value !== undefined && Number.isFinite(value) ? value : undefined });
            }}
            placeholder="Ex: 1998"
            className={`${inputClass} !py-1 text-xs tabular-nums`}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-400">Ano até</span>
          <input
            type="number"
            min={1950}
            max={2100}
            value={draft.yearTo ?? ''}
            onChange={(e) => {
              const value = e.target.value ? Number(e.target.value) : undefined;
              onChange({ ...draft, yearTo: value !== undefined && Number.isFinite(value) ? value : undefined });
            }}
            placeholder="Ex: 2010"
            className={`${inputClass} !py-1 text-xs tabular-nums`}
          />
        </label>
        <div className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-400">Nota mínima</span>
          <div className="flex flex-wrap gap-1">
            {RATING_STEPS.map((step) => (
              <RulePill
                key={step.label}
                active={draft.minRating === step.value}
                onClick={() => onChange({ ...draft, minRating: step.value })}
              >
                {step.label}
              </RulePill>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface RowProps {
  category: GameCategory;
  count: number;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  run: (task: () => Promise<unknown>) => Promise<void>;
  onMove: (step: -1 | 1) => void;
  onAddGames: () => void;
  onEditRules: () => void;
}

const CategoryRow: React.FC<RowProps> = ({ category, count, isFirst, isLast, isEditing, run, onMove, onAddGames, onEditRules }) => {
  const [name, setName] = useState(category.name);
  const [confirming, setConfirming] = useState(false);

  // Renomeada por outro caminho (ou o nome foi recusado): o campo volta ao que está salvo
  useEffect(() => setName(category.name), [category.name]);

  const saveName = () => {
    const clean = name.trim();
    if (!clean) setName(category.name);
    else if (clean !== category.name) {
      void run(() => useCategoriesStore.getState().rename(category.id, clean)).then(() =>
        setName(useCategoriesStore.getState().categories.find((c) => c.id === category.id)?.name ?? clean)
      );
    }
  };

  const summary = category.rule ? formatCategoryRuleSummary(category.rule, (p) => PLATFORM_SHORT[p], statusLabel) : '';

  return (
    <li className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${isEditing ? 'bg-indigo-500/10 ring-1 ring-indigo-400/40' : 'hover:bg-slate-800/50'}`}>
      <button type="button" onClick={() => onMove(-1)} disabled={isFirst} title="Subir" aria-label={`Subir ${category.name}`} className={`${iconButtonClass} disabled:opacity-30 disabled:pointer-events-none`}>
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => onMove(1)} disabled={isLast} title="Descer" aria-label={`Descer ${category.name}`} className={`${iconButtonClass} disabled:opacity-30 disabled:pointer-events-none`}>
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          maxLength={MAX_CATEGORY_NAME}
          aria-label={`Nome da categoria ${category.name}`}
          className={`${inputClass} !py-1.5 text-[13px] w-full`}
        />
        {category.rule && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-400/25 text-indigo-300 font-medium flex-shrink-0">
              <SlidersHorizontal className="w-2.5 h-2.5" /> Dinâmica
            </span>
            <span className="truncate" title={summary}>
              {summary}
            </span>
          </div>
        )}
      </div>
      <span className="w-16 flex-shrink-0 text-right text-xs text-slate-400 tabular-nums">{count === 1 ? '1 jogo' : `${count} jogos`}</span>
      {category.rule ? (
        <Button onClick={onEditRules} className="flex-shrink-0" title={`Editar regras de ${category.name}`}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> Regras
        </Button>
      ) : (
        <Button onClick={onAddGames} className="flex-shrink-0" title={`Escolher jogos para ${category.name}`}>
          <FolderPlus className="w-3.5 h-3.5" /> Jogos
        </Button>
      )}
      {confirming ? (
        <Button
          variant="danger"
          autoFocus
          onBlur={() => setConfirming(false)}
          onClick={() => void run(() => useCategoriesStore.getState().remove(category.id))}
          className="flex-shrink-0"
        >
          Apagar?
        </Button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} title="Apagar categoria (os jogos continuam na biblioteca)" aria-label={`Apagar ${category.name}`} className={`${iconButtonClass} hover:!text-red-300`}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
};

// Criar, renomear, ordenar, configurar regras e apagar categorias, além de importar coleções da Steam
export const ManageCategoriesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const categories = useCategoriesStore((s) => s.categories);
  const games = useLibraryStore((s) => s.games);
  const [newName, setNewName] = useState('');
  const [createMode, setCreateMode] = useState<'manual' | 'dynamic'>('manual');
  const [editingRuleFor, setEditingRuleFor] = useState<string | null>(null);
  const [draftRule, setDraftRule] = useState<CategoryRule>({});
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{ text: string; tone: 'success' | 'info' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const visibleGames = useMemo(() => games.filter((g) => !g.isHidden), [games]);
  const picking = categories.find((c) => c.id === pickingFor && !c.rule);
  const editingCategory = categories.find((c) => c.id === editingRuleFor && Boolean(c.rule));
  const showRuleEditor = Boolean(editingCategory) || createMode === 'dynamic';

  const normalizedDraft = useMemo(() => normalizeCategoryRule(draftRule), [draftRule]);
  const matchingCount = useMemo(
    () => (normalizedDraft ? visibleGames.filter((g) => matchesCategoryRule(g, normalizedDraft)).length : 0),
    [visibleGames, normalizedDraft]
  );
  const draftSummary = useMemo(
    () => (normalizedDraft ? formatCategoryRuleSummary(normalizedDraft, (p) => PLATFORM_SHORT[p], statusLabel) : ''),
    [normalizedDraft]
  );

  const run = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const move = (index: number, step: -1 | 1) => {
    const ids = categories.map((c) => c.id);
    const target = index + step;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => useCategoriesStore.getState().reorder(ids));
  };

  const createCategory = () => {
    if (createMode === 'dynamic') {
      if (!normalizedDraft) {
        setError('Escolha pelo menos um critério para a categoria dinâmica.');
        return;
      }
      return run(async () => {
        await useCategoriesStore.getState().create(newName, undefined, normalizedDraft);
        setNewName('');
        setDraftRule({});
        setCreateMode('manual');
      });
    }
    return run(async () => {
      await useCategoriesStore.getState().create(newName);
      setNewName('');
    });
  };

  const openEditRules = (category: GameCategory) => {
    if (editingRuleFor === category.id) {
      setEditingRuleFor(null);
      setDraftRule({});
      return;
    }
    setCreateMode('manual');
    setEditingRuleFor(category.id);
    setDraftRule(category.rule ? { ...category.rule } : {});
  };

  const saveEditedRule = () => {
    if (!editingCategory) return;
    if (!normalizedDraft) {
      setError('Escolha pelo menos um critério para a categoria dinâmica.');
      return;
    }
    void run(async () => {
      await useCategoriesStore.getState().updateRule(editingCategory.id, normalizedDraft);
      setEditingRuleFor(null);
      setDraftRule({});
    });
  };

  const handleImportSteam = async () => {
    setImporting(true);
    setImportNotice(null);
    await run(async () => {
      const res = await useCategoriesStore.getState().importSteam();
      if (res) setImportNotice(formatSteamImportNotice(res));
    });
    setImporting(false);
  };

  return (
    <>
      <Modal
        title="Categorias"
        subtitle="Aparecem na lista lateral da biblioteca, nesta ordem. Podem ser manuais ou dinâmicas por regras."
        icon={<Tags className="w-4 h-4 text-indigo-400" />}
        size="lg"
        onClose={onClose}
        headerActions={
          <Button
            onClick={() => void handleImportSteam()}
            disabled={importing}
            title="Importa coleções fixas e favoritos salvos pela Steam neste PC"
          >
            <Download className="w-3.5 h-3.5" />
            {importing ? 'Importando...' : 'Importar da Steam'}
          </Button>
        }
        bodyClassName="p-3 space-y-3"
        footer={
          <form
            className="w-full space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) void createCategory();
            }}
          >
            <div className="flex items-center gap-2">
              <input
                autoFocus
                data-nav-start
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={MAX_CATEGORY_NAME}
                placeholder={
                  createMode === 'dynamic'
                    ? 'Nome da categoria dinâmica (ex: RPGs dos anos 90, Para zerar no PC)'
                    : 'Nome da nova categoria (ex: Multiplayer, Zelda, Para zerar)'
                }
                aria-label="Nome da nova categoria"
                className={`${inputClass} !py-1.5 text-[13px]`}
              />
              <div className="inline-flex rounded-md border border-slate-700 bg-slate-900 p-0.5 flex-shrink-0" role="group" aria-label="Tipo da nova categoria">
                <button
                  type="button"
                  aria-pressed={createMode === 'manual'}
                  onClick={() => {
                    setEditingRuleFor(null);
                    setCreateMode('manual');
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${focusRing} ${
                    createMode === 'manual' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  aria-pressed={createMode === 'dynamic'}
                  onClick={() => {
                    if (editingRuleFor) setDraftRule({});
                    setEditingRuleFor(null);
                    setCreateMode('dynamic');
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${focusRing} ${
                    createMode === 'dynamic' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Dinâmica
                </button>
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={!newName.trim() || (createMode === 'dynamic' && !normalizedDraft)}
                className="flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Criar
              </Button>
            </div>
            <Notice>{error}</Notice>
          </form>
        }
      >
        {importNotice && <Notice tone={importNotice.tone}>{importNotice.text}</Notice>}

        {showRuleEditor && (
          <RuleEditorPanel
            title={editingCategory ? `Regras de ${editingCategory.name}` : 'Regras da nova categoria dinâmica'}
            draft={draftRule}
            onChange={setDraftRule}
            games={visibleGames}
            matchCount={matchingCount}
            summary={draftSummary}
            saveDisabled={!normalizedDraft}
            onSave={editingCategory ? saveEditedRule : undefined}
            onCancel={() => {
              setEditingRuleFor(null);
              setCreateMode('manual');
              setDraftRule({});
            }}
          />
        )}

        {categories.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-400">
            Nenhuma categoria ainda. Crie uma categoria manual ou dinâmica aqui embaixo, ou importe suas coleções da Steam ali em cima.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {categories.map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                count={visibleGames.filter((g) => isGameInCategory(g, category)).length}
                isFirst={index === 0}
                isLast={index === categories.length - 1}
                isEditing={editingCategory?.id === category.id}
                run={run}
                onMove={(step) => move(index, step)}
                onAddGames={() => setPickingFor(category.id)}
                onEditRules={() => openEditRules(category)}
              />
            ))}
          </ul>
        )}
      </Modal>

      {picking && (
        <GamePickerModal
          title={`Jogos de ${picking.name}`}
          hint="Clique para adicionar. Os marcados já estão na categoria."
          excludeIds={picking.gameIds}
          closeOnPick={false}
          allowRegister={false}
          onPick={(game) => void run(() => useCategoriesStore.getState().setGames(picking.id, [game.id], true))}
          onClose={() => setPickingFor(null)}
        />
      )}
    </>
  );
};
