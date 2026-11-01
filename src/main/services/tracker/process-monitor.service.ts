import { parse } from 'path';
import { ProcessInfo, processSnapshot } from './process-snapshot';

const POLL_INTERVAL_MS = 4_000;
// Polls consecutivos sem processo antes de encerrar a sessão (~12s). Cobre
// launchers que fecham e reabrem o executável real do jogo.
const MISS_LIMIT = 3;

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
  alivePids: Set<number>;
  firstSeenAt?: number;
  lastSeenAt?: number;
  misses: number;
  firstMissAt?: number;
  rootGone?: boolean;
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

export class ProcessMonitor {
  private watches = new Map<string, WatchState>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private callbacks: MonitorCallbacks) {}

  watch(target: WatchTarget): void {
    const dirs = target.matchDirs.map(normalizeDir).filter((d): d is string => d !== null);
    this.watches.set(target.id, { target, dirs, alivePids: new Set(), misses: 0 });
    this.schedule(target.rootPid ? 500 : POLL_INTERVAL_MS);
  }

  unwatch(id: string): void {
    this.watches.delete(id);
  }

  getAlivePids(id: string): number[] {
    return [...(this.watches.get(id)?.alivePids ?? [])];
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

  private async tick(): Promise<void> {
    this.timer = null;
    if (this.watches.size === 0) {
      processSnapshot.stop();
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

    if (this.watches.size > 0) this.schedule(POLL_INTERVAL_MS);
    else processSnapshot.stop();
  }

  private evaluate(list: ProcessInfo[], now: number): void {
    const childrenOf = new Map<number, number[]>();
    for (const p of list) {
      const siblings = childrenOf.get(p.ppid);
      if (siblings) siblings.push(p.pid);
      else childrenOf.set(p.ppid, [p.pid]);
    }
    const alive = new Set(list.map((p) => p.pid));
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
      for (const pid of state.alivePids) {
        if (alive.has(pid) && !owner.has(pid)) {
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
      state.alivePids = matched;

      if (matched.size > 0) {
        state.misses = 0;
        state.firstMissAt = undefined;
        state.lastSeenAt = now;
        if (state.firstSeenAt === undefined) {
          state.firstSeenAt = estimateStart(state.target, matched, list, now);
          this.callbacks.onDetected(id, [...matched][0], state.firstSeenAt);
        } else {
          this.callbacks.onHeartbeat(id, now);
        }
        continue;
      }

      if (state.firstSeenAt !== undefined) {
        state.firstMissAt ??= now;
        if (++state.misses >= MISS_LIMIT) {
          this.watches.delete(id);
          // O processo morreu entre o último poll que o viu e o primeiro que não viu:
          // o ponto médio elimina o viés de subcontagem (erro máx. ±POLL_INTERVAL/2)
          const lastSeen = state.lastSeenAt ?? state.firstSeenAt;
          const endedAt = Math.round((lastSeen + state.firstMissAt) / 2);
          this.callbacks.onEnded(id, state.firstSeenAt, Math.max(state.firstSeenAt, endedAt));
        }
      } else if (now - state.target.launchedAt > state.target.startTimeoutMs) {
        this.watches.delete(id);
        this.callbacks.onNotDetected(id);
      }
    }
  }
}
