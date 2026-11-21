import React, { useState } from 'react';
import { ImageOff, Images } from 'lucide-react';
import type { PublicReviewImage, ReviewImage } from '@shared/types/game';
import { reviewPieces } from '@shared/utils/review-blocks';
import { reviewImageSrc } from '../utils/reviewImage';
import { focusRing } from './ui';

// Imagem pronta para mostrar: a sua (arquivo deste PC) ou a de um amigo (endereço do servidor)
interface ShownImage {
  at: number;
  src: string;
  width?: number;
  height?: number;
}

export const ownReviewImages = (images?: ReviewImage[]): ShownImage[] =>
  (images ?? []).map((i) => ({ at: i.at, src: reviewImageSrc(i.id), width: i.width, height: i.height }));

export const friendReviewImages = (images?: PublicReviewImage[]): ShownImage[] =>
  (images ?? []).filter((i) => /^https:\/\//.test(i.url)).map((i) => ({ at: i.at, src: i.url, width: i.width, height: i.height }));

const ReviewImg: React.FC<{ image: ShownImage; className: string }> = ({ image, className }) => {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className="flex items-center justify-center gap-1.5 h-16 rounded-lg border border-slate-800 bg-slate-950/40 text-[11px] text-slate-500">
        <ImageOff className="w-3.5 h-3.5" /> Imagem indisponível
      </span>
    );
  }
  return <img src={image.src} alt="" loading="lazy" width={image.width} height={image.height} draggable={false} onError={() => setBroken(true)} className={className} />;
};

interface ReviewBodyProps {
  review?: string;
  images: ShownImage[];
  expanded: boolean;
  textClassName: string;              // Tamanho e cor do texto (cada lugar tem o seu)
  clampClassName: string;             // line-clamp do texto recolhido
  imageMaxHeight?: string;
}

// Resenha como num blog: recolhida mostra o começo do texto e as imagens em miniatura; aberta, tudo na ordem
export const ReviewBody: React.FC<ReviewBodyProps> = ({ review = '', images, expanded, textClassName, clampClassName, imageMaxHeight = 'max-h-[460px]' }) => {
  if (expanded) {
    return (
      <div className="space-y-3">
        {reviewPieces(review, images).map((piece, i) =>
          piece.kind === 'text' ? (
            <p key={i} className={`${textClassName} whitespace-pre-wrap break-words select-text`}>
              {piece.text}
            </p>
          ) : (
            <ReviewImg key={i} image={piece.image} className={`block w-auto h-auto max-w-full ${imageMaxHeight} rounded-lg border border-slate-800 object-contain`} />
          )
        )}
      </div>
    );
  }
  const text = review.trim();
  const thumbs = images.slice(0, 4);
  return (
    <div className="space-y-2">
      {text && <p className={`${textClassName} whitespace-pre-wrap break-words select-text ${clampClassName}`}>{text}</p>}
      {thumbs.length > 0 && (
        <div className="flex items-center gap-1.5">
          {thumbs.map((image, i) => (
            <ReviewImg key={i} image={image} className="h-16 w-auto max-w-[8rem] rounded-md border border-slate-800 object-cover" />
          ))}
          {images.length > thumbs.length && (
            <span className="inline-flex items-center gap-1 px-2 h-7 rounded-md bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300">
              <Images className="w-3 h-3" /> +{images.length - thumbs.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// "Ler mais" vale quando o texto é longo ou quando há imagens (recolhida elas são só miniaturas)
export function reviewIsLong(review: string | undefined, imageCount: number, chars: number, lines: number): boolean {
  const text = review?.trim() ?? '';
  return imageCount > 0 || text.length > chars || text.split('\n').length > lines;
}

export const ReviewToggle: React.FC<{ expanded: boolean; onToggle: () => void; className: string; more: string; less: string }> = ({
  expanded,
  onToggle,
  className,
  more,
  less
}) => (
  <button type="button" onClick={onToggle} aria-expanded={expanded} className={`${className} rounded-sm ${focusRing}`}>
    {expanded ? less : more}
  </button>
);
