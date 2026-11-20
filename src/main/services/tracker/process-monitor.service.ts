import { parse } from 'path';
import { ProcessInfo, processSnapshot } from './process-snapshot';

// Olhada normal com o jogo aberto
export const POLL_INTERVAL_MS = 3_000;
// Esperando o jogo aparecer: olha mais vezes para o "Jogando agora" aparecer logo
export const LAUNCH_POLL_MS = 2_000;
// Uma olhada não achou o jogo: confere de novo logo em seguida
export const CONFIRM_POLL_MS = 1_500;
// Tempo sem nenhum processo do jogo para dar a sessão por encerrada
export const END_GRACE_MS = 5_000;
// Nos primeiros minutos o launcher pode fechar antes do jogo abrir (launcher -> jogo, anticheat): espera mais
export const HANDOFF_WINDOW_MS = 2 * 60_000;
export const HANDOFF_GRACE_MS = 15_000;
// Olhadas seguidas sem o jogo exigidas além do tempo (uma consulta lenta sozinha não encerra)
const MIN_MISSES = 2;
// Relatório de erro do Windows: o processo que tem um destes como filho travou e só espera o relatório terminar
const CRASH_REPORTERS = new Set(['werfault.exe', 'werfaultsecure.exe']);

export interface WatchTarget {
  id: string;
  rootPid?: number;                 // Processo iniciado diretamente por nós
  matchDirs: string[];              // Qualquer executável dentro destas pastas conta como "o jogo"
  startTimeoutMs: number;           // Tempo máximo esperando o processo aparecer
  launchedAt: number;
}

export interface MonitorCallbacks {
  onDetected: (id: string, pid: number, firstSeenAt: number) => void;
  onHeartbeat: (id: string, lastSeenAt: number) => void;
  onEnded: (id: string, firstSeenAt: number, lastSeenAt: number) => void;
  onNotDetected: (id: string) => void;
}

interface WatchState {
  target: WatchTarget;
  dirs: string[];                   // Normalizadas: minúsculas + barra final
  alive: Map<number, number | undefined>; // PID -> criação, dos processos ligados ao jogo
  firstSeenAt?: number;
  lastSeenAt?: number;
  misses: number;
  firstMissAt?: number;
  rootGone?: boolean;
}

// Quanto tempo sem o jogo encerra a sessão: mais no começo (troca do launcher pelo jogo), pouco depois
export function endGraceMs(firstSeenAt: number, firstMissAt: number): number {
  return firstMissAt - firstSeenAt < HANDOFF_WINDOW_MS ? HANDOFF_GRACE_MS : END_GRACE_MS;
}

// Início real da sessão: com spawn, o momento do lançamento; com URI, o
// CreationDate mais antigo entre os processos do jogo (não o momento do poll).
function estimateStart(target: WatchTarget, matched: Set<number>, list: ProcessInfo[], now: number): number {
  if (target.rootPid !== undefined) return target.launchedAt;
  const created = list
    .filter((p) => matched.has(p.pid) && p.createdAt && p.createdAt >= target.launchedAt - 5_000)
    .map((p) => p.createdAt!);
  return created.length ? Math.min(now, ...created) : now;
}

function normalizeDir(dir: string): string | null {
  const trimmed = dir.trim().replace(/[\\/]+$/, '');
  if (!trimmed) return null;
  // Nunca vigiar a raiz de um disco: casaria com qualquer processo
  if (parse(trimmed + '\\').root.toLowerCase() === (trimmed + '\\').toLowerCase()) return null;
  return trimmed.toLowerCase() + '\\';
}

const exeName = (path: string | undefined): string => (path ? (path.split(/[\\/]/).pop() ?? '').toLowerCase() : '');

