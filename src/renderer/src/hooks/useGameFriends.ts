import { useEffect, useState } from 'react';
import { Game } from '@shared/types/game';
import { GameFriend } from '@shared/types/social';
import { editionIds } from '@shared/utils/editions';

// Amigos que jogaram este jogo (todas as lojas do card). null: sem conta Lazulium ou ainda carregando.
// Falha (sem internet, servidor antigo) some em silêncio: é um extra da página, não um erro.
export function useGameFriends(game: Pick<Game, 'id' | 'editions'>): GameFriend[] | null {
  const [friends, setFriends] = useState<GameFriend[] | null>(null);
  const ids = editionIds(game).join(',');

  useEffect(() => {
    let cancelled = false;
    setFriends(null);
    window.electronAPI
      ?.socialGetGameFriends(ids.split(','))
      .then((list) => !cancelled && setFriends(list))
      .catch(() => !cancelled && setFriends(null));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return friends;
}
