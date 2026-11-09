// 'lazulium': marcos do próprio app, para jogos que não têm lista em lugar nenhum
export type AchievementSource = 'steam' | 'retroachievements' | 'lazulium';

export interface Achievement {
  id: string;                       // ID / nome único da conquista
  name: string;                     // Título visível
  description: string;              // Descrição de como desbloquear
  iconUrl: string;                  // Ícone desbloqueado (colorido)
  iconLockedUrl?: string;           // Ícone bloqueado (ou versão em cinza)
  unlocked: boolean;                // Se o usuário desbloqueou
  unlockedAt?: string;              // Timestamp ISO da data de conquista
  globalPercent?: number;           // Porcentagem global de jogadores que conquistaram
  manual?: boolean;                 // Marcada à mão pelo jogador (a fonte não registra sozinha)
  custom?: boolean;                 // Criada pelo jogador
  markable?: boolean;               // Pode ser marcada ou desmarcada à mão
}

export interface GameAchievements {
  gameId: string;
  source: AchievementSource;
  listLabel?: string;               // De onde veio a lista (ex: "RetroAchievements · Nintendo 64")
  total: number;
  unlocked: number;
  items: Achievement[];
  syncedAt: string;                 // Timestamp ISO da última sincronização com a API
  note?: string;                    // Explicação que não é problema (ex: lista marcada à mão)
  warning?: string;                 // Aviso amigável (perfil privado, sem suporte, etc.)
  retryable?: boolean;              // Falha passageira (rede, limite da API): não é resposta definitiva
  noList?: boolean;                 // A fonte respondeu que o jogo não tem conquistas
}

export interface CustomAchievement {
  id: string;
  name: string;
  description: string;
}

// O que o jogador registrou por conta própria: nenhum scan ou sincronização apaga
export interface AchievementExtras {
  unlocked?: Record<string, string>;   // id da conquista -> quando foi marcada (ISO)
  custom?: CustomAchievement[];
  catalog?: { raGameId: number; consoleName: string } | null; // Lista do RetroAchievements achada pelo nome (null: procurou e não tem)
  catalogCheckedAt?: number;
  preferMilestones?: boolean;          // "Não é este jogo": fica com os marcos do Lazulium
}

export function achievementSourceLabel(data: Pick<GameAchievements, 'source' | 'listLabel'>): string {
  if (data.listLabel) return data.listLabel;
  return data.source === 'steam' ? 'Steam' : data.source === 'retroachievements' ? 'RetroAchievements' : 'Marcos do Lazulium';
}
