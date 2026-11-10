import { shell } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { wishlistService } from '../services/metadata/wishlist.service';
import { handle } from './helpers';

function requireAppId(appId: number): number {
  if (!Number.isInteger(appId) || appId <= 0) throw new Error('Jogo inválido.');
  return appId;
}

export function registerWishlistHandlers(): void {
  handle(IPC_CHANNELS.WISHLIST_GET, () => wishlistService.getState());
  handle(IPC_CHANNELS.WISHLIST_SYNC, () => wishlistService.sync());
  handle(IPC_CHANNELS.WISHLIST_ADD, (_event, appId: number, name: string) => wishlistService.add(appId, name));
  handle(IPC_CHANNELS.WISHLIST_REMOVE, (_event, appId: number) => wishlistService.remove(appId));
  handle(IPC_CHANNELS.WISHLIST_SET_TARGET, (_event, appId: number, cents: number | null) => wishlistService.setTarget(appId, cents));
  handle(IPC_CHANNELS.WISHLIST_OPEN_STORE, (_event, appId: number) => shell.openExternal(`steam://store/${requireAppId(appId)}`));
  handle(IPC_CHANNELS.WISHLIST_OPEN_DEALS, (_event, appId: number) => shell.openExternal(wishlistService.dealsUrl(requireAppId(appId))));
}
