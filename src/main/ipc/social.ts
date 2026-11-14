import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { CallAnswer, SocialSettings } from '@shared/types/social';
import { PRESENCE_STATUSES } from '@shared/utils/presence';
import { socialService } from '../services/social/social.service';
import { presenceService } from '../services/social/presence.service';
import { callsService } from '../services/social/calls.service';
import { reactionsService } from '../services/social/reactions.service';
import { cleanReactionTarget } from '@shared/utils/reactions';
import { ReactionTarget } from '@shared/types/social';
import { handle } from './helpers';

// Conta Lazulium: o renderer só pede; token e envio ficam no main
export function registerSocialHandlers(): void {
  handle(IPC_CHANNELS.SOCIAL_STATUS, () => socialService.getStatus());
  handle(IPC_CHANNELS.SOCIAL_LOGIN, () => socialService.login());
  handle(IPC_CHANNELS.SOCIAL_LOGOUT, () => socialService.logout());
  handle(IPC_CHANNELS.SOCIAL_DELETE_ACCOUNT, () => socialService.deleteAccount());
  handle(IPC_CHANNELS.SOCIAL_UPDATE, (_event, changes: { name?: string | null; settings?: Partial<SocialSettings> }) => {
    if (!changes || typeof changes !== 'object') throw new Error('Alteração inválida.');
    const settings: Partial<SocialSettings> = {};
    for (const key of ['shareProfile', 'shareActivity', 'sharePlaytime', 'shareAchievements', 'shareReviews', 'shareNowPlaying'] as const) {
      if (typeof changes.settings?.[key] === 'boolean') settings[key] = changes.settings[key];
    }
    const name = changes.name === null || typeof changes.name === 'string' ? changes.name : undefined;
    return socialService.updateAccount({ name, settings: Object.keys(settings).length ? settings : undefined });
  });
  handle(IPC_CHANNELS.SOCIAL_SYNC, () => socialService.sync());
  handle(IPC_CHANNELS.SOCIAL_INVITE, () => socialService.createInvite());
  handle(IPC_CHANNELS.SOCIAL_ACCEPT_INVITE, (_event, code: string) => socialService.acceptInvite(String(code ?? '')));
  handle(IPC_CHANNELS.SOCIAL_FRIENDS, () => socialService.getFriends());
  handle(IPC_CHANNELS.SOCIAL_REMOVE_FRIEND, (_event, friendId: string) => socialService.removeFriend(String(friendId ?? '')));
  handle(IPC_CHANNELS.SOCIAL_FEED, (_event, before?: string) => socialService.getFeed(typeof before === 'string' ? before : undefined));
  handle(IPC_CHANNELS.SOCIAL_FRIEND_SHOWCASE, (_event, friendId: string) => socialService.getFriendShowcaseUrl(String(friendId ?? '')));
  handle(IPC_CHANNELS.SOCIAL_FRIEND_PROFILE, (_event, friendId: string) => socialService.getFriendProfile(String(friendId ?? '')));
  handle(IPC_CHANNELS.SOCIAL_GAME_FRIENDS, (_event, gameIds: unknown) => {
    const ids = Array.isArray(gameIds) ? gameIds.filter((id): id is string => typeof id === 'string' && id.length <= 300).slice(0, 8) : [];
    return socialService.getGameFriends(ids);
  });
  handle(IPC_CHANNELS.SOCIAL_FRIEND_GAMES, (_event, friendId: unknown) => socialService.compareGames(String(friendId ?? '')));

  // Curtidas, comentários e avisos
  const target = (raw: unknown): ReactionTarget => {
    const clean = cleanReactionTarget(raw);
    if (!clean) throw new Error('Não dá para reagir a isso.');
    return clean;
  };
  handle(IPC_CHANNELS.SOCIAL_REACTIONS, (_event, targets: unknown) => {
    const clean = Array.isArray(targets) ? targets.slice(0, 300).map(cleanReactionTarget).filter((t): t is ReactionTarget => !!t) : [];
    return reactionsService.summary(clean);
  });
  handle(IPC_CHANNELS.SOCIAL_REACTION_THREAD, (_event, raw: unknown) => reactionsService.thread(target(raw)));
  handle(IPC_CHANNELS.SOCIAL_REACTION_LIKE, (_event, raw: unknown, like: unknown) => reactionsService.setLike(target(raw), like !== false));
  handle(IPC_CHANNELS.SOCIAL_COMMENT_ADD, (_event, raw: unknown, text: unknown) => {
    const clean = typeof text === 'string' ? text.trim().slice(0, 1000) : '';
    if (!clean) throw new Error('Escreva alguma coisa antes de enviar.');
    return reactionsService.addComment(target(raw), clean);
  });
  handle(IPC_CHANNELS.SOCIAL_COMMENT_DELETE, (_event, commentId: unknown) => reactionsService.deleteComment(String(commentId ?? '')));
  handle(IPC_CHANNELS.SOCIAL_NOTIFICATIONS, () => reactionsService.getNotifications());
  handle(IPC_CHANNELS.SOCIAL_NOTIFICATIONS_READ, () => reactionsService.markRead());

  handle(IPC_CHANNELS.SOCIAL_PRESENCE_GET, () => presenceService.getState());
  handle(IPC_CHANNELS.SOCIAL_PRESENCE_SET, (_event, status: unknown, durationMs: unknown) => {
    if (!PRESENCE_STATUSES.includes(status as never)) throw new Error('Status inválido.');
    const ms = typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0 ? Math.min(durationMs, 30 * 24 * 60 * 60_000) : null;
    return presenceService.set(status as (typeof PRESENCE_STATUSES)[number], ms);
  });
  handle(IPC_CHANNELS.SOCIAL_CALL_FRIEND, (_event, friendId: string) => callsService.callFriend(String(friendId ?? '')));
  handle(IPC_CHANNELS.SOCIAL_CALL_ANSWER, (_event, callId: string, answer: unknown) => {
    if (answer !== 'yes' && answer !== 'no' && answer !== 'busy') throw new Error('Resposta inválida.');
    return callsService.answer(String(callId ?? ''), answer as CallAnswer);
  });
  handle(IPC_CHANNELS.SOCIAL_CALL_PENDING, () => callsService.getPending());
  handle(IPC_CHANNELS.SOCIAL_CALL_TEST, () => callsService.test());
}