export class ProcessMonitor {
  private watches = new Map<string, WatchState>();
  // Processos que o jogador mandou parar, ou que sobraram de uma sessão encerrada (jogo travado no
  // relatório de erro): não voltam a contar como jogo enquanto o mesmo processo existir
  private released = new Map<number, number | undefined>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private callbacks: MonitorCallbacks) {}

  watch(target: WatchTarget): void {
    const dirs = target.matchDirs.map(normalizeDir).filter((d): d is string => d !== null);
    this.watches.set(target.id, { target, dirs, alive: new Map(), misses: 0 });
    this.schedule(target.rootPid ? 500 : LAUNCH_POLL_MS);
  }

  unwatch(id: string): void {
    this.watches.delete(id);
  }

  // Para de acompanhar na hora e devolve os processos que estavam ligados ao jogo (para encerrá-los)
  release(id: string): number[] {
    const state = this.watches.get(id);
    if (!state) return [];
    this.watches.delete(id);
    for (const [pid, createdAt] of state.alive) this.released.set(pid, createdAt);
    return [...state.alive.keys()];
  }

  // Lista sem os processos liberados (a procura de jogos abertos por fora não os adota de novo)
  withoutReleased(list: ProcessInfo[]): ProcessInfo[] {
    if (this.released.size === 0) return list;
    const current = new Map(list.map((p) => [p.pid, p.createdAt]));
    for (const [pid, createdAt] of this.released) {
      // Processo que fechou (ou PID reaproveitado por outro programa) sai da lista
      if (!current.has(pid) || current.get(pid) !== createdAt) this.released.delete(pid);
    }
    return list.filter((p) => !this.released.has(p.pid));
  }

  getAlivePids(id: string): number[] {
    return [...(this.watches.get(id)?.alive.keys() ?? [])];
  }

  hasWatches(): boolean {
    return this.watches.size > 0;
  }

  isWatching(id: string): boolean {
    return this.watches.has(id);
  }

  stopAll(): void {
    this.watches.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    processSnapshot.stop();
  }

  private schedule(delay: number): void {
    if (this.ticking) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  // Próxima olhada: rápida para confirmar um fechamento ou achar o jogo que está abrindo
  private nextDelay(): number {
    const states = [...this.watches.values()];
    if (states.some((s) => s.misses > 0)) return CONFIRM_POLL_MS;
    if (states.some((s) => s.firstSeenAt === undefined)) return LAUNCH_POLL_MS;
    return POLL_INTERVAL_MS;
  }

  private async tick(): Promise<void> {
    this.timer = null;
    if (this.watches.size === 0) {
      processSnapshot.stopWhenIdle();
      return;
    }

    this.ticking = true;
    try {
      const list = await processSnapshot.query();
      this.evaluate(list, Date.now());
    } catch (err) {
      // Falha pontual na listagem não conta como "jogo fechado"
      console.warn('[ProcessMonitor] Falha no polling:', (err as Error).message);
    } finally {
      this.ticking = false;
    }

    if (this.watches.size > 0) this.schedule(this.nextDelay());
    else processSnapshot.stopWhenIdle();
  }

  // Uma olhada na lista de processos (público para os testes)
  evaluate(fullList: ProcessInfo[], now: number): void {
    const list = this.withoutReleased(fullList);
    const childrenOf = new Map<number, number[]>();
    for (const p of list) {
      const siblings = childrenOf.get(p.ppid);
      if (siblings) siblings.push(p.pid);
      else childrenOf.set(p.ppid, [p.pid]);
    }
    const alive = new Map(list.map((p) => [p.pid, p.createdAt]));
    // Processo com relatório de erro aberto já travou: ele e o relatório não contam como jogo aberto
    const reporters = list.filter((p) => CRASH_REPORTERS.has(exeName(p.path)));
    const crashed = new Set([...reporters.map((p) => p.ppid), ...reporters.map((p) => p.pid)]);
    // Cada processo pertence a no máximo um jogo (ex: vários .bat na mesma pasta)
    const owner = new Map<number, string>();

    const claimTree = (id: string, matched: Set<number>, seeds: number[]) => {
      const queue = [...seeds];
      while (queue.length) {
        for (const child of childrenOf.get(queue.pop()!) ?? []) {
          if (matched.has(child) || owner.has(child)) continue;
          matched.add(child);
          owner.set(child, id);
          queue.push(child);
        }
      }
    };

    const matchedById = new Map<string, Set<number>>();

    // 1ª passada (vínculo forte): processos já vinculados, PID raiz e seus filhos.
    // Subprocessos cobrem .bat -> jogo e launcher -> jogo. Morto, o PID raiz ainda
    // serve de origem por um poll (o filho mantém o PPID original); depois é
    // descartado para não casar com um PID reaproveitado pelo Windows.
    for (const [id, state] of this.watches) {
      const matched = new Set<number>();
      for (const [pid, createdAt] of state.alive) {
        // Mesmo PID com outra data de criação é outro programa (o Windows reaproveita PIDs)
        if (alive.has(pid) && alive.get(pid) === createdAt && !owner.has(pid)) {
          matched.add(pid);
          owner.set(pid, id);
        }
      }

      const rootPid = state.target.rootPid;
      const rootAlive = rootPid !== undefined && !state.rootGone && alive.has(rootPid);
      if (rootAlive && !owner.has(rootPid!)) {
        matched.add(rootPid!);
        owner.set(rootPid!, id);
      }
      const seeds = [...matched];
      if (rootPid !== undefined && !rootAlive && !state.rootGone) {
        seeds.push(rootPid);
        state.rootGone = true;
      }
      claimTree(id, matched, seeds);
      matchedById.set(id, matched);
    }

    // 2ª passada (vínculo fraco): executáveis dentro da pasta do jogo ainda sem dono.
    // Em lançamentos via spawn, só valem processos criados após o lançamento.
    for (const [id, state] of this.watches) {
      if (state.dirs.length === 0) continue;
      const matched = matchedById.get(id)!;
      const minCreated = state.target.rootPid !== undefined ? state.target.launchedAt - 2_000 : 0;
      const seeds: number[] = [];
      for (const p of list) {
        if (owner.has(p.pid) || !p.path) continue;
        if (minCreated && (p.createdAt ?? 0) < minCreated) continue;
        const exe = p.path.toLowerCase();
        if (!state.dirs.some((d) => exe.startsWith(d))) continue;
        matched.add(p.pid);
        owner.set(p.pid, id);
        seeds.push(p.pid);
      }
      claimTree(id, matched, seeds);
    }

    for (const [id, state] of [...this.watches]) {
      const matched = matchedById.get(id)!;
      state.alive = new Map([...matched].map((pid) => [pid, alive.get(pid)]));
      const running = [...matched].filter((pid) => !crashed.has(pid));

      if (running.length > 0) {
        state.misses = 0;
        state.firstMissAt = undefined;
        state.lastSeenAt = now;
        if (state.firstSeenAt === undefined) {
          state.firstSeenAt = estimateStart(state.target, new Set(running), list, now);
          this.callbacks.onDetected(id, running[0], state.firstSeenAt);
        } else {
          this.callbacks.onHeartbeat(id, now);
        }
        continue;
      }

      if (state.firstSeenAt !== undefined) {
        state.firstMissAt ??= now;
        state.misses++;
        if (state.misses >= MIN_MISSES && now - state.firstMissAt >= endGraceMs(state.firstSeenAt, state.firstMissAt)) {
          // O que sobrou (jogo travado esperando o relatório de erro) não é adotado de novo
          this.release(id);
          // O processo morreu entre o último poll que o viu e o primeiro que não viu:
          // o ponto médio elimina o viés de subcontagem
          const lastSeen = state.lastSeenAt ?? state.firstSeenAt;
          const endedAt = Math.round((lastSeen + state.firstMissAt) / 2);
          this.callbacks.onEnded(id, state.firstSeenAt, Math.max(state.firstSeenAt, endedAt));
        }
      } else if (now - state.target.launchedAt > state.target.startTimeoutMs) {
        this.release(id);
        this.callbacks.onNotDetected(id);
      }
    }
  }
}
