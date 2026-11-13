import { GameLog } from '@shared/types/game';
import { JournalImportItem } from '@shared/types/journal-import';
import { titleKey } from '@shared/utils/title-key';

// Cópia do Diário exportada pelo próprio Lazulium (schema "lazulium-journal/1"): serve para trazer o Diário de volta depois de formatar o PC
export function parseLazuliumJournal(text: string): JournalImportItem[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { schema, games } = data as { schema?: unknown; games?: unknown };
  if (typeof schema !== 'string' || !schema.startsWith('lazulium-journal/') || !Array.isArray(games)) return null;

  const items: JournalImportItem[] = [];
  for (const raw of games) {
    if (!raw || typeof raw !== 'object') continue;
    const g = raw as Record<string, unknown>;
    const title = typeof g.title === 'string' ? g.title.trim() : '';
    if (!title) continue;
    const log = g.log && typeof g.log === 'object' ? (g.log as GameLog) : {};
    // Só quem tem algo registrado entra: as horas sozinhas já são medidas pelo Lazulium
    if (!log.status && !log.rating && !log.startedOn && !log.finishedOn && !log.review?.trim() && !log.notes?.trim()) continue;
    const steamAppId = typeof g.steamAppId === 'string' && /^\d{1,10}$/.test(g.steamAppId) ? g.steamAppId : undefined;
    const seconds = Number(g.playtimeSeconds);
    items.push({
      key: steamAppId ? `steam:${steamAppId}` : `t:${titleKey(title)}`,
      title,
      platform: typeof g.platform === 'string' ? g.platform : undefined,
      steamAppId,
      playtimeSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : undefined,
      log: {
        status: log.status,
        rating: log.rating,
        startedOn: log.startedOn,
        finishedOn: log.finishedOn,
        review: typeof log.review === 'string' ? log.review : undefined,
        notes: typeof log.notes === 'string' ? log.notes : undefined
      }
    });
  }
  return items;
}
