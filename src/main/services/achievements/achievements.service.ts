import { randomUUID } from 'crypto';
import { db } from '../../database/db';
import { AchievementExtras, GameAchievements } from '@shared/types/achievements';
import { ApiKeyTestResult } from '@shared/types/ipc';
import { hasRetroAchievements } from '@shared/constants/emulators';
import { steamAchievementsService } from './steam-achievements.service';
import { retroAchievementsService } from './retroachievements.service';
import { applyExtras, buildMilestoneList } from './local-achievements.service';
import { Game, isJournalEntry } from '@shared/types/game';
import { markPerfectGame } from '../profile/journal.service';
import { logBackgroundFailure } from '../metadata/http';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas de validade de cache
const CATALOG_RECHECK_MS = 30 * 24 * 60 * 60 * 1000; // Jogo sem lista hoje pode ganhar uma depois
const MAX_CUSTOM_NAME = 80;
const MAX_CUSTOM_DESCRIPTION = 240;
const MAX_CUSTOM_PER_GAME = 100;

const isFresh = (cached: GameAchievements | null): cached is GameAchievements =>
  // Falha passageira ou aviso (sem conta, jogo não achado) nunca vale como cache: entrar na conta resolve na hora
  !!cached?.syncedAt && !cached.retryable && !cached.warning && Date.now() - new Date(cached.syncedAt).getTime() < CACHE_TTL_MS;

const sameList = (a: GameAchievements, b: GameAchievements) => JSON.stringify({ ...a, syncedAt: '' }) === JSON.stringify({ ...b, syncedAt: '' });

// Todo jogo tem conquistas, com o mesmo destaque: da Steam, do RetroAchievements (sincronizadas ou marcadas à mão)
// ou, quando não existe lista em lugar nenhum, os marcos do Lazulium. O jogador ainda pode criar as próprias.
export class AchievementsService {
  private onGameUpdated?: (game: Game) => void;
  private onListUpdated?: (gameId: string) => void;
  private resolving = new Set<string>();

  setGameUpdatedListener(listener: (game: Game) => void): void {
    this.onGameUpdated = listener;
  }

  // Lista que chegou depois (procura em segundo plano): a tela aberta busca de novo
  setListUpdatedListener(listener: (gameId: string) => void): void {
    this.onListUpdated = listener;
  }

  // Conquistas já guardadas também contam: quem fez 100% antes desta função existir não fica de fora
  applyPerfectGames(): void {
    for (const game of db.getGames()) this.notePerfect(db.getGameAchievements(game.id));
  }

  private notePerfect(data: GameAchievements | null): void {
    // Marcos incluem "marque como 100%": não podem, eles mesmos, marcar o jogo
    if (!data || data.source === 'lazulium') return;
    const updated = markPerfectGame(data);
    if (updated) this.onGameUpdated?.(updated);
  }

  private store(result: GameAchievements, cached: GameAchievements | null): GameAchievements {
    // O arquivo do banco é grande: só grava quando algo mudou de verdade
    if (!cached || !sameList(result, cached)) db.saveGameAchievements(result);
    this.notePerfect(result);
    return result;
  }

  /**
   * Obtém as conquistas de um jogo usando cache local ou buscando na fonte correspondente.
   * @param force Se true, ignora o cache de 6h e força sincronização
   */
  async getAchievements(gameId: string, force: boolean = false): Promise<GameAchievements | null> {
    const game = db.getGameById(gameId);
    if (!game) return null;
    const cached = db.getGameAchievements(gameId);

    if (game.platform === 'steam') {
      if (!force && isFresh(cached)) return cached.source === 'steam' ? cached : this.recompute(game) ?? cached;
      const settings = db.getSettings();
      const result = await steamAchievementsService.fetchAchievements(game, settings.steamWebApiKey ?? '', settings.steamUserId ?? '');
      // Falha na API (ex: sem conexão ou falha temporária do jogador) não apaga a última sincronização boa
      if ((result.items.length === 0 || result.retryable) && result.warning && cached?.items.length) {
        const merged: GameAchievements = {
          ...cached,
          retryable: result.retryable,
          warning: `${result.warning.replace(/[.\s]+$/, '')}. Mostrando as conquistas da última atualização.`
        };
        // Marca para tentar de novo na próxima abertura. Sem internet, a mesma marca não regrava o banco (grande) a cada jogo.
        if (result.retryable && (!cached.retryable || cached.warning !== merged.warning)) db.saveGameAchievements(merged);
        return merged;
      }
      // Jogo sem conquistas na Steam é como qualquer outro sem lista: ganha os marcos
      if (!result.noList) return this.store(result, cached);
      const steamExtras = db.getAchievementExtras(gameId);
      return this.store(applyExtras(buildMilestoneList(game, 'Este jogo não tem conquistas na Steam, então valem os marcos medidos pelo Lazulium. Você também pode criar as suas.'), steamExtras), cached);
    }

    const extras = db.getAchievementExtras(gameId);
    const base = await this.loadExternalList(game, extras, cached, force);
    return this.store(applyExtras(base ?? buildMilestoneList(game, this.milestoneNote(extras)), extras), cached);
  }

