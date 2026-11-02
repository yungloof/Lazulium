import { db } from '../../database/db';
import { GameAchievements } from '@shared/types/achievements';
import { ApiKeyTestResult } from '@shared/types/ipc';
import { steamAchievementsService } from './steam-achievements.service';
import { retroAchievementsService } from './retroachievements.service';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas de validade de cache

export class AchievementsService {
  /**
   * Obtém as conquistas de um jogo usando cache local ou buscando na API correspondente.
   * @param gameId ID do jogo no Lazulium
   * @param force Se true, ignora o cache de 6h e força sincronização com a API
   */
  async getAchievements(gameId: string, force: boolean = false): Promise<GameAchievements | null> {
    const game = db.getGameById(gameId);
    if (!game) return null;

    if (game.platform !== 'steam' && game.platform !== 'emulator') {
      return null;
    }

    // Verifica o cache persistido no JSON
    const cached = db.getGameAchievements(gameId);
    if (!force && cached && cached.syncedAt) {
      const age = Date.now() - new Date(cached.syncedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return cached;
      }
    }

    const settings = db.getSettings();
    let result: GameAchievements;

    if (game.platform === 'steam') {
      result = await steamAchievementsService.fetchAchievements(
        game,
        settings.steamWebApiKey ?? '',
        settings.steamUserId ?? ''
      );
    } else {
      result = await retroAchievementsService.fetchAchievements(
        game,
        settings.retroAchievementsUser ?? '',
        settings.retroAchievementsApiKey ?? ''
      );
    }

    // Persiste no banco de dados para caching local
    db.saveGameAchievements(result);

    return result;
  }

  async testSteam(apiKey: string, steamId: string): Promise<ApiKeyTestResult> {
    return steamAchievementsService.testCredentials(apiKey, steamId);
  }

  async testRetro(username: string, apiKey: string): Promise<ApiKeyTestResult> {
    return retroAchievementsService.testCredentials(username, apiKey);
  }
}

export const achievementsService = new AchievementsService();
