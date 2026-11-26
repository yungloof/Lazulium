import { Game, GameLogStatus } from '@shared/types/game';
import { formatDay } from '../components/journal/format';
import { formatPlaytimeShort } from './format';
import { PLATFORM_FULL } from './platform';

export interface ShareCardOptions {
  includeReview: boolean;
  includePlaytime: boolean;
  playerName?: string;
}

export interface ShareCardPalette {
  bg: string;
  panel: string;
  border: string;
  accent: string;
  accentSoft: string;
  textMain: string;
  textSoft: string;
  textMuted: string;
  gold: string;
  emerald: string;
}

const DEFAULT_PALETTE: ShareCardPalette = {
  bg: '#0e1426',
  panel: '#151c30',
  border: '#2f3b56',
  accent: '#4a80ff',
  accentSoft: '#93b6ff',
  textMain: '#f1f5fd',
  textSoft: '#a7b5d3',
  textMuted: '#8292b5',
  gold: '#fbbf24',
  emerald: '#34d399'
};

const STATUS_LABELS: Record<GameLogStatus, string> = {
  playing: 'Jogando',
  endless: 'Contínuo',
  finished: 'Zerado',
  completed: '100%',
  paused: 'Pausado',
  dropped: 'Abandonado',
  backlog: 'Quero jogar'
};

const RATING_LABELS = ['', 'Ruim', 'Fraco', 'Bom', 'Ótimo', 'Obra-prima'];

export function readCardPalette(): ShareCardPalette {
  if (typeof document === 'undefined') return DEFAULT_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    bg: pick('--color-surface-bg', DEFAULT_PALETTE.bg),
    panel: pick('--color-surface-panel', DEFAULT_PALETTE.panel),
    border: pick('--color-slate-700', DEFAULT_PALETTE.border),
    accent: pick('--color-indigo-500', DEFAULT_PALETTE.accent),
    accentSoft: pick('--color-indigo-300', DEFAULT_PALETTE.accentSoft),
    textMain: pick('--color-slate-50', DEFAULT_PALETTE.textMain),
    textSoft: pick('--color-slate-300', DEFAULT_PALETTE.textSoft),
    textMuted: pick('--color-slate-400', DEFAULT_PALETTE.textMuted),
    gold: pick('--color-amber-400', DEFAULT_PALETTE.gold),
    emerald: pick('--color-emerald-400', DEFAULT_PALETTE.emerald)
  };
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--;
  return `${text.slice(0, end).trimEnd()}…`;
}

/** Wraps multi-paragraph prose into at most `maxLines`, adding an ellipsis if truncated. */
export function wrapCardText(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const cleaned = text.replace(/\r\n?/g, '\n').trim();
  if (!cleaned || maxLines <= 0) return [];
  const paragraphs = cleaned.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const lines: string[] = [];
  let truncated = false;

  for (let pIndex = 0; pIndex < paragraphs.length; pIndex++) {
    const words = paragraphs[pIndex].split(/\s+/);
    let current = '';

    for (let wIndex = 0; wIndex < words.length; wIndex++) {
      const word = words[wIndex];
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
        continue;
      }
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word);
        current = '';
      }
      if (lines.length === maxLines) {
        truncated = wIndex < words.length - 1 || current.length > 0 || pIndex < paragraphs.length - 1;
        break;
      }
    }

    if (lines.length >= maxLines) break;
    if (current) {
      lines.push(current);
      if (lines.length === maxLines && pIndex < paragraphs.length - 1) truncated = true;
    }
    if (lines.length >= maxLines) break;
  }

  if (truncated && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function drawStarPolygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawVectorStars(ctx: CanvasRenderingContext2D, x: number, y: number, rating: number, palette: ShareCardPalette): number {
  const size = 24;
  const gap = 6;
  const outer = 11;
  const inner = 4.8;
  for (let i = 0; i < 5; i++) {
    const cx = x + i * (size + gap) + outer;
    const cy = y;
    drawStarPolygon(ctx, cx, cy, outer, inner);
    ctx.fillStyle = palette.border;
    ctx.fill();

    const fill = Math.max(0, Math.min(1, rating - i));
    if (fill > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - outer, cy - outer, outer * 2 * fill, outer * 2);
      ctx.clip();
      drawStarPolygon(ctx, cx, cy, outer, inner);
      ctx.fillStyle = palette.gold;
      ctx.fill();
      ctx.restore();
    }
  }
  return x + 5 * (size + gap);
}

/** Loads a cover URL with CORS enabled; falls back to null so canvas export never taints. */
export function loadCardImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => done(null), 3000);
    img.crossOrigin = 'anonymous';
    img.onload = () => done(img.naturalWidth > 0 ? img : null);
    img.onerror = () => done(null);
    img.src = url;
  });
}

