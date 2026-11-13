import { Game, GameLog } from '@shared/types/game';
import { JournalImportApplyResult, JournalImportItem, JournalImportOptions, JournalImportPreviewItem } from '@shared/types/journal-import';
import { titleKey } from '@shared/utils/title-key';
import { db } from '../../database/db';
import { buildJournalGame, sanitizeLog } from './journal.service';

// Importação do Diário: junta o que veio de um arquivo (YGP ou cópia do Lazulium) com a biblioteca.
// Quem já está na biblioteca recebe o registro; quem não está vira entrada manual do Diário.
// Por padrão nada que a pessoa já preencheu é sobrescrito.

const LOG_FIELDS: Array<keyof GameLog> = ['status', 'rating', 'startedOn', 'finishedOn', 'review', 'notes'];
const MAX_ITEMS = 5000;

interface Plan {
  item: JournalImportItem;
  game: Game | null;
  nextLog: GameLog;
  preview: JournalImportPreviewItem;
}

const hasValue = (log: GameLog | undefined, field: keyof GameLog): boolean => {
  const value = log?.[field];
  return typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null;
};

function buildIndex(games: Game[]) {
  const bySteam = new Map<string, Game>();
  const byTitle = new Map<string, Game[]>();
  for (const game of games) {
    if (game.platform === 'steam' && game.platformGameId && !bySteam.has(game.platformGameId)) bySteam.set(game.platformGameId, game);
    // Vários jogos podem ter o mesmo nome (versões diferentes): a lista fica com os da biblioteca antes dos registros manuais
    for (const name of [game.title, game.customTitle, game.detectedTitle]) {
      const key = name ? titleKey(name) : '';
      if (!key) continue;
      const list = byTitle.get(key) ?? [];
      if (list.includes(game)) continue;
      if (game.manualEntry) list.push(game);
      else list.splice(list.filter((g) => !g.manualEntry).length, 0, game);
      byTitle.set(key, list);
    }
  }
  return { bySteam, byTitle };
}

function plan(items: JournalImportItem[], options: JournalImportOptions): Plan[] {
  const index = buildIndex(db.getGames());
  // Cada jogo da biblioteca recebe um só item: dois do arquivo com o mesmo nome (ex: Resident Evil 4 de 2005 e o remake) não se sobrescrevem
  const claimed = new Set<string>();
  return items.slice(0, MAX_ITEMS).map((item) => {
    // Resenha de quem não trouxe as datas do jogo (aba Jogos): a data da postagem serve de data de término de quem zerou
    const dated = item.log?.startedOn || item.log?.finishedOn;
    const finished = item.log?.status === 'finished' || item.log?.status === 'completed';
    const incoming = sanitizeLog(item.postedOn && !dated && finished ? { ...item.log, finishedOn: item.postedOn } : (item.log ?? {}));
    const bySteam = item.steamAppId ? index.bySteam.get(item.steamAppId) : undefined;
    const game = (bySteam && !claimed.has(bySteam.id) ? bySteam : index.byTitle.get(titleKey(item.title))?.find((g) => !claimed.has(g.id))) ?? null;
    if (game) claimed.add(game.id);
    const changes: Array<keyof GameLog> = [];
    const kept: Array<keyof GameLog> = [];
    const nextLog: GameLog = { ...(game?.log ?? {}) };

    for (const field of LOG_FIELDS) {
      const value = incoming[field];
      if (value === undefined) continue;
      const current = game?.log?.[field];
      if (!hasValue(game?.log, field)) {
        (nextLog as Record<string, unknown>)[field] = value;
        changes.push(field);
      } else if (current !== value) {
        if (options.replaceExisting) {
          (nextLog as Record<string, unknown>)[field] = value;
          changes.push(field);
        } else {
          kept.push(field);
        }
      }
    }

    const action = game ? (changes.length > 0 ? 'update' : 'unchanged') : changes.length > 0 ? 'create' : 'unchanged';
    return {
      item,
      game,
      nextLog,
      preview: { key: item.key, title: item.title, action, matchedTitle: game?.title, changes, kept }
    };
  });
}

export function previewJournalImport(items: JournalImportItem[], options: JournalImportOptions): JournalImportPreviewItem[] {
  return plan(items, options).map((p) => p.preview);
}

export function applyJournalImport(items: JournalImportItem[], options: JournalImportOptions): JournalImportApplyResult {
  const changed: Game[] = [];
  let updated = 0;
  let created = 0;
  let unchanged = 0;
  const now = new Date().toISOString();

  for (const { item, game, nextLog, preview } of plan(items, options)) {
    if (preview.action === 'unchanged') {
      unchanged += 1;
    } else if (preview.action === 'update' && game) {
      changed.push({ ...game, log: sanitizeLog(nextLog), updatedAt: now });
      updated += 1;
    } else if (preview.action === 'create') {
      changed.push(
        buildJournalGame({
          title: item.title,
          manualPlatform: item.platform,
          totalPlaytimeSeconds: item.playtimeSeconds ?? 0,
          log: nextLog
        })
      );
      created += 1;
    }
  }

  // Uma escrita só e, de propósito, nenhuma atividade no feed: centenas de "zerou" de uma vez de dias antigos só atrapalhariam os amigos
  if (changed.length > 0) db.upsertGames(changed);
  console.log(`[Diário] Importação: ${updated} atualizados, ${created} novos, ${unchanged} sem mudança`);
  return { updated, created, unchanged, games: changed };
}
