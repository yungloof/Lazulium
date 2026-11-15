// Quando perguntar o quê ao servidor: chamadas, amigos e avisos têm ritmos próprios, mas vão num pedido só.
// Sem Electron nem banco, para dar para testar.

export const POLL_PARTS = ['calls', 'friends', 'notifications'] as const;
export type PollPart = (typeof POLL_PARTS)[number];
export type PollDue = Record<PollPart, number>;

// Parte que venceria até este tempo depois vai junto no pedido de agora (um pedido a menos)
export const PIGGYBACK_MS = 30_000;
// Nunca pergunta mais de uma vez nesse intervalo, mesmo com várias partes adiantadas seguidas
export const MIN_GAP_MS = 1_000;

// Chamadas vão em todo pedido que sair: não custa pedido a mais e a chamada chega antes
export function partsDue(due: PollDue, now: number): PollPart[] {
  const parts = POLL_PARTS.filter((part) => due[part] <= now + PIGGYBACK_MS);
  if (!parts.some((part) => due[part] <= now)) return [];
  return parts.includes('calls') ? parts : ['calls', ...parts];
}

export function nextTickIn(due: PollDue, now: number): number {
  return Math.max(MIN_GAP_MS, Math.min(...POLL_PARTS.map((part) => due[part])) - now);
}

// Pede para uma parte vir até `ms` daqui (ex.: amigo ficou on-line, acabou de chamar alguém)
export function bringForward(due: PollDue, part: PollPart, now: number, ms: number): PollDue {
  return { ...due, [part]: Math.min(due[part], now + ms) };
}
