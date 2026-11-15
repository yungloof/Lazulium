import { YearReview } from '@shared/types/profile';

export const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
];

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type YearReviewSlideId = 'overview' | 'rhythm' | 'games' | 'finished' | 'rarest' | 'card';

export interface YearReviewSlide {
  id: YearReviewSlideId;
  label: string;
  title: string;
}

/**
 * Formats tracked seconds into compact Portuguese hours/minutes for the review screens and summary card.
 */
export function formatReviewDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min';
  const hours = seconds / 3600;
  if (hours >= 10) return `${Math.round(hours).toLocaleString('pt-BR')} h`;
  if (hours >= 1) return `${hours.toFixed(1).replace('.', ',')} h`;
  return `${Math.max(1, Math.round(seconds / 60)).toLocaleString('pt-BR')} min`;
}

/**
 * Indicates whether the selected year has any recorded local activity to highlight in the story.
 */
export function hasYearReviewActivity(review: YearReview): boolean {
  return (
    review.achievementsUnlocked > 0 ||
    review.gamesPlayed > 0 ||
    review.finishedGames.length > 0 ||
    review.screenshots > 0 ||
    review.trackedSeconds > 0
  );
}

/**
 * Builds the ordered list of sequential story slides, skipping empty middle chapters.
 */
export function buildYearReviewSlides(review: YearReview): YearReviewSlide[] {
  const slides: YearReviewSlide[] = [{ id: 'overview', label: 'Resumo', title: 'O seu ano em números' }];

  const hasMonthly = (review.monthlyAchievements ?? []).some((n) => n > 0);
  if (hasMonthly || review.bestMonth || review.trackedSeconds >= 60) {
    slides.push({ id: 'rhythm', label: 'Ritmo', title: 'Quando você mais jogou' });
  }

  if (review.topGames.length > 0 || (review.topPlayedGames?.length ?? 0) > 0) {
    slides.push({ id: 'games', label: 'Destaques', title: 'Jogos que marcaram o ano' });
  }

  if (review.finishedGames.length > 0) {
    slides.push({ id: 'finished', label: 'Zerados', title: 'Histórias concluídas' });
  }

  if (review.rarestAchievement) {
    slides.push({ id: 'rarest', label: 'Mais rara', title: 'O feito mais difícil do ano' });
  }

  slides.push({ id: 'card', label: 'Cartão', title: 'Imagem para guardar no PC' });
  return slides;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) {
    end--;
  }
  return `${text.slice(0, end)}…`;
}

/**
 * Renders a 1200x675 local summary image directly onto a canvas with zero external requests.
 */
