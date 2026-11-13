import { GameLog, GameLogStatus } from '@shared/types/game';
import { JournalImportItem } from '@shared/types/journal-import';

// Lê as páginas do Backloggd que a própria pessoa salvou (Ctrl+S). Nada é baixado do site:
// o arquivo já está no computador e só o HTML dele é interpretado aqui.
//
// - Página Jogos (/u/<nome>/games/): um cartão por jogo, com a nota e o status do registro escondidos
//   em "preloaded-log-<id>" (data-rating de 1 a 10, data-status-title, data-is-playing, data-is-backlog...);
// - Página Avaliações (/u/<nome>/reviews/): um bloco por resenha, com texto, estrelas, status, plataforma e data.
// O Backloggd não guarda horas jogadas nem datas de início e término, então só nota, status, resenha e plataforma vêm daqui.
// As datas do registro e da resenha também não entram: o site as grava no dia em que a pessoa lançou o jogo (muita gente importa tudo de uma vez), não no dia em que terminou.
// Várias páginas salvas se somam: o mesmo jogo (mesmo endereço /games/<apelido>/) é unido num só.

// Os rótulos do Backloggd: Completed (zerou o objetivo principal), Retired (terminou um jogo sem final),
// Shelved (parado, talvez volte), Abandoned (parado de vez), Played (sem detalhe)
const STATUS_BY_LABEL: Record<string, GameLogStatus> = {
  completed: 'finished',
  retired: 'endless',
  shelved: 'paused',
  abandoned: 'dropped',
  playing: 'playing',
  backlog: 'backlog'
};

const SLUG_PATTERN = /\/games\/([a-z0-9][a-z0-9._-]*)/i;

const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

const statusFromLabel = (label: string | null | undefined): GameLogStatus | undefined => STATUS_BY_LABEL[clean(label).toLowerCase()];

// Nota de 1 a 10 do Backloggd (10 = cinco estrelas) → meia estrela em meia estrela
function ratingFromTen(value: string | null | undefined): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const rating = Math.round(Math.min(10, n)) / 2;
  return rating >= 0.5 ? rating : undefined;
}

// Estrelas das resenhas: a camada "stars-top" tem largura proporcional à nota (70% = 3,5 estrelas)
function ratingFromWidth(root: Element): number | undefined {
  const top = root.querySelector('.stars-top');
  const width = /width:\s*([\d.]+)%/.exec(top?.getAttribute('style') ?? '');
  if (!width) return undefined;
  const rating = Math.round((Math.min(100, Number(width[1])) / 100) * 5 * 2) / 2;
  return rating >= 0.5 ? rating : undefined;
}

// A resenha vira texto simples: quebras de linha e parágrafos preservados
function readReviewText(body: Element): string | undefined {
  const blocks = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return (node.textContent ?? '').replace(/\r/g, '');
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    if (el.tagName === 'BR') return '\n';
    if (/^(SCRIPT|STYLE|BUTTON)$/.test(el.tagName)) return '';
    const inner = Array.from(el.childNodes).map(walk).join('');
    return blocks.has(el.tagName) ? `\n${inner}\n` : inner;
  };
  const text = walk(body)
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || undefined;
}

