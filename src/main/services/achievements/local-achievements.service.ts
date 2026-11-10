import { Game } from '@shared/types/game';
import { Achievement, AchievementExtras, GameAchievements } from '@shared/types/achievements';
import { hasLazuliumCapture } from '../metadata/screenshots.service';

// Todo jogo tem conquistas, venha de onde vier. Sem lista em lugar nenhum (Switch, Wii U, ports), valem os marcos
// do Lazulium, medidos pelo que o app já registra; e o jogador pode criar as próprias em qualquer jogo fora da Steam.

const BLUE = '#3468f5';
const DEEP_BLUE = '#2342a8';
const GREEN = '#059669';
const AMBER = '#d97706';

const icon = (background: string, glyph: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${background}"/>${glyph}</svg>`)}`;
const label = (text: string, size = 22) =>
  `<text x="32" y="${32 + size * 0.36}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="700" fill="#fff">${text}</text>`;

const GLYPH = {
  play: '<path d="M25 18l22 14-22 14z" fill="#fff"/>',
  flag: '<path d="M21 14v38" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M24 16h22l-6 8 6 8H24z" fill="#fff"/>',
  star: '<path d="M32 12l6 13 14 2-10 10 3 15-13-8-13 8 3-15-10-10 14-2z" fill="#fff"/>',
  pen: '<path d="M17 47l4-13 20-20 9 9-20 20z" fill="#fff"/>',
  camera: (background: string) => `<rect x="12" y="22" width="40" height="27" rx="5" fill="#fff"/><rect x="24" y="15" width="16" height="10" rx="3" fill="#fff"/><circle cx="32" cy="35" r="8" fill="${background}"/>`
};

const CUSTOM_ICON = icon(DEEP_BLUE, GLYPH.star);

const HOUR_MILESTONES: { hours: number; name: string; background: string }[] = [
  { hours: 1, name: 'Aquecimento', background: DEEP_BLUE },
  { hours: 5, name: 'Pegou gosto', background: DEEP_BLUE },
  { hours: 10, name: 'Dedicação', background: BLUE },
  { hours: 25, name: 'Maratona', background: BLUE },
  { hours: 50, name: 'Veterano', background: AMBER },
  { hours: 100, name: 'Segunda casa', background: AMBER }
];

function buildMilestones(game: Game): Achievement[] {
  const seconds = game.totalPlaytimeSeconds ?? 0;
  const status = game.log?.status;
  const finished = status === 'finished' || status === 'completed';
  const finishedAt = game.log?.finishedOn ? `${game.log.finishedOn}T12:00:00.000Z` : undefined;
  const milestone = (id: string, name: string, description: string, iconUrl: string, unlocked: boolean, unlockedAt?: string): Achievement => ({
    id: `lazulium:${id}`,
    name,
    description,
    iconUrl,
    unlocked,
    unlockedAt: unlocked ? unlockedAt : undefined
  });

  return [
    milestone('first', 'Primeiro contato', 'Jogue pela primeira vez.', icon(DEEP_BLUE, GLYPH.play), seconds >= 60 || !!game.lastPlayedAt),
    ...HOUR_MILESTONES.map((m) =>
      milestone(`hours-${m.hours}`, m.name, m.hours === 1 ? 'Jogue por 1 hora.' : `Jogue por ${m.hours} horas.`, icon(m.background, label(`${m.hours}h`, m.hours >= 100 ? 18 : 22)), seconds >= m.hours * 3600)
    ),
    milestone('finished', 'Créditos finais', 'Marque o jogo como Zerado.', icon(GREEN, GLYPH.flag), finished, finishedAt),
    milestone('completed', 'Sem deixar nada', 'Marque o jogo como 100%.', icon(AMBER, label('100%', 17)), status === 'completed', finishedAt),
    milestone('rated', 'Veredito', 'Dê uma nota ao jogo.', icon(BLUE, GLYPH.star), !!game.log?.rating),
    milestone('review', 'Crítico', 'Escreva uma resenha.', icon(BLUE, GLYPH.pen), !!game.log?.review?.trim()),
    milestone('capture', 'Fotógrafo', 'Tire uma captura com a tecla do Lazulium durante o jogo.', icon(BLUE, GLYPH.camera(BLUE)), hasLazuliumCapture(game.id))
  ];
}

export function buildMilestoneList(game: Game, note?: string): GameAchievements {
  const items = buildMilestones(game);
  return {
    gameId: game.id,
    source: 'lazulium',
    total: items.length,
    unlocked: items.filter((a) => a.unlocked).length,
    items,
    syncedAt: new Date().toISOString(),
    note
  };
}

// Junta à lista o que o jogador marcou à mão e as conquistas que criou. Pode rodar de novo sobre o próprio resultado.
export function applyExtras(base: GameAchievements, extras: AchievementExtras): GameAchievements {
  const marks = extras.unlocked ?? {};
  const items: Achievement[] = base.items
    .filter((a) => !a.custom)
    .map((a) => {
      // Marcos são medidos pelo app, e o que a fonte já registrou não se desmarca
      if (base.source !== 'retroachievements' || (a.unlocked && !a.manual)) return { ...a, markable: undefined };
      const markedAt = marks[a.id];
      return { ...a, unlocked: !!markedAt, unlockedAt: markedAt || undefined, manual: markedAt ? true : undefined, markable: true };
    });
  if (base.source !== 'steam') {
    for (const custom of extras.custom ?? []) {
      const markedAt = marks[custom.id];
      items.push({ ...custom, iconUrl: CUSTOM_ICON, unlocked: !!markedAt, unlockedAt: markedAt || undefined, custom: true, manual: markedAt ? true : undefined, markable: true });
    }
  }
  return { ...base, items, total: items.length, unlocked: items.filter((a) => a.unlocked).length };
}
