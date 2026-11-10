// Textos de horas, datas e plataformas usados no Diário, nas Listas e no Perfil
export { PLATFORM_GROUP as PLATFORM_LABEL } from '../../utils/platform';

// "12,5 h", "1.047 h" ou "40 min". Com `empty`, menos de um minuto vira esse texto.
export function formatHours(seconds = 0, empty?: string): string {
  if (seconds < 60 && empty !== undefined) return empty;
  const h = seconds / 3600;
  if (seconds > 0 && h < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  return h >= 100 ? `${Math.round(h).toLocaleString('pt-BR')} h` : `${h.toFixed(1).replace('.', ',')} h`;
}

export const formatNumber = (n: number) => n.toLocaleString('pt-BR');

export const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

// Datas do registro (AAAA-MM-DD) ao meio-dia: o fuso nunca troca o dia
export const dayDate = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00`);

export const formatDay = (day: string, style: 'short' | 'long' = 'short') =>
  style === 'short' ? dayDate(day).toLocaleDateString('pt-BR') : dayDate(day).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');

export const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '') : '');

export const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const todayDay = () => localDay(new Date());

// "hoje", "ontem", "há 3 dias" ou a data
export function relativeDay(iso?: string): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return shortDate(iso);
}

export const percent = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;