  private milestoneNote(extras: AchievementExtras): string {
    const settings = db.getSettings();
    if (extras.preferMilestones) return 'Você escolheu os marcos do Lazulium para este jogo.';
    if (!settings.retroAchievementsUser || !settings.retroAchievementsApiKey) {
      return 'Marcos medidos pelo Lazulium. Com a conta do RetroAchievements conectada em Configurações → Contas, jogos que têm lista por lá ganham as conquistas de verdade.';
    }
    return 'Este jogo não tem lista de conquistas em nenhuma fonte, então valem os marcos medidos pelo Lazulium. Você também pode criar as suas.';
  }

  // Lista do RetroAchievements: sincronizada pelo emulador ou, para ports e consoles sem suporte, achada pelo nome
  private async loadExternalList(game: Game, extras: AchievementExtras, cached: GameAchievements | null, force: boolean): Promise<GameAchievements | null> {
    const lastGood = cached?.source === 'retroachievements' && cached.total > 0 ? cached : null;
    if (extras.preferMilestones) return null;
    if (!force && lastGood && isFresh(lastGood)) return lastGood;

    const settings = db.getSettings();
    const user = settings.retroAchievementsUser ?? '';
    const key = settings.retroAchievementsApiKey ?? '';
    if (!user || !key) return null;

    let result: GameAchievements | null = null;
    if (game.platform === 'emulator' && hasRetroAchievements(game.emulatorId)) {
      result = await retroAchievementsService.fetchAchievements(game, user, key);
    } else {
      let catalog = extras.catalog;
      const stale = Date.now() - (extras.catalogCheckedAt ?? 0) > CATALOG_RECHECK_MS;
      if (catalog === undefined || (catalog === null && (stale || force))) {
        // Procurar em todos os consoles leva alguns segundos: só segura a tela quando foi pedido
        if (!force) {
          this.resolveInBackground(game);
          return lastGood;
        }
        catalog = await this.resolveCatalog(game, user, key);
      }
      if (catalog) result = await retroAchievementsService.fetchCatalogList(game, catalog.raGameId, catalog.consoleName, user, key);
    }

    if (result && result.total > 0) return result;
    // Sem resposta agora: a última lista boa continua valendo (e o aviso diz por que não atualizou)
    if (!result?.retryable || !lastGood) return null;
    return { ...lastGood, retryable: true, warning: result.warning ? `${result.warning.replace(/[.\s]+$/, '')}. Mostrando as conquistas da última atualização.` : undefined };
  }

  private async resolveCatalog(game: Game, user: string, key: string): Promise<AchievementExtras['catalog']> {
    try {
      const catalog = await retroAchievementsService.findInCatalog(game.title, user, key);
      db.setAchievementExtras(game.id, { ...db.getAchievementExtras(game.id), catalog, catalogCheckedAt: Date.now() });
      return catalog;
    } catch (err) {
      // Nada fica gravado: a próxima abertura do jogo procura de novo (sem internet, o log avisa uma vez só)
      logBackgroundFailure(`[Conquistas] ${game.title}:`, err);
      return undefined;
    }
  }

  private resolveInBackground(game: Game): void {
    if (this.resolving.has(game.id)) return;
    this.resolving.add(game.id);
    const settings = db.getSettings();
    void this.resolveCatalog(game, settings.retroAchievementsUser ?? '', settings.retroAchievementsApiKey ?? '')
      .then(async (catalog) => {
        if (!catalog) return;
        await this.getAchievements(game.id, false);
        this.onListUpdated?.(game.id);
      })
      .catch(() => undefined)
      .finally(() => this.resolving.delete(game.id));
  }

