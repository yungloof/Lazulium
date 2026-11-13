// Categoria criada pelo jogador para arrumar a biblioteca (como as coleções da Steam).
// Um jogo pode estar em várias; a ordem do array é a ordem em que aparecem na lista lateral.
export interface GameCategory {
  id: string;
  name: string;
  gameIds: string[];
  createdAt: string;                // ISO timestamp
  updatedAt: string;                // ISO timestamp
}

export const MAX_CATEGORY_NAME = 40;
