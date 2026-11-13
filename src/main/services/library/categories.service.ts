import { randomUUID } from 'crypto';
import { CategoryRule, GameCategory, MAX_CATEGORY_NAME } from '@shared/types/categories';
import { normalizeCategoryRule } from '@shared/utils/categories';
import { db } from '../../database/db';

const MAX_CATEGORIES = 200;

const sameName = (a: string, b: string): boolean => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0;

function cleanName(name: unknown, ignoreId?: string): string {
  const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY_NAME) : '';
  if (!clean) throw new Error('Dê um nome para a categoria.');
  if (db.getGameCategories().some((c) => c.id !== ignoreId && sameName(c.name, clean))) throw new Error(`Já existe uma categoria chamada “${clean}”.`);
  return clean;
}

function find(categories: GameCategory[], id: string): GameCategory {
  const category = categories.find((c) => c.id === id);
  if (!category) throw new Error('Categoria não encontrada. Ela pode ter sido apagada.');
  return category;
}

const existingGames = (gameIds: unknown): string[] =>
  [...new Set(Array.isArray(gameIds) ? gameIds.filter((id): id is string => typeof id === 'string') : [])].filter((id) => db.getGameById(id));

export function createCategory(name: string, gameIds?: string[], rule?: CategoryRule): GameCategory[] {
  const categories = db.getGameCategories();
  if (categories.length >= MAX_CATEGORIES) throw new Error(`O limite é de ${MAX_CATEGORIES} categorias.`);
  const now = new Date().toISOString();
  if (rule !== undefined) {
    const cleanRule = normalizeCategoryRule(rule);
    if (!cleanRule) throw new Error('Escolha pelo menos uma regra para a categoria dinâmica.');
    return db.setGameCategories([...categories, { id: randomUUID(), name: cleanName(name), gameIds: [], rule: cleanRule, createdAt: now, updatedAt: now }]);
  }
  return db.setGameCategories([...categories, { id: randomUUID(), name: cleanName(name), gameIds: existingGames(gameIds), createdAt: now, updatedAt: now }]);
}

export function updateCategoryRule(id: string, rule: CategoryRule): GameCategory[] {
  const categories = db.getGameCategories();
  const category = find(categories, id);
  const cleanRule = normalizeCategoryRule(rule);
  if (!cleanRule) throw new Error('Escolha pelo menos uma regra para a categoria dinâmica.');
  return db.setGameCategories(categories.map((c) => (c === category ? { ...c, gameIds: [], rule: cleanRule, updatedAt: new Date().toISOString() } : c)));
}

export function renameCategory(id: string, name: string): GameCategory[] {
  const categories = db.getGameCategories();
  const category = find(categories, id);
  const clean = cleanName(name, id);
  return db.setGameCategories(categories.map((c) => (c === category ? { ...c, name: clean, updatedAt: new Date().toISOString() } : c)));
}

export function deleteCategory(id: string): GameCategory[] {
  return db.setGameCategories(db.getGameCategories().filter((c) => c.id !== id));
}

// Recebe os ids na nova ordem; o que não vier fica no fim, na ordem de antes
export function reorderCategories(ids: string[]): GameCategory[] {
  const order = new Map((Array.isArray(ids) ? ids : []).map((id, index) => [id, index]));
  const categories = db.getGameCategories();
  const position = (c: GameCategory) => order.get(c.id) ?? order.size + categories.indexOf(c);
  return db.setGameCategories([...categories].sort((a, b) => position(a) - position(b)));
}

// Põe ou tira jogos de uma categoria
export function setCategoryGames(id: string, gameIds: string[], member: boolean): GameCategory[] {
  const categories = db.getGameCategories();
  const category = find(categories, id);
  if (category.rule) throw new Error('Categorias dinâmicas são preenchidas automaticamente pelas regras.');
  const changing = existingGames(gameIds);
  const next = member ? [...new Set([...category.gameIds, ...changing])] : category.gameIds.filter((gameId) => !changing.includes(gameId));
  if (next.length === category.gameIds.length) return categories;
  return db.setGameCategories(categories.map((c) => (c === category ? { ...c, gameIds: next, updatedAt: new Date().toISOString() } : c)));
}
