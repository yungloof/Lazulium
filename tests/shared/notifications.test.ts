import { describe, expect, it } from 'vitest';
import { SocialNotification } from '../../src/shared/types/social';
import { emptyNotificationStore, mergeNotifications, notificationText, unreadCount } from '../../src/shared/utils/notifications';
import { cleanReactionTarget, reviewTarget } from '../../src/shared/utils/reactions';

const ME = '11111111-1111-4111-8111-111111111111';
const ANA = { id: '22222222-2222-4222-8222-222222222222', name: 'Ana', avatarUrl: null };

const like = (at: string, target = 't:hades'): SocialNotification => ({ type: 'like', kind: 'review', target, owner: ME, title: 'Hades', user: ANA, at });
const comment = (id: string, at: string, text = 'Boa!'): SocialNotification => ({ type: 'comment', id, kind: 'list', target: '7b63871d-0625-49f5-a15d-d4f1b57e2448', owner: ME, title: 'Top 10', user: ANA, at, text });

describe('avisos de curtida e comentário', () => {
  it('a primeira busca guarda tudo sem virar notificação do Windows; as seguintes avisam só o que é novo', () => {
    const first = mergeNotifications(emptyNotificationStore(ME), [like('2026-11-10T10:00:00Z')]);
    expect(first.fresh).toEqual([]);
    expect(first.store.lastAt).toBe('2026-11-10T10:00:00Z');
    expect(unreadCount(first.store)).toBe(1);

    const second = mergeNotifications(first.store, [comment('c1', '2026-11-12T10:00:00Z')]);
    expect(second.fresh.map((n) => n.id)).toEqual(['c1']);
    expect(second.store.items.map((n) => n.type)).toEqual(['comment', 'like']);
    expect(second.store.lastAt).toBe('2026-11-12T10:00:00Z');
  });

  it('curtida desfeita e refeita vira um aviso só, sem notificar de novo', () => {
    const { store } = mergeNotifications({ ...emptyNotificationStore(ME), lastAt: '2026-11-01T00:00:00Z' }, [like('2026-11-10T10:00:00Z')]);
    const again = mergeNotifications(store, [like('2026-11-11T10:00:00Z')]);
    expect(again.fresh).toEqual([]);
    expect(again.store.items).toHaveLength(1);
    expect(again.store.items[0].at).toBe('2026-11-11T10:00:00Z');
  });

  it('lidos: só conta o que chegou depois de abrir a aba', () => {
    const { store } = mergeNotifications(emptyNotificationStore(ME), [like('2026-11-10T10:00:00Z'), comment('c1', '2026-11-12T10:00:00Z')]);
    expect(unreadCount({ ...store, readAt: '2026-11-12T10:00:00Z' })).toBe(0);
    expect(unreadCount({ ...store, readAt: '2026-11-11T00:00:00Z' })).toBe(1);
  });

  it('textos', () => {
    expect(notificationText(like('2026-11-10T10:00:00Z'))).toBe('Ana curtiu sua resenha de Hades');
    expect(notificationText(comment('c1', '2026-11-10T10:00:00Z', 'Cadê\no Majora?'))).toBe('Ana comentou na sua lista Top 10: "Cadê o Majora?"');
    const reply: SocialNotification = { ...comment('c2', '2026-11-10T10:00:00Z', 'Concordo'), type: 'reply', owner: '33333333-3333-4333-8333-333333333333', ownerName: 'Bia' };
    expect(notificationText(reply)).toBe('Ana também comentou na lista Top 10 de Bia: "Concordo"');
    // O dono respondendo na lista dele
    expect(notificationText({ ...reply, owner: ANA.id })).toBe('Ana respondeu na lista Top 10: "Concordo"');
    expect(notificationText({ ...comment('c3', '2026-11-10T10:00:00Z', 'x'.repeat(200)) })).toMatch(/…"$/);
  });

  it('alvos: resenha pelo nome do jogo, lista pelo id; o resto é recusado', () => {
    expect(reviewTarget(ME, 'Hades II (Early Access)')).toEqual({ owner: ME, kind: 'review', target: 't:hadesii', title: 'Hades II (Early Access)' });
    expect(reviewTarget(ME, '!!!')).toBeNull();
    expect(cleanReactionTarget({ owner: ME, kind: 'list', target: '7b63871d-0625-49f5-a15d-d4f1b57e2448' })).not.toBeNull();
    expect(cleanReactionTarget({ owner: ME, kind: 'list', target: 't:hades' })).toBeNull();
    expect(cleanReactionTarget({ owner: 'x', kind: 'review', target: 't:hades' })).toBeNull();
    expect(cleanReactionTarget({ owner: ME, kind: 'game', target: 't:hades' })).toBeNull();
  });
});
