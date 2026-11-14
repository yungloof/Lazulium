// Fileira de uma tier list ("S", "A", "Obra-prima"...), com a cor do rótulo
export interface GameTier {
  id: string;
  label: string;
  color: string;                    // #rrggbb, da paleta TIER_COLORS
  gameIds: string[];                // Na ordem da fileira; sempre jogos que estão em GameList.gameIds
}

// Lista criada pelo jogador ("Melhores de 2026", "Zerar nas férias")
export interface GameList {
  id: string;
  title: string;
  description?: string;
  ranked: boolean;                  // Mostra a posição de cada jogo
  featured: boolean;                // Aparece no Perfil
  gameIds: string[];                // Na ordem da lista (numa tier list: todos os jogos dela; os fora das fileiras ficam em "Sem tier")
  tiers?: GameTier[];               // Presente: é uma tier list
  createdAt: string;                // ISO timestamp
  updatedAt: string;                // ISO timestamp
}

export type GameListInput = Pick<GameList, 'title'> & Partial<Pick<GameList, 'id' | 'description' | 'ranked' | 'featured' | 'gameIds' | 'tiers'>>;