  // Sem rede: refaz a lista com o que o jogador mudou (marcas, conquistas próprias, horas)
  private recompute(game: Game, persist = true): GameAchievements | null {
    const cached = db.getGameAchievements(game.id);
    if (cached?.source === 'steam') return cached;
    const extras = db.getAchievementExtras(game.id);
    const base = cached?.source === 'retroachievements' && cached.total > 0 && !extras.preferMilestones ? cached : buildMilestoneList(game, cached?.source === 'lazulium' ? cached.note : this.milestoneNote(extras));
    const result = applyExtras(base, extras);
    if (cached && sameList(result, cached)) return cached;
    if (persist) db.saveGameAchievements(result);
    return result;
  }

  // Marcos dependem de horas, status e capturas: ficam em dia antes de montar o perfil, numa gravação só
  refreshLocal(): void {
    const changed: GameAchievements[] = [];
    for (const game of db.getGames()) {
      if (game.isHidden) continue;
      const cached = db.getGameAchievements(game.id);
      // Da Steam, só os jogos que a própria Steam disse não ter conquistas
      if (game.platform === 'steam' && cached?.source !== 'lazulium') continue;
      const tracked = game.isInstalled !== false || (game.totalPlaytimeSeconds ?? 0) > 0 || isJournalEntry(game);
      if (!tracked || (cached && cached.source !== 'lazulium' && cached.total > 0)) continue;
      const result = this.recompute(game, false);
      if (result && result !== cached) changed.push(result);
    }
    db.saveGameAchievementsBatch(changed);
  }

  private requireEditable(gameId: string): Game {
    const game = db.getGameById(gameId);
    if (!game) throw new Error('Jogo não encontrado.');
    if (db.getGameAchievements(gameId)?.source === 'steam') throw new Error('As conquistas deste jogo vêm da Steam e são atualizadas sozinhas.');
    return game;
  }

  setManual(gameId: string, achievementId: string, unlocked: boolean): GameAchievements {
    const game = this.requireEditable(gameId);
    const item = (db.getGameAchievements(gameId) ?? this.recompute(game))?.items.find((a) => a.id === achievementId);
    if (!item?.markable) throw new Error('Essa conquista não pode ser marcada à mão: ela é registrada sozinha.');
    const extras = db.getAchievementExtras(gameId);
    const marks = { ...extras.unlocked };
    if (unlocked) marks[achievementId] = new Date().toISOString();
    else delete marks[achievementId];
    db.setAchievementExtras(gameId, { ...extras, unlocked: marks });
    const result = this.recompute(game)!;
    this.notePerfect(result);
    return result;
  }

  addCustom(gameId: string, name: string, description: string): GameAchievements {
    const game = this.requireEditable(gameId);
    const cleanName = name?.trim().slice(0, MAX_CUSTOM_NAME);
    if (!cleanName) throw new Error('Dê um nome para a conquista.');
    const extras = db.getAchievementExtras(gameId);
    const custom = extras.custom ?? [];
    if (custom.length >= MAX_CUSTOM_PER_GAME) throw new Error(`Cada jogo aceita até ${MAX_CUSTOM_PER_GAME} conquistas próprias.`);
    const entry = { id: `custom:${randomUUID()}`, name: cleanName, description: description?.trim().slice(0, MAX_CUSTOM_DESCRIPTION) ?? '' };
    db.setAchievementExtras(gameId, { ...extras, custom: [...custom, entry] });
    return this.recompute(game)!;
  }

  removeCustom(gameId: string, achievementId: string): GameAchievements {
    const game = this.requireEditable(gameId);
    const extras = db.getAchievementExtras(gameId);
    const marks = { ...extras.unlocked };
    delete marks[achievementId];
    db.setAchievementExtras(gameId, { ...extras, unlocked: marks, custom: (extras.custom ?? []).filter((c) => c.id !== achievementId) });
    return this.recompute(game)!;
  }

  // "Não é este jogo" e o caminho de volta
  async setPreferMilestones(gameId: string, prefer: boolean): Promise<GameAchievements | null> {
    this.requireEditable(gameId);
    db.setAchievementExtras(gameId, { ...db.getAchievementExtras(gameId), preferMilestones: prefer || undefined });
    return this.getAchievements(gameId, true);
  }

  async testSteam(apiKey: string, steamId: string): Promise<ApiKeyTestResult> {
    return steamAchievementsService.testCredentials(apiKey, steamId);
  }

  async testRetro(username: string, apiKey: string): Promise<ApiKeyTestResult> {
    return retroAchievementsService.testCredentials(username, apiKey);
  }
}

export const achievementsService = new AchievementsService();
