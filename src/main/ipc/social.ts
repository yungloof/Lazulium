import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { SocialSettings } from '@shared/types/social';
import { socialService } from '../services/social/social.service';
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
    for (const key of ['shareActivity', 'sharePlaytime', 'shareAchievements', 'shareReviews', 'shareNowPlaying'] as const) {
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
  handle(IPC_CHANNELS.SOCIAL_FRIEND_PROFILE, (_event, friendId: string) => socialService.getFriendProfile(String(friendId ?? '')));
}
