export type AchievementSource = 'steam' | 'retroachievements';

export interface Achievement {
  id: string;                       // ID único interno
  gameId: string;                   // Referência ao jogo no hub
  apiName: string;                  // Nome da API (ex: 'ACH_WIN_ONE_GAME')
  title: string;                    // Título da conquista
  description?: string;             // Descrição de como obter
  iconUrl?: string;                 // Ícone quando desbloqueada
  iconGrayUrl?: string;             // Ícone quando bloqueada
  isUnlocked: boolean;              // Se o jogador já desbloqueou
  unlockedAt?: string;              // ISO timestamp
  source: AchievementSource;        // 'steam' ou 'retroachievements'
  points?: number;                  // Pontos (comum no RetroAchievements)
  rarityPercentage?: number;        // Porcentagem global de jogadores que possuem
}

export interface AchievementSummary {
  gameId: string;
  totalAchievements: number;
  unlockedAchievements: number;
  completionPercentage: number;
  source: AchievementSource;
}
