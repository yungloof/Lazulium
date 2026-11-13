import { GameLog, GameLogStatus } from '@shared/types/game';
import { JournalImportItem } from '@shared/types/journal-import';
import { titleKey } from '@shared/utils/title-key';

// Lê a página do Your Gamer Profile que a própria pessoa salvou (Ctrl+S). Nada é baixado do site:
// o arquivo já está no computador e só o HTML dele é interpretado aqui.
//
// O site mostra os jogos de duas formas, e as duas entram:
// - aba Avaliações: um <article> por resenha (com o texto) e, dentro, status, nota, horas e conquistas;
// - aba Jogos: uma lista virtual, em que só as linhas visíveis existem no HTML salvo.
// Várias páginas salvas se somam: o mesmo jogo (mesmo endereço /games/...) é unido num só.

const STATUS_BY_LABEL: Record<string, GameLogStatus> = {
  finalizado: 'finished',
  zerado: 'finished',
  finished: 'finished',
  beaten: 'finished',
  completo: 'completed',
  completado: 'completed',
  platinado: 'completed',
  completed: 'completed',
  jogando: 'playing',
  playing: 'playing',
  'em andamento': 'playing',
  pausado: 'paused',
  paused: 'paused',
  'em pausa': 'paused',
  abandonado: 'dropped',
  dropped: 'dropped',
  abandoned: 'dropped',
  backlog: 'backlog',
  'quero jogar': 'backlog',
  'vou jogar': 'backlog',
  'want to play': 'backlog',
  continuo: 'endless',
  endless: 'endless',
  'sem fim': 'endless'
};

const GAME_LINK = 'a[href*="/games/"]';
const SLUG_PATTERN = /\/games\/([a-z0-9][a-z0-9-]*)/i;

const labelKey = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

// Elemento só com texto (os ícones svg ao lado do texto não contam)
const isLeaf = (el: Element): boolean => Array.from(el.children).every((c) => c.tagName.toLowerCase() === 'svg');

// "3h 43m", "58m", "2h" → segundos
export function parsePlaytime(text: string): number | undefined {
  const match = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i.exec(text.trim());
  if (!match || (!match[1] && !match[2])) return undefined;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60;
}

// "27/01/26" (dia/mês/ano) → "2026-01-27"
export function parseBrDate(text: string): string | undefined {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text.trim());
  if (!match) return undefined;
  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  const d = Number(day);
  const m = Number(month);
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12, feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12 };

// "· 14 ago" ou "· 30 jul 2025" (data da postagem) → "AAAA-MM-DD". Sem ano, vale o mais recente que não está no futuro.
export function parsePostedDate(text: string, now = new Date()): string | undefined {
  const match = /^·?\s*(\d{1,2})\s+([a-zç]{3,4})\.?(?:\s+(\d{4}))?$/i.exec(text.trim());
  if (!match) return undefined;
  const month = MONTHS[match[2].toLowerCase()];
  const day = Number(match[1]);
  if (!month || day < 1 || day > 31) return undefined;
  let year = match[3] ? Number(match[3]) : now.getFullYear();
  if (!match[3] && new Date(year, month - 1, day).getTime() > now.getTime()) year -= 1;
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

// As cinco estrelas são caixas com uma camada de largura proporcional ao quanto estão cheias
function readRating(root: Element): number | undefined {
  const boxes = Array.from(root.querySelectorAll('div.h-3.w-3')).slice(0, 5);
  if (boxes.length < 5) return undefined;
  let total = 0;
  for (const box of boxes) {
    const fill = box.querySelector('div.absolute');
    const width = /width:\s*([\d.]+)%/.exec(fill?.getAttribute('style') ?? '');
    if (width) total += Math.min(100, Number(width[1])) / 100;
  }
  const rating = Math.round(total * 2) / 2;
  return rating >= 0.5 && rating <= 5 ? rating : undefined;
}

// A resenha vira texto simples: parágrafos separados por linha em branco, listas com "- "
function readReview(body: Element, gameTitle: string): string | undefined {
  const blocks: string[] = [];
  const inline = (node: Node): string => {
    if (node.nodeType === 3) return (node.textContent ?? '').replace(/\r/g, '');
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    if (el.tagName === 'BR') return '\n';
    return Array.from(el.childNodes).map(inline).join('');
  };
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName;
      if (tag === 'HR') continue;
      if (tag === 'UL' || tag === 'OL') {
        const items = Array.from(child.children).map((li) => `- ${inline(li).replace(/[ \t]+/g, ' ').trim()}`);
        blocks.push(items.join('\n'));
      } else if (/^(P|H[1-6]|BLOCKQUOTE|LI|PRE)$/.test(tag)) {
        const text = inline(child).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
        if (text) blocks.push(tag === 'BLOCKQUOTE' ? text.replace(/^/gm, '> ') : text);
      } else if (child.children.length > 0 && !/^(BUTTON|SCRIPT|STYLE)$/.test(tag)) {
        walk(child);
      } else {
        const text = clean(child.textContent);
        if (text && tag !== 'BUTTON') blocks.push(text);
      }
    }
  };
  walk(body);
  // O YGP repete o nome do jogo como título no começo do texto
  if (blocks.length > 1 && titleKey(blocks[0]) === titleKey(gameTitle)) blocks.shift();
  const text = blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return text || undefined;
}

