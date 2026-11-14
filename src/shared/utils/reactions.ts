import { ReactionKind, ReactionTarget } from '../types/social';
import { titleKey } from './title-key';

// Curtidas e comentários: a mesma chave no app, no servidor e na vitrine web
export const reactionKey = (t: Pick<ReactionTarget, 'owner' | 'kind' | 'target'>): string => `${t.owner}|${t.kind}|${t.target}`;

// Resenha: um por jogo e pessoa, achado pelo nome (vale para todas as lojas, como na biblioteca resumida)
export function reviewTarget(owner: string, gameTitle: string): ReactionTarget | null {
  const key = titleKey(gameTitle);
  return key ? { owner, kind: 'review', target: `t:${key}`, title: gameTitle } : null;
}

export const listTarget = (owner: string, listId: string, title: string): ReactionTarget => ({ owner, kind: 'list', target: listId, title });

const UUID = /^[0-9a-f-]{36}$/; // A mesma regra do servidor
const TITLE_KEY = /^t:[a-z0-9]{1,120}$/;
const KINDS: ReactionKind[] = ['review', 'list'];

// Alvo vindo do renderer: confere antes de mandar para o servidor
export function cleanReactionTarget(raw: unknown): ReactionTarget | null {
  const t = raw as Partial<ReactionTarget> | null;
  if (!t || typeof t !== 'object' || typeof t.owner !== 'string' || !UUID.test(t.owner)) return null;
  if (!KINDS.includes(t.kind as ReactionKind) || typeof t.target !== 'string') return null;
  if (t.kind === 'review' ? !TITLE_KEY.test(t.target) : !UUID.test(t.target)) return null;
  const title = typeof t.title === 'string' ? t.title.slice(0, 200) : undefined;
  return { owner: t.owner, kind: t.kind as ReactionKind, target: t.target, ...(title ? { title } : {}) };
}
