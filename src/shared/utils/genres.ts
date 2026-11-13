const GENRE_LABELS_PT: Record<string, string> = {
  'Role-playing (RPG)': 'RPG',
  Adventure: 'Aventura',
  Shooter: 'Tiro',
  Platform: 'Plataforma',
  Puzzle: 'Quebra-cabeça',
  Strategy: 'Estratégia',
  'Real Time Strategy (RTS)': 'RTS',
  'Turn-based strategy (TBS)': 'Estratégia por turnos',
  Tactical: 'Tático',
  Simulator: 'Simulação',
  Sport: 'Esporte',
  Racing: 'Corrida',
  Fighting: 'Luta',
  "Hack and slash/Beat 'em up": 'Hack and slash',
  'Point-and-click': 'Point-and-click',
  'Visual Novel': 'Visual Novel',
  'Card & Board Game': 'Cartas e tabuleiro',
  Music: 'Música',
  'Quiz/Trivia': 'Quiz',
  Indie: 'Indie',
  Arcade: 'Arcade',
  Pinball: 'Pinball',
  MOBA: 'MOBA'
};

// Temas de jogabilidade muito usados como gênero no dia a dia
const THEME_GENRES_PT: Record<string, string> = {
  Action: 'Ação',
  Horror: 'Terror',
  Survival: 'Sobrevivência',
  Stealth: 'Furtivo'
};

export function translateIgdbGenre(name: string): string {
  const clean = name.trim();
  return GENRE_LABELS_PT[clean] ?? THEME_GENRES_PT[clean] ?? clean;
}

export function normalizeIgdbGenres(genres?: unknown, themes?: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const push = (label: string) => {
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    result.push(label);
  };

  if (Array.isArray(themes)) {
    for (const raw of themes) {
      if (typeof raw !== 'string') continue;
      const mapped = THEME_GENRES_PT[raw.trim()];
      if (mapped) push(mapped);
    }
  }

  if (Array.isArray(genres)) {
    for (const raw of genres) {
      if (typeof raw !== 'string') continue;
      push(translateIgdbGenre(raw));
    }
  }

  return result;
}
