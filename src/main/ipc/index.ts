import { WindowGetter } from './helpers';
import { registerRendererEvents } from './events';
import { registerLibraryHandlers } from './library';
import { registerPlayHandlers } from './play';
import { registerJournalHandlers } from './journal';
import { registerEmulatorHandlers } from './emulators';
import { registerWishlistHandlers } from './wishlist';
import { registerAchievementHandlers } from './achievements';
import { registerArtworkHandlers } from './artwork';
import { registerBackupHandlers } from './backup';
import { registerScreenshotHandlers } from './screenshots';
import { registerProfileHandlers } from './profile';
import { registerSocialHandlers } from './social';
import { registerAccountHandlers } from './accounts';
import { registerSystemHandlers } from './system';

export { sendToRenderer } from './events';

// Todos os canais de IPC_CHANNELS, separados por domínio (um arquivo por área do app)
export function registerIpcHandlers(getMainWindow: WindowGetter): void {
  registerRendererEvents(getMainWindow);
  registerLibraryHandlers();
  registerPlayHandlers();
  registerJournalHandlers();
  registerEmulatorHandlers();
  registerWishlistHandlers();
  registerAchievementHandlers();
  registerArtworkHandlers();
  registerBackupHandlers(getMainWindow);
  registerScreenshotHandlers();
  registerProfileHandlers();
  registerAccountHandlers(getMainWindow);
  registerSocialHandlers();
  registerSystemHandlers(getMainWindow);
}