function slugOf(root: Element): string | undefined {
  for (const link of Array.from(root.querySelectorAll('a[href*="/games/"]'))) {
    const match = SLUG_PATTERN.exec(link.getAttribute('href') ?? '');
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

const keyOf = (slug: string): string => `backloggd:${slug}`;

function readGameCard(doc: Document, card: Element): JournalImportItem | null {
  const slug = slugOf(card);
  const title = clean(card.querySelector('img')?.getAttribute('alt')) || clean(card.querySelector('.game-text-centered')?.textContent);
  if (!slug || !title) return null;

  const gameId = card.getAttribute('game_id');
  const flags = gameId ? doc.getElementById(`preloaded-log-${gameId}`)?.querySelector('[data-log-id], [data-rating], [data-status-title]') : null;
  const log: GameLog = {};

  const rating = ratingFromTen(flags?.getAttribute('data-rating')) ?? ratingFromWidth(card);
  if (rating !== undefined) log.rating = rating;

  // O status escolhido vale mais que as marcas "jogando" e "backlog", que podem coexistir com ele
  const status =
    statusFromLabel(flags?.getAttribute('data-status-title')) ??
    (flags?.getAttribute('data-is-playing') ? 'playing' : flags?.getAttribute('data-is-backlog') ? 'backlog' : undefined);
  if (status) log.status = status;

  // Só desejado (wishlist), sem nota nem status: não é algo que a pessoa jogou
  if (Object.keys(log).length === 0 && flags?.getAttribute('data-is-wishlist')) return null;

  return { key: keyOf(slug), title, log };
}

function readReviewBlock(block: Element): JournalImportItem | null {
  const slug = slugOf(block);
  const title = clean(block.querySelector('.game-cover img')?.getAttribute('alt'));
  if (!slug || !title) return null;

  const log: GameLog = {};
  const rating = ratingFromWidth(block);
  if (rating !== undefined) log.rating = rating;
  const status = statusFromLabel(block.querySelector('.play-type')?.textContent);
  if (status) log.status = status;
  const body = block.querySelector('.card-text');
  const review = body ? readReviewText(body) : undefined;
  if (review) log.review = review;

  const platform = clean(block.querySelector('.review-platform')?.textContent);
  return {
    key: keyOf(slug),
    title,
    platform: platform || undefined,
    log
  };
}

function mergeItems(a: JournalImportItem, b: JournalImportItem): JournalImportItem {
  const review = (a.log.review?.length ?? 0) >= (b.log.review?.length ?? 0) ? a.log.review : b.log.review;
  return {
    key: a.key,
    title: a.title || b.title,
    platform: a.platform ?? b.platform,
    log: {
      status: a.log.status ?? b.log.status,
      rating: a.log.rating ?? b.log.rating,
      review
    }
  };
}

export interface BackloggdParseResult {
  items: JournalImportItem[];
  expectedGames?: number;
  truncatedReviews: number;
}

// Junta o que vários arquivos trouxeram, sem repetir jogos
export function mergeBackloggdResults(results: BackloggdParseResult[]): BackloggdParseResult {
  const byKey = new Map<string, JournalImportItem>();
  for (const result of results) {
    for (const item of result.items) {
      const known = byKey.get(item.key);
      byKey.set(item.key, known ? mergeItems(known, item) : item);
    }
  }
  const expected = results.map((r) => r.expectedGames).filter((n): n is number => !!n);
  return { items: Array.from(byKey.values()), expectedGames: expected.length ? Math.max(...expected) : undefined, truncatedReviews: 0 };
}

// Páginas do Backloggd trazem data-route="user#games" (ou reviews/profile) no <body>
export const isBackloggdHtml = (html: string): boolean => /data-route="user#(games|reviews|profile)"/.test(html);

export function parseBackloggdDocument(doc: Document): BackloggdParseResult {
  const byKey = new Map<string, JournalImportItem>();
  const add = (item: JournalImportItem | null): void => {
    if (!item) return;
    const known = byKey.get(item.key);
    byKey.set(item.key, known ? mergeItems(known, item) : item);
  };

  // Resenhas: cada bloco com .review-card (o cartão da capa dentro dele também é "game-cover", por isso ele vem primeiro)
  const reviewBlocks = Array.from(doc.querySelectorAll('.review-card'));
  reviewBlocks.forEach((block) => add(readReviewBlock(block)));

  // Cartões da página Jogos: os que ficam dentro de uma resenha já foram lidos acima
  Array.from(doc.querySelectorAll('.game-cover[game_id]'))
    .filter((card) => !card.closest('.review-card'))
    .forEach((card) => add(readGameCard(doc, card)));

  // "Showing 48 games": quantos jogos o filtro atual tem, no total (não só nesta página)
  let expectedGames: number | undefined;
  for (const el of Array.from(doc.querySelectorAll('p, span, div, h2, h3, h4'))) {
    if (el.children.length > 0) continue;
    const match = /^Showing\s+(\d[\d.,]*)\s+games?$/i.exec(clean(el.textContent));
    if (match) {
      expectedGames = Number(match[1].replace(/[.,]/g, ''));
      break;
    }
  }

  return { items: Array.from(byKey.values()), expectedGames, truncatedReviews: 0 };
}

export function parseBackloggdHtml(html: string): BackloggdParseResult {
  return parseBackloggdDocument(new DOMParser().parseFromString(html, 'text/html'));
}
