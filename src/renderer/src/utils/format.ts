// Formatos de tempo e data usados na biblioteca e na página do jogo (antes repetidos em cada componente)

const decimal = (value: number) => value.toFixed(1).replace('.', ',');

// "Nunca jogado", "40 min", "37,9 h". Com data de última sessão e sem horas (a Epic informa só a data): "Sem horas"
export function formatPlaytimeShort(seconds: number | undefined, lastPlayedAt?: string): string {
  if (!seconds || seconds < 60) return lastPlayedAt ? 'Sem horas' : 'Nunca jogado';
  const hours = seconds / 3600;
  return hours < 1 ? `${Math.round(seconds / 60)} min` : `${decimal(hours)} h`;
}

// "Nunca jogado", "40 minutos", "37,9 horas"
export function formatPlaytimeLong(seconds: number | undefined, lastPlayedAt?: string): string {
  if (!seconds || seconds < 60) return lastPlayedAt ? 'Sem horas registradas' : 'Nunca jogado';
  const hours = seconds / 3600;
  return hours < 1 ? `${Math.round(seconds / 60)} minutos` : `${decimal(hours)} horas`;
}

// "Hoje", "Ontem", "3 de nov.", "3 de nov. de 2024"
export function formatLastPlayed(iso?: string): string {
  if (!iso) return 'Nunca';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return 'Nunca';
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.ceil((startOfToday.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
}

// Cronômetro da sessão: "04:12" ou "1:04:12"
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
