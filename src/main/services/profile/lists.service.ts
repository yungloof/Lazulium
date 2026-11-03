import { randomUUID } from 'crypto';
import { GameList, GameListInput } from '@shared/types/lists';
import { db } from '../../database/db';

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;

export function saveGameList(input: GameListInput): GameList {
  const title = input.title?.trim().slice(0, MAX_TITLE);
  if (!title) throw new Error('Dê um nome para a lista.');

  const previous = input.id ? db.getGameLists().find((list) => list.id === input.id) : undefined;
  const now = new Date().toISOString();
  const list: GameList = {
    id: previous?.id ?? randomUUID(),
    title,
    description: input.description === undefined ? previous?.description : input.description.trim().slice(0, MAX_DESCRIPTION) || undefined,
    ranked: input.ranked ?? previous?.ranked ?? false,
    featured: input.featured ?? previous?.featured ?? false,
    gameIds: [...new Set(input.gameIds ?? previous?.gameIds ?? [])].filter((id) => db.getGameById(id)),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now
  };
  db.saveGameList(list);
  return list;
}
