// Lista criada pelo jogador ("Melhores de 2026", "Zerar nas férias")
export interface GameList {
  id: string;
  title: string;
  description?: string;
  ranked: boolean;                  // Mostra a posição de cada jogo
  featured: boolean;                // Aparece no Perfil
  gameIds: string[];                // Na ordem da lista
  createdAt: string;                // ISO timestamp
  updatedAt: string;                // ISO timestamp
}

export type GameListInput = Pick<GameList, 'title'> & Partial<Pick<GameList, 'id' | 'description' | 'ranked' | 'featured' | 'gameIds'>>;
