import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { dirname } from 'path';
import { powerMonitor } from 'electron';
import { Game } from '@shared/types/game';
import { GameLaunchState, GameLaunchStatus } from '@shared/types/ipc';
import { db } from '../../database/db';
import { launchGame } from './launcher.service';
import { ProcessMonitor } from './process-monitor.service';
import { processSnapshot } from './process-snapshot';

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
  lastPollAt: number;
  idleSeconds: number;               // segundos ausentes acumulados acima do limite
}

// Limite configurado pelo usuário para considerar ausente (em segundos)
function getIdleThresholdSeconds(): number {
  const settings = db.getSettings();
  if (settings.discountIdleTime === 'false') return 0;
  const mins = Number(settings.idleThresholdMinutes ?? '15');
  if (isNaN(mins) || mins <= 0) return 0;
  return mins * 60;
}

// Segundos desde a última atividade: teclado/mouse (Windows) ou controle (XInput).
export function secondsSinceLastInput(systemIdleSeconds: number, lastGamepadInputAt: number, now: number): number {
  if (lastGamepadInputAt <= 0) return systemIdleSeconds;
  return Math.min(systemIdleSeconds, Math.max(0, (now - lastGamepadInputAt) / 1000));
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
      entry.lastPollAt = Date.now();
      entry.idleSeconds = 0;
      db.setActiveSession({ gameId: id, startedAt: firstSeenAt, lastSeenAt: firstSeenAt, idleSeconds: 0 });
      console.log(`[Playtime] ${id} em execução (PID ${pid})`);
      this.emit({ gameId: id, state: 'running', isRunning: true, pid, startTime: new Date(firstSeenAt).toISOString() });
    },

    onHeartbeat: (id, lastSeenAt) => {
      const entry = this.active.get(id);
      if (!entry?.startedAt) return;

      const thresholdSeconds = getIdleThresholdSeconds();
      const now = Date.now();
      const dt = Math.min(Math.max(0, (now - (entry.lastPollAt || now)) / 1000), 10);
      entry.lastPollAt = now;

      // Se passou do limite sem teclado, mouse ou controle, acumula tempo ausente
      if (thresholdSeconds > 0) {
        try {
          const idle = secondsSinceLastInput(powerMonitor.getSystemIdleTime(), processSnapshot.getLastGamepadInputAt(), now);
          if (idle > thresholdSeconds) {
            entry.idleSeconds += dt;
          }
        } catch {
          // powerMonitor pode falhar em ambientes de teste sem display
        }
      }

      if (lastSeenAt - entry.lastPersistAt < HEARTBEAT_PERSIST_MS) return;
      entry.lastPersistAt = lastSeenAt;
      db.setActiveSession({
        gameId: id,
        startedAt: entry.startedAt,
        lastSeenAt,
        idleSeconds: Math.round(entry.idleSeconds)
      });
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

    this.active.set(gameId, { state: 'launching', lastPersistAt: 0, lastPollAt: Date.now(), idleSeconds: 0 });
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
      this.record(record.gameId, record.startedAt, record.lastSeenAt, record.idleSeconds ?? 0);
      console.log(`[Playtime] Sessão interrompida recuperada: ${record.gameId}`);
    }
  }

  // Chamado no encerramento do app: conta o tempo até agora e para o polling
  shutdown(): void {
    const now = Date.now();
    for (const [id, entry] of this.active) {
      if (entry.startedAt !== undefined) {
        this.record(id, entry.startedAt, now, entry.idleSeconds);
      }
    }
    this.active.clear();
    this.monitor.stopAll();
  }

  private finish(id: string, startedAt: number, endedAt: number): void {
    const entry = this.active.get(id);
    const idle = entry?.idleSeconds ?? 0;
    this.active.delete(id);
    const { seconds, idleDiscounted, game } = this.record(id, startedAt, endedAt, idle);
    console.log(
      `[Playtime] ${id} encerrado após ${seconds}s líquidas (${idleDiscounted}s ausente descontados)${
        seconds < MIN_SESSION_SECONDS ? ' (descartado)' : ''
      }`
    );
    this.emit({
      gameId: id,
      state: 'stopped',
      isRunning: false,
      sessionSeconds: seconds >= MIN_SESSION_SECONDS ? seconds : 0,
      idleSeconds: idleDiscounted > 0 ? idleDiscounted : undefined,
      game: game ?? undefined
    });
  }

  private record(
    gameId: string,
    startedAt: number,
    endedAt: number,
    accumulatedIdle: number = 0
  ): { seconds: number; idleDiscounted: number; game: Game | null } {
    db.removeActiveSession(gameId);
    const wallClockSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
    const idleDiscounted = Math.min(wallClockSeconds, Math.round(accumulatedIdle));
    const seconds = Math.max(0, wallClockSeconds - idleDiscounted);

    if (seconds < MIN_SESSION_SECONDS) return { seconds, idleDiscounted, game: db.getGameById(gameId) };

    const game = db.addPlaytimeSession({
      id: randomUUID(),
      gameId,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationSeconds: seconds,
      idleSeconds: idleDiscounted > 0 ? idleDiscounted : undefined
    });
    return { seconds, idleDiscounted, game };
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