export function drawYearReviewCard(canvas: HTMLCanvasElement, review: YearReview): void {
  const W = 1200;
  const H = 675;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

  // Fundo escuro limpo e sóbrio (sem gradientes artificiais)
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, W, H);

  // Linha superior de destaque azul do Lazulium
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 0, W, 5);

  // Moldura externa sutil
  drawRoundedRect(ctx, 24, 24, W - 48, H - 48, 16);
  ctx.fillStyle = '#11131a';
  ctx.fill();
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cabeçalho
  ctx.fillStyle = '#818cf8';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText('LAZULIUM  ·  RETROSPECTIVA ANUAL', 56, 66);

  ctx.fillStyle = '#f4f4f5';
  ctx.font = `700 38px ${FONT}`;
  const heading = review.playerName
    ? `${review.year} de ${review.playerName}`
    : `Retrospectiva ${review.year}`;
  ctx.fillText(truncateText(ctx, heading, 780), 56, 108);

  // Etiqueta local à direita
  const badgeText = 'Gerado no seu PC';
  ctx.font = `600 13px ${FONT}`;
  const badgeW = Math.ceil(ctx.measureText(badgeText).width) + 28;
  drawRoundedRect(ctx, W - 56 - badgeW, 56, badgeW, 32, 16);
  ctx.fillStyle = 'rgba(79, 70, 229, 0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(129, 140, 248, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#c7d2fe';
  ctx.fillText(badgeText, W - 56 - badgeW + 14, 77);

  // 4 cartões de números do ano
  const kpis = [
    { label: 'Conquistas', value: review.achievementsUnlocked.toLocaleString('pt-BR'), accent: true },
    { label: 'Jogos zerados', value: review.finishedGames.length.toLocaleString('pt-BR') },
    { label: 'Jogados no ano', value: review.gamesPlayed.toLocaleString('pt-BR') },
    {
      label: review.trackedSeconds >= 3600 ? 'Sessões no Lazulium' : 'Capturas de tela',
      value: review.trackedSeconds >= 3600 ? formatReviewDuration(review.trackedSeconds) : review.screenshots.toLocaleString('pt-BR')
    }
  ];

  const cardY = 138;
  const cardH = 108;
  const gap = 16;
  const cardW = (W - 112 - gap * 3) / 4;

  kpis.forEach((item, idx) => {
    const x = 56 + idx * (cardW + gap);
    drawRoundedRect(ctx, x, cardY, cardW, cardH, 12);
    ctx.fillStyle = item.accent ? 'rgba(79, 70, 229, 0.14)' : '#181a24';
    ctx.fill();
    ctx.strokeStyle = item.accent ? 'rgba(99, 102, 241, 0.55)' : '#27272a';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = item.accent ? '#a5b4fc' : '#f4f4f5';
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(truncateText(ctx, item.value, cardW - 36), x + 20, cardY + 52);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText(item.label, x + 20, cardY + 82);
  });

  // Painel esquerdo: ritmo mensal + conquista mais rara
  const colY = 268;
  const colH = 330;
  const leftW = 532;
  drawRoundedRect(ctx, 56, colY, leftW, colH, 12);
  ctx.fillStyle = '#181a24';
  ctx.fill();
  ctx.strokeStyle = '#27272a';
  ctx.stroke();

  ctx.fillStyle = '#a1a1aa';
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText('RITMO POR MÊS', 78, colY + 32);

  if (review.bestMonth) {
    ctx.fillStyle = '#f4f4f5';
    ctx.font = `600 18px ${FONT}`;
    const bestMonthLabel = MONTH_NAMES[review.bestMonth.month];
    ctx.fillText(
      `Pico em ${bestMonthLabel} (${review.bestMonth.achievements.toLocaleString('pt-BR')} conquistas)`,
      78,
      colY + 60
    );
  } else if (review.trackedSeconds >= 60) {
    ctx.fillStyle = '#f4f4f5';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(`Tempo em sessões: ${formatReviewDuration(review.trackedSeconds)}`, 78, colY + 60);
  } else {
    ctx.fillStyle = '#71717a';
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText('Sem conquistas com data neste ano', 78, colY + 60);
  }

  // Barras dos 12 meses
  const months = review.monthlyAchievements ?? new Array<number>(12).fill(0);
  const maxMonth = Math.max(1, ...months);
  const chartX = 78;
  const chartW = leftW - 44;
  const barStep = chartW / 12;
  const barW = Math.floor(barStep - 8);
  const baseLineY = colY + 186;
  const maxBarH = 98;

  months.forEach((count, i) => {
    const bx = Math.round(chartX + i * barStep + 4);
    const barH = count > 0 ? Math.max(8, Math.round((count / maxMonth) * maxBarH)) : 4;
    const isPeak = review.bestMonth?.month === i && count > 0;
    drawRoundedRect(ctx, bx, baseLineY - barH, barW, barH, 4);
    ctx.fillStyle = isPeak ? '#818cf8' : count > 0 ? '#4f46e5' : '#27272a';
    ctx.fill();

    ctx.fillStyle = isPeak ? '#e0e7ff' : '#71717a';
    ctx.font = `500 11px ${FONT}`;
    ctx.fillText(MONTH_SHORT[i], bx + 2, baseLineY + 18);
  });

  // Caixa da conquista mais rara dentro da coluna esquerda
  if (review.rarestAchievement) {
    const r = review.rarestAchievement;
    drawRoundedRect(ctx, 78, colY + 224, leftW - 44, 84, 10);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.stroke();

    ctx.fillStyle = '#fcd34d';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(
      `CONQUISTA MAIS RARA · ${r.globalPercent.toFixed(1).replace('.', ',')}% DOS JOGADORES`,
      96,
      colY + 250
    );

    ctx.fillStyle = '#f4f4f5';
    ctx.font = `600 17px ${FONT}`;
    ctx.fillText(truncateText(ctx, r.name, leftW - 84), 96, colY + 275);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText(truncateText(ctx, r.gameTitle, leftW - 84), 96, colY + 296);
  } else {
    drawRoundedRect(ctx, 78, colY + 224, leftW - 44, 84, 10);
    ctx.fillStyle = '#13151d';
    ctx.fill();
    ctx.strokeStyle = '#27272a';
    ctx.stroke();

    ctx.fillStyle = '#a1a1aa';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('CAPTURAS DE TELA', 96, colY + 254);

    ctx.fillStyle = '#f4f4f5';
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText(
      `${review.screenshots.toLocaleString('pt-BR')} lembrança${review.screenshots === 1 ? '' : 's'} guardada${review.screenshots === 1 ? '' : 's'}`,
      96,
      colY + 286
    );
  }

  // Painel direito: destaques por conquistas, horas ou zerados
  const rightX = 612;
  const rightW = W - rightX - 56;
  drawRoundedRect(ctx, rightX, colY, rightW, colH, 12);
  ctx.fillStyle = '#181a24';
  ctx.fill();
  ctx.strokeStyle = '#27272a';
  ctx.stroke();

  const highlightRows: { title: string; detail: string }[] =
    review.topGames.length > 0
      ? review.topGames.slice(0, 5).map((g) => ({
          title: g.title,
          detail: `${g.achievements ?? 0} conquistas`
        }))
      : (review.topPlayedGames ?? []).length > 0
        ? (review.topPlayedGames ?? []).slice(0, 5).map((g) => ({
            title: g.title,
            detail: formatReviewDuration(g.seconds)
          }))
        : review.finishedGames.slice(0, 5).map((g) => ({
            title: g.title,
            detail: g.rating ? `Nota ${String(g.rating).replace('.', ',')}/5` : 'Zerado'
          }));

  const rightTitle =
    review.topGames.length > 0
      ? 'MAIS CONQUISTAS NO ANO'
      : (review.topPlayedGames ?? []).length > 0
        ? 'MAIS TEMPO DE JOGO'
        : 'ZERADOS NO ANO';

  ctx.fillStyle = '#a1a1aa';
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(rightTitle, rightX + 22, colY + 32);

  if (highlightRows.length === 0) {
    ctx.fillStyle = '#71717a';
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText('Ainda sem jogos em destaque para este ano.', rightX + 22, colY + 80);
  } else {
    highlightRows.forEach((row, index) => {
      const ry = colY + 62 + index * 52;
      drawRoundedRect(ctx, rightX + 20, ry, rightW - 40, 42, 8);
      ctx.fillStyle = index === 0 ? 'rgba(79, 70, 229, 0.14)' : '#12141c';
      ctx.fill();

      ctx.fillStyle = index === 0 ? '#a5b4fc' : '#71717a';
      ctx.font = `700 15px ${FONT}`;
      ctx.fillText(`${index + 1}`, rightX + 36, ry + 26);

      ctx.font = `600 13px ${FONT}`;
      const detailW = ctx.measureText(row.detail).width;
      ctx.fillStyle = '#c7d2fe';
      ctx.fillText(row.detail, rightX + rightW - 36 - detailW, ry + 26);

      ctx.fillStyle = '#f4f4f5';
      ctx.font = `600 15px ${FONT}`;
      ctx.fillText(truncateText(ctx, row.title, rightW - detailW - 104), rightX + 64, ry + 26);
    });
  }

  // Rodapé do cartão
  ctx.fillStyle = '#71717a';
  ctx.font = `500 12px ${FONT}`;
  ctx.fillText('Dados locais da sua biblioteca · Nenhum envio para servidores', 56, H - 40);

  const footerBrand = `lazulium · ${review.year}`;
  const brandW = ctx.measureText(footerBrand).width;
  ctx.fillText(footerBrand, W - 56 - brandW, H - 40);
}
