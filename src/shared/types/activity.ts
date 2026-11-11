// Linha do tempo do jogador. Hoje aparece só no perfil, neste PC; na 2.0 é o que vai para o feed dos amigos.

// O que não tem data própria em outro lugar e por isso fica gravado na hora (mudanças do Diário)
export type StoredActivityKind = 'started' | 'finished' | 'completed' | 'dropped' | 'rated' | 'reviewed';

// O resto vem dos dados que já existem: sessões (jogou) e conquistas (desbloqueou, fez 100%)
export type ActivityKind = StoredActivityKind | 'played' | 'achievements' | 'perfect';

export interface StoredActivity {
  id: string;
  kind: StoredActivityKind;
  gameId: string;
  at: string;                       // ISO
  rating?: number;                  // 'rated': 0,5 a 5
}

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  gameId: string;
  gameTitle: string;
  coverUrl?: string;
  at: string;                       // ISO; eventos agrupados por dia usam o horário mais recente
  rating?: number;                  // 'rated'
  count?: number;                   // 'achievements': quantas no dia
  seconds?: number;                 // 'played': tempo jogado no dia
}
