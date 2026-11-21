// Resenha com imagens no meio, como num blog: o texto continua puro (versões antigas e amigos que ainda não
// atualizaram leem só ele) e cada imagem guarda a posição no texto onde fica (`at`, sempre no fim de um parágrafo).
// O editor trabalha com blocos (texto, imagem, texto...) e converte na hora de salvar.
import type { GameLog, PublicReviewImage, ReviewImage } from '@shared/types/game';

export const MAX_REVIEW_IMAGES = 30;
export const MAX_REVIEW_IMAGE_BYTES = 500_000;    // Cada imagem depois de reduzida (o servidor aceita até ~512 KB)
export const REVIEW_IMAGE_MAX_SIDE = 1920;
export const REVIEW_IMAGE_ID = /^[a-f0-9]{16}\.(webp|gif)$/;
const PARAGRAPH = '\n\n';
const MAX_SIDE = 20_000;

export type ReviewBlock =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'image'; key: string; image: ReviewImage };

let keySeq = 0;
export const blockKey = (): string => `b${++keySeq}`;

const stripOuterNewlines = (text: string) => text.replace(/^\n+|\n+$/g, '');

const byPosition = <T extends { at: number }>(images: T[]): T[] =>
  images.map((image, index) => ({ image, index })).sort((a, b) => a.image.at - b.image.at || a.index - b.index).map((x) => x.image);

// Texto + imagens -> blocos. Sempre começa e termina com texto, e há um texto (talvez vazio) entre duas imagens,
// para o cursor ter onde ficar.
export function toBlocks(review = '', images: ReviewImage[] = []): ReviewBlock[] {
  const blocks: ReviewBlock[] = [];
  let pos = 0;
  for (const image of byPosition(images)) {
    const at = Math.max(pos, Math.min(review.length, image.at));
    blocks.push({ kind: 'text', key: blockKey(), text: stripOuterNewlines(review.slice(pos, at)) });
    blocks.push({ kind: 'image', key: blockKey(), image: { ...image } });
    pos = at;
  }
  blocks.push({ kind: 'text', key: blockKey(), text: stripOuterNewlines(review.slice(pos)) });
  return blocks;
}

// Blocos -> texto + imagens. Textos vazios somem; parágrafos ficam separados por linha em branco.
export function fromBlocks(blocks: ReviewBlock[]): { review: string; reviewImages: ReviewImage[] } {
  let review = '';
  const reviewImages: ReviewImage[] = [];
  for (const block of blocks) {
    if (block.kind === 'image') {
      reviewImages.push({ ...block.image, at: review.length });
      continue;
    }
    const text = block.text.trim();
    if (text) review += (review ? PARAGRAPH : '') + text;
  }
  return { review, reviewImages };
}

// Junta dois textos vizinhos (depois de tirar a imagem que estava entre eles)
export function mergeTextBlocks(blocks: ReviewBlock[]): ReviewBlock[] {
  const out: ReviewBlock[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.kind === 'text' && last?.kind === 'text') {
      out[out.length - 1] = { ...last, text: [last.text.replace(/\s+$/, ''), block.text.replace(/^\s+/, '')].filter(Boolean).join(PARAGRAPH) };
    } else {
      out.push(block);
    }
  }
  if (out[0]?.kind !== 'text') out.unshift({ kind: 'text', key: blockKey(), text: '' });
  if (out[out.length - 1]?.kind !== 'text') out.push({ kind: 'text', key: blockKey(), text: '' });
  return out;
}

const validSide = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_SIDE ? n : null;
};

// Imagem fica sempre entre parágrafos: no começo, no fim ou logo antes de uma linha em branco. Uma posição no meio
// de um parágrafo (o texto mudou por outro caminho, como registrar de novo pelo Diário) vai para o fim dele.
function paragraphEnd(text: string, at: number): number {
  const pos = Math.max(0, Math.min(text.length, Math.round(at)));
  if (pos === 0 || pos === text.length || text.startsWith(PARAGRAPH, pos)) return pos;
  const next = text.indexOf(PARAGRAPH, pos);
  return next === -1 ? text.length : next;
}

