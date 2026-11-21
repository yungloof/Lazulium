import { describe, expect, it } from 'vitest';
import type { ReviewImage } from '../../src/shared/types/game';
import {
  MAX_REVIEW_IMAGES,
  fromBlocks,
  mergeTextBlocks,
  reviewPieces,
  sanitizeReviewImages,
  shareableReview,
  toBlocks,
  trimReview
} from '../../src/shared/utils/review-blocks';
import { normalizeLog } from '../../src/shared/utils/library-sync';

const img = (n: number, at = 0): ReviewImage => ({ id: `${String(n).padStart(16, '0')}.webp`, at, width: 1600, height: 900 });
const shape = (blocks: ReturnType<typeof toBlocks>) => blocks.map((b) => (b.kind === 'text' ? `T:${b.text}` : `I:${b.image.id.slice(15, 16)}`));

describe('resenha com imagens (blocos)', () => {
  it('imagens no meio: texto, imagem, texto... e volta igual ao salvar', () => {
    const review = 'Primeiro parágrafo.\n\nSegundo parágrafo.';
    const images = [img(1, 19), img(2, review.length)];
    const blocks = toBlocks(review, images);
    expect(shape(blocks)).toEqual(['T:Primeiro parágrafo.', 'I:1', 'T:Segundo parágrafo.', 'I:2', 'T:']);
    expect(fromBlocks(blocks)).toEqual({ review, reviewImages: images });
  });

  it('duas imagens seguidas e imagem antes de todo texto', () => {
    const blocks = toBlocks('Texto', [img(1, 0), img(2, 5), img(3, 5)]);
    expect(shape(blocks)).toEqual(['T:', 'I:1', 'T:Texto', 'I:2', 'T:', 'I:3', 'T:']);
    const saved = fromBlocks(blocks);
    expect(saved.review).toBe('Texto');
    expect(saved.reviewImages.map((i) => i.at)).toEqual([0, 5, 5]);
    expect(shape(toBlocks(saved.review, saved.reviewImages))).toEqual(shape(blocks));
  });

  it('texto vazio entre imagens some ao salvar; tirar a imagem junta os textos vizinhos', () => {
    const blocks = toBlocks('A\n\nB', [img(1, 1)]);
    const removed = mergeTextBlocks(blocks.filter((b) => b.kind === 'text'));
    expect(shape(removed)).toEqual(['T:A\n\nB']);
    expect(shape(mergeTextBlocks([blocks[1]]))).toEqual(['T:', 'I:1', 'T:']);
  });

  it('só imagem, sem texto', () => {
    const saved = fromBlocks(toBlocks('', [img(1, 0)]));
    expect(saved).toEqual({ review: '', reviewImages: [img(1, 0)] });
  });

  it('aparar espaços e cortar o texto não tira as imagens do lugar', () => {
    const { review, reviewImages } = trimReview('   Olá mundo.  ', [img(1, 3 + 'Olá mundo.'.length)]);
    expect(review).toBe('Olá mundo.');
    expect(reviewImages?.[0].at).toBe('Olá mundo.'.length);
    const cut = trimReview('abcdef', [img(1, 6), img(2, 2)], 4);
    expect(cut.review).toBe('abcd');
    expect(cut.reviewImages?.map((i) => i.at)).toEqual([4, 4]);
  });

  it('o que vem da tela é conferido: id, tamanho, posição e limite de imagens', () => {
    const bad = [
      { id: '../../segredo.webp', at: 0, width: 10, height: 10 },
      { id: 'abcdef0123456789.png', at: 0, width: 10, height: 10 },
      { id: 'abcdef0123456789.webp', at: 0, width: 0, height: 10 },
      { id: 'abcdef0123456789.webp', at: 'x', width: 10, height: 10 },
      null
    ];
    expect(sanitizeReviewImages(bad, 'x'.repeat(10))).toBeUndefined();
    expect(sanitizeReviewImages([{ ...img(1), at: 99 }], 'x'.repeat(10))?.[0].at).toBe(10);
    // No meio de um parágrafo: vai para o fim dele
    expect(sanitizeReviewImages([{ ...img(1), at: 3 }, { ...img(2), at: 12 }], 'Primeiro.\n\nSegundo.')?.map((i) => i.at)).toEqual([9, 19]);
    expect(sanitizeReviewImages(Array.from({ length: 40 }, (_, i) => img(i)), '')).toHaveLength(MAX_REVIEW_IMAGES);
  });

  it('pedaços para mostrar (a sua e a de amigos)', () => {
    const pieces = reviewPieces('A\n\nB', [{ at: 1, url: 'u' }]);
    expect(pieces).toEqual([
      { kind: 'text', text: 'A' },
      { kind: 'image', image: { at: 1, url: 'u' } },
      { kind: 'text', text: 'B' }
    ]);
  });
});

describe('resenha que sai do PC', () => {
  const url = (id: string) => (id.startsWith('0000000000000002') ? undefined : `https://social.test/v1/review-images/${id}`);

  it('só imagens já enviadas; posições batem com o texto limpo (como o servidor limpa)', () => {
    const review = 'Linha\r\ncom\u0007 controle\n\n\n\nOutro parágrafo';
    const images = [img(1, review.indexOf('\n\n')), img(2, review.length), img(3, review.length)];
    const shared = shareableReview(review, images, url, 6000);
    expect(shared.review).toBe('Linha\ncom  controle\n\nOutro parágrafo');
    expect(shared.reviewImages?.map((i) => i.at)).toEqual(['Linha\ncom  controle'.length, shared.review.length]);
    expect(shared.reviewImages?.[0].url).toContain('0000000000000001.webp');
  });

  it('corte do texto: imagem de trecho cortado fica de fora', () => {
    const review = 'Começo.\n\n' + 'x'.repeat(50);
    const shared = shareableReview(review, [img(1, 7), img(3, review.length)], url, 20);
    expect(shared.review).toHaveLength(20);
    expect(shared.reviewImages?.map((i) => i.at)).toEqual([7]);
  });

  it('sincronização entre PCs guarda as imagens e compara pelas posições', () => {
    const log = normalizeLog({ review: '  Oi  ', reviewImages: [img(1, 4)] });
    expect(log).toEqual({ review: 'Oi', reviewImages: [img(1, 2)] });
    expect(normalizeLog({ reviewImages: [img(1, 0)] })).toEqual({ reviewImages: [img(1, 0)] });
  });
});