/** Renders a clean 1200x630 shareable game card onto a Canvas element locally. */
export function drawShareCard(
  canvas: HTMLCanvasElement,
  game: Game,
  options: ShareCardOptions,
  coverImg?: HTMLImageElement | null,
  palette: ShareCardPalette = readCardPalette()
): void {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const FONT = '"Inter Variable", "Segoe UI", system-ui, sans-serif';
  const DISPLAY = '"Outfit Variable", "Inter Variable", "Segoe UI", sans-serif';

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, W, 5);

  roundedRectPath(ctx, 28, 28, W - 56, H - 56, 18);
  ctx.fillStyle = palette.panel;
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const coverX = 64;
  const coverY = 68;
  const coverW = 300;
  const coverH = 450;

  ctx.save();
  roundedRectPath(ctx, coverX, coverY, coverW, coverH, 14);
  ctx.clip();
  ctx.fillStyle = palette.bg;
  ctx.fillRect(coverX, coverY, coverW, coverH);
  if (coverImg && coverImg.naturalWidth > 0 && coverImg.naturalHeight > 0) {
    const scale = Math.max(coverW / coverImg.naturalWidth, coverH / coverImg.naturalHeight);
    const dw = coverImg.naturalWidth * scale;
    const dh = coverImg.naturalHeight * scale;
    ctx.drawImage(coverImg, coverX + (coverW - dw) / 2, coverY + (coverH - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = palette.textSoft;
    ctx.font = `700 22px ${DISPLAY}`;
    const placeholderLines = wrapCardText(ctx, game.title, coverW - 44, 4);
    const startY = coverY + coverH / 2 - ((placeholderLines.length - 1) * 30) / 2;
    ctx.textAlign = 'center';
    placeholderLines.forEach((line, idx) => ctx.fillText(line, coverX + coverW / 2, startY + idx * 30));
    ctx.textAlign = 'left';
  }
  ctx.restore();

  roundedRectPath(ctx, coverX, coverY, coverW, coverH, 14);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const rightX = coverX + coverW + 44;
  const rightW = W - 64 - rightX;
  let y = 84;

  const metaParts: string[] = [];
  if (game.log?.status) metaParts.push(STATUS_LABELS[game.log.status]);
  metaParts.push(game.manualPlatform ?? PLATFORM_FULL[game.platform]);
  const dateStr = game.log?.finishedOn ?? game.log?.startedOn;
  if (dateStr) metaParts.push(formatDay(dateStr));

  let pillX = rightX;
  if (game.log?.status) {
    const label = STATUS_LABELS[game.log.status];
    ctx.font = `600 14px ${FONT}`;
    const pw = Math.ceil(ctx.measureText(label).width) + 24;
    roundedRectPath(ctx, pillX, y - 16, pw, 28, 14);
    ctx.fillStyle = 'rgba(74, 128, 255, 0.16)';
    ctx.fill();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = palette.accentSoft;
    ctx.fillText(label, pillX + 12, y + 3);
    pillX += pw + 12;
  }

  const secondaryMeta = metaParts.slice(game.log?.status ? 1 : 0).join('  ·  ');
  if (secondaryMeta) {
    ctx.fillStyle = palette.textMuted;
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText(truncateLine(ctx, secondaryMeta, W - 64 - pillX), pillX, y + 3);
  }

  y += 52;
  ctx.fillStyle = palette.textMain;
  ctx.font = `700 40px ${DISPLAY}`;
  const titleLines = wrapCardText(ctx, game.title, rightW, 2);
  for (const line of titleLines) {
    ctx.fillText(line, rightX, y);
    y += 46;
  }

  const hasRating = typeof game.log?.rating === 'number' && game.log.rating > 0;
  const hasPlaytime = options.includePlaytime && (game.totalPlaytimeSeconds ?? 0) >= 60;
  if (hasRating || hasPlaytime) {
    y += 6;
    let rowX = rightX;
    if (hasRating) {
      const rating = game.log!.rating!;
      rowX = drawVectorStars(ctx, rowX, y - 6, rating, palette);
      const ratingText = `${String(rating).replace('.', ',')}/5 · ${RATING_LABELS[Math.ceil(rating)] ?? ''}`;
      ctx.fillStyle = palette.gold;
      ctx.font = `600 17px ${FONT}`;
      ctx.fillText(ratingText, rowX + 8, y);
      rowX += ctx.measureText(ratingText).width + 26;
    }
    if (hasPlaytime) {
      const timeLabel = formatPlaytimeShort(game.totalPlaytimeSeconds);
      ctx.fillStyle = palette.textSoft;
      ctx.font = `500 17px ${FONT}`;
      ctx.fillText(hasRating ? `·  ${timeLabel}` : timeLabel, rowX, y);
    }
    y += 28;
  }

  const review = options.includeReview ? game.log?.review?.trim() : '';
  if (review) {
    y += 16;
    const boxH = Math.max(120, 520 - y);
    roundedRectPath(ctx, rightX, y, rightW, boxH, 12);
    ctx.fillStyle = palette.bg;
    ctx.fill();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `400 20px ${FONT}`;
    const maxLines = Math.max(2, Math.floor((boxH - 36) / 30));
    const reviewLines = wrapCardText(ctx, review, rightW - 44, maxLines);
    ctx.fillStyle = palette.textSoft;
    let ry = y + 36;
    for (const line of reviewLines) {
      ctx.fillText(line, rightX + 22, ry);
      ry += 30;
    }
  }

  const footerY = H - 56;
  ctx.fillStyle = palette.accentSoft;
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('LAZULIUM', rightX, footerY);

  if (options.playerName) {
    ctx.fillStyle = palette.textMuted;
    ctx.font = `500 14px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(truncateLine(ctx, options.playerName, 360), W - 64, footerY);
    ctx.textAlign = 'left';
  }
}