// O renderer (ou um banco antigo) pode mandar qualquer coisa: guarda só imagens válidas, com `at` entre parágrafos
export function sanitizeReviewImages(images: unknown, text: string): ReviewImage[] | undefined {
  if (!Array.isArray(images)) return undefined;
  const out: ReviewImage[] = [];
  for (const raw of images) {
    if (out.length >= MAX_REVIEW_IMAGES) break;
    const image = raw as Partial<ReviewImage> | null;
    if (!image || typeof image.id !== 'string' || !REVIEW_IMAGE_ID.test(image.id)) continue;
    const width = validSide(image.width);
    const height = validSide(image.height);
    const at = Number(image.at);
    if (!width || !height || !Number.isFinite(at)) continue;
    out.push({ id: image.id, at: paragraphEnd(text, at), width, height });
  }
  return out.length ? byPosition(out) : undefined;
}

// Aparar o texto (espaços nas pontas, limite de tamanho) sem tirar as imagens do lugar
export function trimReview(review: string | undefined, images: ReviewImage[] | undefined, maxLength = Infinity): Pick<GameLog, 'review' | 'reviewImages'> {
  const raw = review ?? '';
  const lead = raw.length - raw.trimStart().length;
  const text = raw.trim().slice(0, maxLength).trimEnd();
  const reviewImages = sanitizeReviewImages(
    (images ?? []).map((image) => ({ ...image, at: Number(image?.at) - lead })),
    text
  );
  return { review: text || undefined, reviewImages };
}

export function hasReviewContent(log?: Pick<GameLog, 'review' | 'reviewImages'>): boolean {
  return !!(log?.review?.trim() || log?.reviewImages?.length);
}

export function reviewImagesEqual(a?: ReviewImage[], b?: ReviewImage[]): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((image, i) => image.id === y[i].id && image.at === y[i].at && image.width === y[i].width && image.height === y[i].height);
}

// Para mostrar: pedaços de texto e imagens em ordem (vale para a própria resenha e para a de amigos)
export type ReviewPiece<T> = { kind: 'text'; text: string } | { kind: 'image'; image: T };

export function reviewPieces<T extends { at: number }>(review = '', images: T[] = []): ReviewPiece<T>[] {
  const pieces: ReviewPiece<T>[] = [];
  let pos = 0;
  for (const image of byPosition(images)) {
    const at = Math.max(pos, Math.min(review.length, image.at));
    const text = stripOuterNewlines(review.slice(pos, at));
    if (text.trim()) pieces.push({ kind: 'text', text });
    pieces.push({ kind: 'image', image });
    pos = at;
  }
  const rest = stripOuterNewlines(review.slice(pos));
  if (rest.trim()) pieces.push({ kind: 'text', text: rest });
  return pieces;
}

// Mesma limpeza que o servidor faz no texto (cleanMultiline em server/social): aplicada aqui, por parágrafo, para
// as posições das imagens continuarem certas depois que o texto sai do PC
const cleanPiece = (text: string): string =>
  text.replace(/\r\n?/g, '\n').replace(/[^\P{C}\n]/gu, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Resenha como sai para amigos e vitrine: texto limpo e cortado em maxLength; imagens só as já enviadas (urlOf).
// Imagem de um trecho que ficou de fora do corte também fica de fora.
export function shareableReview(
  review: string | undefined,
  images: ReviewImage[] | undefined,
  urlOf: (id: string) => string | undefined,
  maxLength: number
): { review: string; reviewImages?: PublicReviewImage[] } {
  let text = '';
  let cut = false;
  const out: PublicReviewImage[] = [];
  for (const piece of reviewPieces(review ?? '', images ?? [])) {
    if (piece.kind === 'image') {
      const url = cut ? undefined : urlOf(piece.image.id);
      if (url) out.push({ at: text.length, url, width: piece.image.width, height: piece.image.height });
      continue;
    }
    const clean = cleanPiece(piece.text);
    if (!clean || cut) continue;
    const joined = (text ? `${text}\n\n` : '') + clean;
    if (joined.length > maxLength) {
      text = joined.slice(0, maxLength).trimEnd();
      cut = true;
    } else {
      text = joined;
    }
  }
  return { review: text, reviewImages: out.length ? out : undefined };
}
