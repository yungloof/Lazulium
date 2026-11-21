// Prepara a imagem escolhida para a resenha: reduz para no máximo 1920 px e grava em WebP até caber no limite
// (cada imagem pode ir para o servidor da conta). GIF pequeno vai como está, para continuar animado.
import type { ReviewImageSource } from '@shared/types/ipc';
import { MAX_REVIEW_IMAGE_BYTES, REVIEW_IMAGE_MAX_SIDE } from '@shared/utils/review-blocks';

export interface PreparedReviewImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

const QUALITIES = [0.85, 0.75, 0.62, 0.5];

export async function prepareReviewImage(source: ReviewImageSource): Promise<PreparedReviewImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([source.bytes as BlobPart], { type: source.mime }));
  } catch {
    throw new Error('Não deu para abrir essa imagem. Tente outro arquivo (PNG, JPG, WebP ou GIF).');
  }
  try {
    const { width, height } = bitmap;
    if (!width || !height) throw new Error('Imagem vazia.');
    if (source.mime === 'image/gif' && source.bytes.byteLength <= MAX_REVIEW_IMAGE_BYTES) {
      return { bytes: source.bytes, width, height };
    }
    let side = Math.min(REVIEW_IMAGE_MAX_SIDE, Math.max(width, height));
    for (let round = 0; round < 4; round++) {
      const scale = side / Math.max(width, height);
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Não deu para preparar a imagem.');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const quality of QUALITIES) {
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
        if (blob.type !== 'image/webp') throw new Error('Não deu para preparar a imagem.');
        if (blob.size <= MAX_REVIEW_IMAGE_BYTES) return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
      }
      side = Math.round(side * 0.7);
    }
    throw new Error('Essa imagem tem detalhe demais para caber. Tente cortar ou usar outra.');
  } finally {
    bitmap.close();
  }
}

// Endereço da imagem guardada neste PC (se faltar e for da sua conta, o app traz do servidor)
export const reviewImageSrc = (id: string): string => `lazulium-media://review/${encodeURIComponent(id)}`;
