import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { FetchAssetsOptions, MediaAssetType } from '@shared/types/ipc';
import { artworkService } from '../services/metadata/artwork.service';
import { handle } from './helpers';

// Artes do SteamGridDB
export function registerArtworkHandlers(): void {
  handle(IPC_CHANNELS.METADATA_FETCH_ASSETS, (_event, gameId: string, options?: FetchAssetsOptions) => artworkService.fetchAssets(gameId, options));
  handle(IPC_CHANNELS.METADATA_SET_CUSTOM_ASSET, (_event, gameId: string, assetType: MediaAssetType, url: string) =>
    artworkService.applyAsset(gameId, assetType, url)
  );
  handle(IPC_CHANNELS.METADATA_TEST_API_KEY, (_event, apiKey: string) => artworkService.testKey(apiKey));
  handle(IPC_CHANNELS.METADATA_FETCH_MISSING, () => artworkService.enqueueMissing());
  handle(IPC_CHANNELS.METADATA_REPORT_BROKEN, async (_event, gameId: string, assetType: MediaAssetType) => {
    await artworkService.reportBroken(gameId, assetType);
  });
}
