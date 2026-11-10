import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { achievementsService } from '../services/achievements/achievements.service';
import { handle } from './helpers';

export function registerAchievementHandlers(): void {
  handle(IPC_CHANNELS.ACHIEVEMENTS_GET, (_event, gameId: string) => achievementsService.getAchievements(gameId, false));
  handle(IPC_CHANNELS.ACHIEVEMENTS_SYNC, (_event, gameId: string) => achievementsService.getAchievements(gameId, true));
  handle(IPC_CHANNELS.ACHIEVEMENTS_SET_MANUAL, (_event, gameId: string, achievementId: string, unlocked: boolean) =>
    achievementsService.setManual(gameId, achievementId, !!unlocked)
  );
  handle(IPC_CHANNELS.ACHIEVEMENTS_ADD_CUSTOM, (_event, gameId: string, name: string, description: string) =>
    achievementsService.addCustom(gameId, name, description)
  );
  handle(IPC_CHANNELS.ACHIEVEMENTS_REMOVE_CUSTOM, (_event, gameId: string, achievementId: string) => achievementsService.removeCustom(gameId, achievementId));
  handle(IPC_CHANNELS.ACHIEVEMENTS_SET_LIST, (_event, gameId: string, useMilestones: boolean) =>
    achievementsService.setPreferMilestones(gameId, !!useMilestones)
  );
  // Chaves manuais (Configurações → Avançado)
  handle(IPC_CHANNELS.ACHIEVEMENTS_TEST_STEAM, (_event, apiKey: string, steamId: string) => achievementsService.testSteam(apiKey, steamId));
  handle(IPC_CHANNELS.ACHIEVEMENTS_TEST_RETRO, (_event, username: string, apiKey: string) => achievementsService.testRetro(username, apiKey));
}
