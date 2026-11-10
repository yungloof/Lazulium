import { Game } from '@shared/types/game';

const LOW_PLAYTIME_SECONDS = 2 * 3600;
const LOW_PLAYTIME_WEIGHT_CAP_SECONDS = 20 * 3600;
const SUGGESTION_DONE = ['finished', 'completed', 'dropped', 'playing'];

export interface GameSuggestion {
  game: Game;
  reason: string;
}

const formatHours = (seconds: number) => `${(seconds / 3600).toFixed(1).replace('.', ',')} h`;

// Peso de cada jogo instalado: o que você marcou para jogar vem antes do que só está parado na biblioteca
function scoreGame(game: Game): GameSuggestion & { weight: number } {
  const seconds = game.totalPlaytimeSeconds ?? 0;
  if (game.log?.status === 'backlog') return { game, weight: 12, reason: 'Você marcou como Quero jogar' };
  if (game.log?.status === 'paused') return { game, weight: 10, reason: `Pausado com ${formatHours(seconds)}` };
  if (seconds < 60) return { game, weight: 4, reason: 'Instalado e nunca jogado' };
  if (seconds < LOW_PLAYTIME_SECONDS) return { game, weight: 6, reason: `Você só jogou ${formatHours(seconds)}` };
  if (seconds < LOW_PLAYTIME_WEIGHT_CAP_SECONDS) return { game, weight: 2, reason: `Parado com ${formatHours(seconds)}` };
  return { game, weight: 1, reason: `Um velho conhecido: ${formatHours(seconds)}` };
}

export function pickSuggestion(games: Game[], excludeId?: string): GameSuggestion | null {
  const pool = games
    .filter((g) => g.isInstalled !== false && !g.isSoftware && !g.manualEntry && !g.isHidden && !g.skipSuggestions && !SUGGESTION_DONE.includes(g.log?.status ?? ''))
    .map(scoreGame);
  const options = pool.length > 1 ? pool.filter((s) => s.game.id !== excludeId) : pool;
  const total = options.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return { game: option.game, reason: option.reason };
  }
  return null;
}
