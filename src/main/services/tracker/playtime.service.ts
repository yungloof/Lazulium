import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { dirname } from 'path';
import { Game } from '@shared/types/game';
import { GameLaunchState, GameLaunchStatus } from '@shared/types/ipc';
import { db } from '../../database/db';
import { launchGame } from './launcher.service';
import { ProcessMonitor } from './process-monitor.service';

const MIN_SESSION_SECONDS = 15;
const HEARTBEAT_PERSIST_MS = 60_000;
// Steam/Epic podem precisar atualizar ou sincronizar antes de abrir o jogo
const URI_START_TIMEOUT_MS = 3 * 60_000;
const SPAWN_START_TIMEOUT_MS = 60_000;

type StatusListener = (status: GameLaunchStatus) => void;

interface ActiveGame {
  state: Exclude<GameLaunchState, 'stopped'>;
  startedAt?: number;
  lastPersistAt: number;
}

// Pastas cujos executáveis representam o jogo. Emuladores ficam de fora: a pasta
// do emulador casaria com instâncias abertas manualmente; rastreamos pela árvore de PIDs.
function getMatchDirs(game: Game, spawned: boolean): string[] {
  if (game.platform === 'emulator') return [];
  const dir = game.installPath || game.workingDirectory || (spawned && game.executablePath ? dirname(game.executablePath) : '');
  return dir ? [dir] : [];
}

class PlaytimeService {
  private listener: StatusListener = () => {};
  private active = new Map<string, ActiveGame>();

  private monitor = new ProcessMonitor({
    onDetected: (id, pid, firstSeenAt) => {
      const entry = this.active.get(id);
      if (!entry) return;
      entry.state = 'running';
      entry.startedAt = firstSeenAt;
      entry.lastPersistAt = Date.now();
      db.setActiveSession({ gameId: id, startedAt: firstSeenAt, lastSeenAt: firstSeenAt });
      console.log(`[Playtime] ${id} em execução (PID ${pid})`);
      this.emit({ gameId: id, state: 'running', isRunning: true, pid, startTime: new Date(firstSeenAt).toISOString() });
    },

    onHeartbeat: (id, lastSeenAt) => {
      const entry = this.active.get(id);
      if (!entry?.startedAt || lastSeenAt - entry.lastPersistAt < HEARTBEAT_PERSIST_MS) return;
      entry.lastPersistAt = lastSeenAt;
      db.setActiveSession({ gameId: id, startedAt: entry.startedAt, lastSeenAt });
    },

    onEnded: (id, firstSeenAt, lastSeenAt) => this.finish(id, firstSeenAt, lastSeenAt),

    onNotDetected: (id) => {
      this.active.delete(id);
      console.warn(`[Playtime] ${id}: processo do jogo não detectado`);
      this.emit({
        gameId: id,
        state: 'stopped',
        isRunning: false,
        error: 'O processo do jogo não foi detectado. O tempo desta execução não foi contabilizado.'
      });
    }
  });

  setStatusListener(listener: StatusListener): void {
    this.listener = listener;
  }

  getState(gameId: string): GameLaunchState {
    return this.active.get(gameId)?.state ?? 'stopped';
  }

  async launch(gameId: string): Promise<boolean> {
    const game = db.getGameById(gameId);
    if (!game) return false;
    if (this.active.has(gameId)) return true;

    let handle;
    try {
      handle = await launchGame(game);
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[Playtime] Falha ao lançar ${game.title}:`, message);
      this.emit({ gameId, state: 'stopped', isRunning: false, error: message });
      return false;
    }

    const matchDirs = getMatchDirs(game, handle.method === 'spawn');
    if (handle.pid === undefined && matchDirs.length === 0) {
      this.emit({
        gameId,
        state: 'stopped',
        isRunning: false,
        error: 'Jogo iniciado, mas sem pasta de instalação conhecida para rastrear o tempo.'
      });
      return true;
    }

    this.active.set(gameId, { state: 'launching', lastPersistAt: 0 });
    this.monitor.watch({
      id: gameId,
      rootPid: handle.pid,
      matchDirs,
      launchedAt: handle.launchedAt,
      startTimeoutMs: handle.method === 'uri' ? URI_START_TIMEOUT_MS : SPAWN_START_TIMEOUT_MS
    });
    this.emit({ gameId, state: 'launching', isRunning: false });
    return true;
  }

  // Encerra a árvore de processos detectada; o monitor registra o fim da sessão
  async stop(gameId: string): Promise<boolean> {
    const pids = this.monitor.getAlivePids(gameId);
    if (pids.length === 0) return false;
    await Promise.all(
      pids.map(
        (pid) =>
          new Promise<void>((resolve) =>
            execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve())
          )
      )
    );
    return true;
  }

  // Sessões que ficaram abertas porque o app fechou/travou durante o jogo
  recoverInterruptedSessions(): void {
    for (const record of db.getActiveSessions()) {
      this.record(record.gameId, record.startedAt, record.lastSeenAt);
      console.log(`[Playtime] Sessão interrompida recuperada: ${record.gameId}`);
    }
  }

  // Chamado no encerramento do app: conta o tempo até agora e para o polling
  shutdown(): void {
    const now = Date.now();
    for (const [id, entry] of this.active) {
      if (entry.startedAt !== undefined) this.record(id, entry.startedAt, now);
    }
    this.active.clear();
    this.monitor.stopAll();
  }

  private finish(id: string, startedAt: number, endedAt: number): void {
    this.active.delete(id);
    const { seconds, game } = this.record(id, startedAt, endedAt);
    console.log(`[Playtime] ${id} encerrado após ${seconds}s${seconds < MIN_SESSION_SECONDS ? ' (descartado)' : ''}`);
    this.emit({
      gameId: id,
      state: 'stopped',
      isRunning: false,
      sessionSeconds: seconds >= MIN_SESSION_SECONDS ? seconds : 0,
      game: game ?? undefined
    });
  }

  private record(gameId: string, startedAt: number, endedAt: number): { seconds: number; game: Game | null } {
    db.removeActiveSession(gameId);
    const seconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
    if (seconds < MIN_SESSION_SECONDS) return { seconds, game: db.getGameById(gameId) };

    const game = db.addPlaytimeSession({
      id: randomUUID(),
      gameId,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationSeconds: seconds
    });
    return { seconds, game };
  }

  private emit(status: GameLaunchStatus): void {
    try {
      this.listener(status);
    } catch (err) {
      console.warn('[Playtime] Falha ao notificar status:', err);
    }
  }
}

export const playtimeService = new PlaytimeService();
