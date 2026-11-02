export type AchievementSource = 'steam' | 'retroachievements';

export interface Achievement {
  id: string;                       // ID / nome único da conquista
  name: string;                     // Título visível
  description: string;              // Descrição de como desbloquear
  iconUrl: string;                  // Ícone desbloqueado (colorido)
  iconLockedUrl?: string;           // Ícone bloqueado (ou versão em cinza)
  unlocked: boolean;                // Se o usuário desbloqueou
  unlockedAt?: string;              // Timestamp ISO da data de conquista
  globalPercent?: number;           // Porcentagem global de jogadores que conquistaram
}

export interface GameAchievements {
  gameId: string;
  source: AchievementSource;
  total: number;
  unlocked: number;
  items: Achievement[];
  syncedAt: string;                 // Timestamp ISO da última sincronização com a API
  warning?: string;                 // Aviso amigável (perfil privado, sem suporte, etc.)
  retryable?: boolean;              // Falha passageira (rede, limite da API): não é resposta definitiva
}
