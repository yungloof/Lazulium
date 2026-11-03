import { db } from '../../database/db';
import { GameAchievements } from '@shared/types/achievements';
import { ApiKeyTestResult } from '@shared/types/ipc';
import { steamAchievementsService } from './steam-achievements.service';
import { retroAchievementsService } from './retroachievements.service';
import { Game } from '@shared/types/game';
import { markPerfectGame } from '../profile/journal.service';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas de validade de cache

export class AchievementsService {
  private onGameUpdated?: (game: Game) => void;

  setGameUpdatedListener(listener: (game: Game) => void): void {
    this.onGameUpdated = listener;
  }

  // Conquistas já guardadas também contam: quem fez 100% antes desta função existir não fica de fora
  applyPerfectGames(): void {
    for (const game of db.getGames()) this.notePerfect(db.getGameAchievements(game.id));
  }

  private notePerfect(data: GameAchievements | null): void {
    const updated = data && markPerfectGame(data);
    if (updated) this.onGameUpdated?.(updated);
  }

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
    // Falha passageira ou aviso (sem conta, jogo não achado) nunca vale como cache: entrar na conta resolve na hora
    if (!force && cached && cached.syncedAt && !cached.retryable && !cached.warning) {
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

    // Falha na API (ex: sem conexão ou falha temporária do jogador) não apaga a última sincronização boa
    if ((result.items.length === 0 || result.retryable) && result.warning && cached?.items.length) {
      const merged: GameAchievements = {
        ...cached,
        retryable: result.retryable,
        warning: `Não foi possível atualizar agora (${result.warning}). Exibindo a última sincronização.`
      };
      if (result.retryable) {
        db.saveGameAchievements(merged);
      }
      return merged;
    }

    // Persiste no banco de dados para caching local
    db.saveGameAchievements(result);
    this.notePerfect(result);

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