interface Section {
  root: Element;
  isReview: boolean;
}

// Lê uma resenha (<article>) ou uma linha da lista de jogos: os dois têm os mesmos campos pequenos
function readSection({ root, isReview }: Section): (JournalImportItem & { truncated?: boolean }) | null {
  const links = Array.from(root.querySelectorAll(GAME_LINK));
  const slug = links.map((a) => SLUG_PATTERN.exec(a.getAttribute('href') ?? '')?.[1]).find((s): s is string => !!s);
  const title = clean(links.find((a) => clean(a.textContent))?.textContent) || clean(links[0]?.getAttribute('aria-label')) || clean(root.querySelector('img[alt]:not([alt=""])')?.getAttribute('alt'));
  if (!slug && !title) return null;

  const body = isReview ? root.querySelector('.flow-root') : null;
  const spans = Array.from(root.querySelectorAll('span')).filter((s) => !body?.contains(s));

  let status: GameLogStatus | undefined;
  let playtime: number | undefined;
  let achievements: { unlocked: number; total: number } | undefined;
  let platform: string | undefined;
  let startedOn: string | undefined;
  let finishedOn: string | undefined;
  let postedOn: string | undefined;

  for (const span of spans) {
    const text = clean(span.textContent);
    if (!text) continue;
    if (!status && isLeaf(span)) {
      const mapped = STATUS_BY_LABEL[labelKey(text)];
      if (mapped) status = mapped;
    }
    if (!isLeaf(span)) {
      // Em telas estreitas o texto do status some e sobra o atributo title
      const hint = STATUS_BY_LABEL[labelKey(span.getAttribute('title') ?? '')];
      if (!status && hint) status = hint;
      continue;
    }
    if (playtime === undefined && /^(\d+\s*h(\s*\d+\s*m)?|\d+\s*m)$/i.test(text)) playtime = parsePlaytime(text);
    const ach = /^(\d+)\/(\d+)$/.exec(text);
    if (!achievements && ach && Number(ach[2]) > 0) achievements = { unlocked: Number(ach[1]), total: Number(ach[2]) };
    if (!startedOn && /^\d{1,2}\/\d{1,2}\/\d{2,4}(\s*→\s*\d{1,2}\/\d{1,2}\/\d{2,4})?$/.test(text)) {
      const [from, to] = text.split('→').map((part) => parseBrDate(part));
      startedOn = from;
      finishedOn = to;
    }
    if (isReview && !postedOn && text.startsWith('·')) postedOn = parsePostedDate(text);
    if (!platform && /^em\s+\S/i.test(text)) platform = text.replace(/^em\s+/i, '');
  }

  // Linhas da lista mostram só o ícone da loja (title="Steam"), sem o texto "em ..."
  if (!platform) platform = clean(root.querySelector('[role="img"][title]')?.getAttribute('title')) || undefined;

  // Sem rótulo, mas com todas as conquistas: o YGP mostra o selo de 100%
  if (!status && achievements && achievements.unlocked >= achievements.total) status = 'completed';

  const log: GameLog = { status, rating: readRating(root), startedOn, finishedOn };
  const review = body ? readReview(body, title) : undefined;
  if (review) log.review = review;

  const truncated = isReview && Array.from(root.querySelectorAll('button')).some((b) => /^ler mais$/i.test(clean(b.textContent)));
  return {
    key: slug ? `ygp:${slug}` : `t:${titleKey(title)}`,
    title,
    platform,
    playtimeSeconds: playtime,
    achievements,
    postedOn,
    log,
    truncated
  };
}

