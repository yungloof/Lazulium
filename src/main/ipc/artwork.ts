import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { FetchAssetsOptions, MediaAssetType } from '@shared/types/ipc';
import { artworkService } from '../services/metadata/artwork.service';
import { gameMetadataService } from '../services/metadata/game-metadata.service';
import { socialService } from '../services/social/social.service';
import { handle } from './helpers';

// Artes do SteamGridDB e metadados do catálogo
export function registerArtworkHandlers(): void {
  handle(IPC_CHANNELS.METADATA_FETCH_ASSETS, (_event, gameId: string, options?: FetchAssetsOptions) => artworkService.fetchAssets(gameId, options));
  // Capa escolhida: a vitrine dos amigos troca junto
  handle(IPC_CHANNELS.METADATA_SET_CUSTOM_ASSET, async (_event, gameId: string, assetType: MediaAssetType, url: string) => {
    const game = await artworkService.applyAsset(gameId, assetType, url);
    socialService.scheduleSync();
    return game;
  });
  handle(IPC_CHANNELS.METADATA_TEST_API_KEY, (_event, apiKey: string) => artworkService.testKey(apiKey));
  handle(IPC_CHANNELS.METADATA_FETCH_MISSING, () => artworkService.enqueueMissing());
  handle(IPC_CHANNELS.METADATA_FETCH_GAME_INFO, (_event, gameId: string) => gameMetadataService.ensure(gameId));
  handle(IPC_CHANNELS.METADATA_REPORT_BROKEN, async (_event, gameId: string, assetType: MediaAssetType) => {
    await artworkService.reportBroken(gameId, assetType);
  });
}
