import { foldEditions, parseEditionPrefs } from '@shared/utils/editions';
import { libraryTitleKey, steamKeyOf } from '@shared/utils/game-match';
import { CreateGroupListInput, GroupList, UpdateGroupListInput } from '@shared/types/social';
import { db } from '../../database/db';
import { publicCoverOf, socialService } from './social.service';

// Listas em grupo: salvas no servidor da conta Lazulium; jogos usam titleKey/steamKey e capa pública, nunca ids locais
class GroupListsService {
  async list(): Promise<GroupList[]> {
    if (!socialService.isConnected()) return [];
    const { lists } = await socialService.api<{ lists: GroupList[] }>('GET', '/v1/group-lists');
    return lists;
  }

  async get(listId: string): Promise<GroupList> {
    const { list } = await socialService.api<{ list: GroupList }>('GET', `/v1/group-lists/${listId}`);
    return list;
  }

  async create(input: CreateGroupListInput): Promise<GroupList> {
    const { list } = await socialService.api<{ list: GroupList }>('POST', '/v1/group-lists', input);
    return list;
  }

  async update(listId: string, input: UpdateGroupListInput): Promise<GroupList> {
    const { list } = await socialService.api<{ list: GroupList }>('PATCH', `/v1/group-lists/${listId}`, input);
    return list;
  }

  async delete(listId: string): Promise<void> {
    await socialService.api('DELETE', `/v1/group-lists/${listId}`);
  }

  async addMember(listId: string, userId: string): Promise<GroupList> {
    const { list } = await socialService.api<{ list: GroupList }>('POST', `/v1/group-lists/${listId}/members`, { userId });
    return list;
  }

  async removeMember(listId: string, userId: string): Promise<{ left: boolean; list: GroupList | null }> {
    return socialService.api<{ left: boolean; list: GroupList | null }>('DELETE', `/v1/group-lists/${listId}/members/${userId}`);
  }

  async addGame(listId: string, gameId: string): Promise<GroupList> {
    const raw = db.getGames();
    const byId = new Map(raw.map((g) => [g.id, g]));
    const folded = foldEditions(raw, parseEditionPrefs(db.getSettings())).games;
    const card = folded.find((g) => g.id === gameId || g.editions?.some((e) => e.id === gameId)) ?? byId.get(gameId);
    if (!card) throw new Error('Jogo não encontrado na biblioteca.');

    const members = card.editions ? card.editions.map((e) => byId.get(e.id)).filter((g): g is NonNullable<typeof g> => !!g) : [card];
    const title = card.title.trim();
    const titleKey = libraryTitleKey(title) ?? (card.detectedTitle ? libraryTitleKey(card.detectedTitle) : null);
    if (!title || !titleKey) throw new Error('Esse jogo não tem um nome válido para listas em grupo.');

    const steamKey = members.map(steamKeyOf).find(Boolean);
    let coverUrl = members.map(publicCoverOf).find((url): url is string => !!url) ?? null;
    if (!coverUrl) {
      const candidate = members.find((m) => !!steamKeyOf(m)) ?? members[0];
      if (candidate) coverUrl = await socialService.ensurePublicCover(candidate.id);
    }

    const { list } = await socialService.api<{ list: GroupList }>('POST', `/v1/group-lists/${listId}/games`, {
      title,
      titleKey,
      ...(steamKey ? { steamKey } : {}),
      ...(coverUrl ? { coverUrl } : {})
    });
    return list;
  }

  async removeGame(listId: string, titleKey: string): Promise<GroupList> {
    const { list } = await socialService.api<{ list: GroupList }>('DELETE', `/v1/group-lists/${listId}/games/${encodeURIComponent(titleKey)}`);
    return list;
  }

  async reorder(listId: string, titleKeys: string[]): Promise<GroupList> {
    const { list } = await socialService.api<{ list: GroupList }>('PUT', `/v1/group-lists/${listId}/order`, { titleKeys });
    return list;
  }
}

export const groupListsService = new GroupListsService();