function mergeItems(a: JournalImportItem, b: JournalImportItem): JournalImportItem {
  // Cada campo vazio de um lado é preenchido pelo outro; a resenha mais longa vence
  const review = (a.log.review?.length ?? 0) >= (b.log.review?.length ?? 0) ? a.log.review : b.log.review;
  return {
    key: a.key,
    title: a.title || b.title,
    platform: a.platform ?? b.platform,
    playtimeSeconds: a.playtimeSeconds ?? b.playtimeSeconds,
    achievements: a.achievements ?? b.achievements,
    postedOn: a.postedOn ?? b.postedOn,
    log: {
      status: a.log.status ?? b.log.status,
      rating: a.log.rating ?? b.log.rating,
      startedOn: a.log.startedOn ?? b.log.startedOn,
      finishedOn: a.log.finishedOn ?? b.log.finishedOn,
      review,
      notes: a.log.notes ?? b.log.notes
    }
  };
}

export interface YgpParseResult {
  items: JournalImportItem[];
  expectedGames?: number;
  truncatedReviews: number;
}

// Junta o que vários arquivos trouxeram, sem repetir jogos
export function mergeYgpResults(results: YgpParseResult[]): YgpParseResult {
  const byKey = new Map<string, JournalImportItem>();
  for (const result of results) {
    for (const item of result.items) {
      const known = byKey.get(item.key);
      byKey.set(item.key, known ? mergeItems(known, item) : item);
    }
  }
  const expected = results.map((r) => r.expectedGames).filter((n): n is number => !!n);
  return {
    items: Array.from(byKey.values()),
    expectedGames: expected.length ? Math.max(...expected) : undefined,
    truncatedReviews: results.reduce((sum, r) => sum + r.truncatedReviews, 0)
  };
}

export function parseYgpDocument(doc: Document): YgpParseResult {
  const sections: Section[] = [
    ...Array.from(doc.querySelectorAll('article')).filter((el) => el.querySelector(GAME_LINK)).map((root) => ({ root, isReview: true })),
    ...Array.from(doc.querySelectorAll('[data-index]')).filter((el) => el.querySelector(GAME_LINK) && !el.closest('article')).map((root) => ({ root, isReview: false }))
  ];

  const byKey = new Map<string, JournalImportItem>();
  let truncatedReviews = 0;
  for (const section of sections) {
    const item = readSection(section);
    if (!item?.title) continue;
    if (item.truncated) truncatedReviews += 1;
    const { truncated: _truncated, ...plain } = item;
    const known = byKey.get(plain.key);
    byKey.set(plain.key, known ? mergeItems(known, plain) : plain);
  }

  // O perfil mostra o total de jogos ("198 Jogos", no rótulo do contador): serve para dizer quantos a página salva trouxe
  let expectedGames: number | undefined;
  for (const el of Array.from(doc.querySelectorAll('[aria-label]'))) {
    const match = /^(\d[\d.,]*)\s+(?:Jogos|Games)$/i.exec(clean(el.getAttribute('aria-label')));
    if (match) {
      expectedGames = Number(match[1].replace(/[.,]/g, ''));
      break;
    }
  }

  return { items: Array.from(byKey.values()), expectedGames, truncatedReviews };
}

export function parseYgpHtml(html: string): YgpParseResult {
  return parseYgpDocument(new DOMParser().parseFromString(html, 'text/html'));
}
