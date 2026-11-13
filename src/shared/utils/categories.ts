import type { Game, GamePlatform } from '../types/game';
import type { CategoryRule, CategoryRuleStatus, GameCategory } from '../types/categories';

const VALID_PLATFORMS = new Set<GamePlatform>([
  'steam',
  'epic',
  'gog',
  'emulator',
  'riot',
  'xbox',
  'battlenet',
  'ea',
  'ubisoft',
  'standalone'
]);

const VALID_STATUSES = new Set<CategoryRuleStatus>(['unplayed', 'playing', 'finished', 'completed', 'paused', 'dropped', 'backlog']);

function uniqueText(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      list.push(trimmed);
    }
  }
  return list.length > 0 ? list : undefined;
}

function validYear(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.trunc(value);
  return rounded >= 1950 && rounded <= 2100 ? rounded : undefined;
}

// Limpa regras vindas do disco ou da UI. Retorna undefined quando nenhum critério sobra.
export function normalizeCategoryRule(raw: unknown): CategoryRule | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const rule: CategoryRule = {};

  if (Array.isArray(input.platforms)) {
    const platforms = [...new Set(input.platforms.filter((p): p is GamePlatform => typeof p === 'string' && VALID_PLATFORMS.has(p as GamePlatform)))];
    if (platforms.length > 0) rule.platforms = platforms;
  }
  if (Array.isArray(input.statuses)) {
    const statuses = [...new Set(input.statuses.filter((s): s is CategoryRuleStatus => typeof s === 'string' && VALID_STATUSES.has(s as CategoryRuleStatus)))];
    if (statuses.length > 0) rule.statuses = statuses;
  }
  const genres = uniqueText(input.genres);
  if (genres) rule.genres = genres;
  const series = uniqueText(input.series);
  if (series) rule.series = series;

  let yearFrom = validYear(input.yearFrom);
  let yearTo = validYear(input.yearTo);
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) {
    [yearFrom, yearTo] = [yearTo, yearFrom];
  }
  if (yearFrom !== undefined) rule.yearFrom = yearFrom;
  if (yearTo !== undefined) rule.yearTo = yearTo;

  if (typeof input.minRating === 'number' && Number.isFinite(input.minRating) && input.minRating > 0) {
    const clamped = Math.min(5, Math.max(0.5, Math.round(input.minRating * 2) / 2));
    rule.minRating = clamped;
  }
  if (input.favoritesOnly === true) rule.favoritesOnly = true;
  if (input.installedOnly === true) rule.installedOnly = true;

  return Object.keys(rule).length > 0 ? rule : undefined;
}

export function matchesCategoryRule(game: Game, rule: CategoryRule): boolean {
  if (rule.favoritesOnly && !game.isFavorite) return false;
  if (rule.installedOnly && game.isInstalled === false) return false;
  if (rule.platforms?.length && !rule.platforms.includes(game.platform)) return false;

  if (rule.statuses?.length) {
    const matchesStatus = rule.statuses.some((status) => (status === 'unplayed' ? (game.totalPlaytimeSeconds ?? 0) < 60 : game.log?.status === status));
    if (!matchesStatus) return false;
  }

  if (rule.genres?.length) {
    const gameGenres = (game.genres ?? []).map((g) => g.toLowerCase());
    if (!rule.genres.some((wanted) => gameGenres.includes(wanted.toLowerCase()))) return false;
  }

  if (rule.series?.length) {
    const gameSeries = game.series?.toLowerCase();
    if (!gameSeries || !rule.series.some((wanted) => wanted.toLowerCase() === gameSeries)) return false;
  }

  if (rule.yearFrom !== undefined && (game.releaseYear === undefined || game.releaseYear < rule.yearFrom)) return false;
  if (rule.yearTo !== undefined && (game.releaseYear === undefined || game.releaseYear > rule.yearTo)) return false;

  if (rule.minRating !== undefined && (game.log?.rating ?? 0) < rule.minRating) return false;

  return true;
}

export function isGameInCategory(game: Game, category: GameCategory): boolean {
  return category.rule ? matchesCategoryRule(game, category.rule) : category.gameIds.includes(game.id);
}

export function formatCategoryRuleSummary(
  rule: CategoryRule,
  platformLabel: (p: GamePlatform) => string = (p) => p,
  statusLabel: (s: CategoryRuleStatus) => string = (s) => s
): string {
  const parts: string[] = [];
  if (rule.platforms?.length) parts.push(rule.platforms.map(platformLabel).join(', '));
  if (rule.statuses?.length) parts.push(rule.statuses.map(statusLabel).join(', '));
  if (rule.genres?.length) parts.push(rule.genres.join(', '));
  if (rule.series?.length) parts.push(rule.series.join(', '));
  if (rule.yearFrom !== undefined && rule.yearTo !== undefined) {
    parts.push(rule.yearFrom === rule.yearTo ? `Ano ${rule.yearFrom}` : `${rule.yearFrom}–${rule.yearTo}`);
  } else if (rule.yearFrom !== undefined) {
    parts.push(`${rule.yearFrom}+`);
  } else if (rule.yearTo !== undefined) {
    parts.push(`Até ${rule.yearTo}`);
  }
  if (rule.minRating !== undefined) parts.push(`Nota ${String(rule.minRating).replace('.', ',')}+`);
  if (rule.favoritesOnly) parts.push('Favoritos');
  if (rule.installedOnly) parts.push('Instalados');
  return parts.join(' · ');
}
